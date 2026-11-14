// Monitor de chat do pregão (Seção 6 do PLANO_SAAS_CONLICITACAO.md).
//
// Regras puras, sem banco e sem rede. O que erra calado aqui: mensagem repetida
// virando alerta repetido, destaque que não pega "diligências" por causa do
// acento, janela do chat que nunca fecha (e vigia o portal para sempre) e
// portal bloqueado sendo apresentado como "sem mensagens".
const crypto = require('crypto');
const { normalizar } = require('./texto');

const MINUTO = 60 * 1000;
const HORA = 60 * MINUTO;

// A sessão pública começa no fim do recebimento de propostas (`fim_propostas`) — premissa nossa:
// a spec não fixa o horário da sessão e a coleta não traz outro campo; portal que abra depois
// só perde a hora de folga do começo, e o fim da janela (3 dias) cobre o resto.
// O chat vale de uma hora antes — o pregoeiro às vezes abre a sala e avisa — até
// três dias depois: sessão suspensa e retomada é comum, e passados três dias sem
// mensagem nova o painel solta a vaga em vez de vigiar o portal para sempre.
const ANTES_DA_SESSAO_MS = HORA;
const DEPOIS_DA_SESSAO_MS = 72 * HORA;

// Quanto esperar entre duas leituras, por situação. A seção 5.4 limita o ritmo
// por domínio (1,5 s entre chamadas); estes são os intervalos entre RODADAS.
const ESPERA_NA_SESSAO_MS = 5 * MINUTO;
const ESPERA_SEM_DATA_MS = HORA;
const ESPERA_BLOQUEADO_MS = 6 * HORA;
const ESPERA_ERRO_MS = 15 * MINUTO;

const STATUS = ['aguardando', 'ok', 'bloqueado', 'sem_consulta', 'erro', 'encerrado'];
const MENSAGEM_MAX = 2000;
const AUTOR_MAX = 120;

// Palavras que pedem atenção no chat (seção 6: "convocado", "anexo", "diligência",
// "prazo" e as que andam juntas delas). O padrão procura a raiz, sem acento e sem
// caixa: "convocada", "Convocamos", "DILIGÊNCIA" e "diligencias" são a mesma coisa.
const DESTAQUES = [
  { rotulo: 'convocado', padrao: /\bconvoc/ },
  { rotulo: 'anexo', padrao: /\banex/ },
  { rotulo: 'diligência', padrao: /\bdiligenc/ },
  { rotulo: 'prazo', padrao: /\bprazo/ },
  { rotulo: 'suspensão', padrao: /\bsuspen/ },
  { rotulo: 'reabertura', padrao: /\breabr/ },
  { rotulo: 'desclassificação', padrao: /\bdesclassific/ },
  { rotulo: 'habilitação', padrao: /\bhabilit/ },
  { rotulo: 'negociação', padrao: /\bnegocia/ },
  { rotulo: 'proposta ajustada', padrao: /\bproposta\s+(ajustada|readequada)|\bajust(e|ar)\b.*\bproposta/ },
  { rotulo: 'recurso', padrao: /\brecurs/ },
];

/** Palavras de destaque de um texto, na ordem da lista acima, sem repetir. */
function destaquesDe(texto) {
  const limpo = normalizar(texto);
  if (!limpo) return [];
  return DESTAQUES.filter((d) => d.padrao.test(limpo)).map((d) => d.rotulo);
}

/**
 * Mensagem como o adaptador devolveu → mensagem pronta para gravar, ou `null` se
 * não tem texto (linha de cabeçalho, separador, "digitando…").
 * O texto é dado de terceiro: entra como texto puro, nunca interpretado (CLAUDE.md).
 */
function normalizarMensagem(bruta = {}) {
  const texto = String(bruta.texto || '').replace(/\s+/g, ' ').trim();
  if (!texto) return null;
  const autor = String(bruta.autor || '').replace(/\s+/g, ' ').trim().slice(0, AUTOR_MAX) || null;
  const quando = bruta.enviada_em ? new Date(bruta.enviada_em) : null;
  return {
    autor,
    texto: texto.slice(0, MENSAGEM_MAX),
    enviada_em: quando && !Number.isNaN(quando.getTime()) ? quando : null,
  };
}

/**
 * Chaves únicas de uma leitura. A ocorrência entra na conta: duas mensagens
 * idênticas no mesmo minuto ("Aguardem.", "Aguardem.") são duas, e colapsá-las
 * esconderia uma. A ordem de uma leitura para outra é a do portal, então a
 * ocorrência do mesmo texto é estável.
 */
function comChaves(mensagens) {
  const vistas = new Map();
  const saida = [];
  for (const bruta of mensagens) {
    const m = normalizarMensagem(bruta);
    if (!m) continue;
    const base = `${m.autor || ''}|${m.texto}|${m.enviada_em ? m.enviada_em.toISOString() : ''}`;
    const n = (vistas.get(base) || 0) + 1;
    vistas.set(base, n);
    saida.push({
      ...m,
      chave: crypto.createHash('sha256').update(`${base}|${n}`, 'utf8').digest('hex'),
      destaques: destaquesDe(m.texto),
    });
  }
  return saida;
}

/**
 * Onde a licitação está em relação à janela do chat.
 *   'antes'    — ainda não é hora; `inicio` diz quando passa a ser
 *   'dentro'   — a sessão está acontecendo (ou pode estar)
 *   'depois'   — passou da janela; o chat se encerra
 *   'sem_data' — o portal não publicou o horário: olha de hora em hora
 */
function janelaDoChat(licitacao, agora = new Date()) {
  if (!licitacao || !licitacao.fim_propostas) return { estado: 'sem_data' };
  const fim = new Date(licitacao.fim_propostas).getTime();
  const inicio = fim - ANTES_DA_SESSAO_MS;
  const limite = fim + DEPOIS_DA_SESSAO_MS;
  const t = agora.getTime();
  if (t < inicio) return { estado: 'antes', inicio: new Date(inicio) };
  if (t > limite) return { estado: 'depois' };
  return { estado: 'dentro', inicio: new Date(inicio), limite: new Date(limite) };
}

/**
 * O que gravar depois de uma tentativa de leitura: status, aviso para a tela e
 * quando tentar de novo (`null` = nunca mais, a não ser que a pessoa religue).
 *
 * @param {{ resultado: 'ok'|'bloqueado'|'sem_consulta'|'erro', aviso?: string }} leitura
 */
function proximoPasso(leitura, janela, agora = new Date()) {
  const em = (ms) => new Date(agora.getTime() + ms);
  if (leitura.resultado === 'bloqueado') {
    return { status: 'bloqueado', aviso: leitura.aviso, proxima: em(ESPERA_BLOQUEADO_MS) };
  }
  if (leitura.resultado === 'sem_consulta') {
    return { status: 'sem_consulta', aviso: leitura.aviso, proxima: null };
  }
  if (leitura.resultado === 'erro') {
    return { status: 'erro', aviso: leitura.aviso, proxima: em(ESPERA_ERRO_MS) };
  }
  if (janela.estado === 'sem_data') return { status: 'ok', aviso: null, proxima: em(ESPERA_SEM_DATA_MS) };
  return { status: 'ok', aviso: null, proxima: em(ESPERA_NA_SESSAO_MS) };
}

/**
 * Texto do alerta de mensagens novas. Uma mensagem por leitura, não uma por
 * mensagem: a primeira leitura de um chat em andamento traz dezenas de linhas, e
 * dezenas de avisos seriam ruído que a pessoa aprende a ignorar.
 */
function alertaDeMensagens(novas, { orgao = null } = {}) {
  if (!novas.length) return null;
  const destacadas = novas.filter((m) => m.destaques.length);
  const palavras = [...new Set(destacadas.flatMap((m) => m.destaques))];
  const ultima = (destacadas.length ? destacadas : novas)[(destacadas.length ? destacadas : novas).length - 1];
  const trecho = ultima.texto.length > 160 ? `${ultima.texto.slice(0, 159)}…` : ultima.texto;
  const quantas = novas.length === 1 ? '1 mensagem nova' : `${novas.length} mensagens novas`;
  const onde = orgao ? ` — ${orgao}` : '';
  const atencao = palavras.length ? ` (atenção: ${palavras.join(', ')})` : '';
  return {
    // Vermelho só quando há palavra de destaque: convocação e diligência têm prazo curto.
    nivel: palavras.length ? 'vermelho' : 'atencao',
    mensagem: `Chat do pregão: ${quantas}${atencao}${onde}. Última: “${trecho}”`,
  };
}

/** Abas da tela. */
const ABAS = ['todos', 'nao_lidos', 'importantes', 'arquivados'];

/**
 * Condição SQL de cada aba sobre a linha de monitor agregada (apelidos do
 * serviço: `m` = monitoramentos, `r` = resumo das mensagens).
 */
const CONDICAO_DA_ABA = {
  todos: 'm.chat_arquivado = 0',
  nao_lidos: 'm.chat_arquivado = 0 AND COALESCE(r.nao_lidas, 0) > 0',
  importantes: 'COALESCE(r.importantes, 0) > 0',
  arquivados: 'm.chat_arquivado = 1',
};

/** Aba pedida na URL; qualquer coisa que não seja uma aba conhecida vira "todos". */
function abaValida(aba) {
  return ABAS.includes(aba) ? aba : 'todos';
}

// ------------------------------------------------------------ portais compatíveis

// O painel só lê chat onde a consulta é pública, sem login e sem CAPTCHA (seção
// 5.4 — nunca se autentica em portal de terceiro, nunca se resolve CAPTCHA). Esta
// lista diz, portal a portal, o que se SABE. O que não foi conferido diz isso — e
// não "compatível" por otimismo.
const SITUACOES_DO_PORTAL = {
  bloqueada: 'O portal só entrega o chat atrás de CAPTCHA ou de login. O painel não resolve CAPTCHA nem entra com a sua senha.',
  nao_ha: 'O portal não publica chat de sessão.',
  nao_verificada: 'Ainda não conferido: a existência de consulta pública do chat neste portal não foi verificada.',
  configuravel: 'Há consulta pública do chat em HTML: dá para configurar na tela de Fontes.',
};

const PORTAIS_CONHECIDOS = [
  {
    portal: 'Compras.gov.br (Comprasnet)',
    situacao: 'bloqueada',
    detalhe:
      'A página pública é uma aplicação em JavaScript e os dados chegam por uma API que exige token de hCaptcha ' +
      '(conferido em 07/11/2026, ver adaptadores/comprasgov.js). Abra o chat no portal, na mão.',
  },
  {
    portal: 'PNCP',
    situacao: 'nao_ha',
    detalhe: 'O PNCP publica o edital, os itens e o resultado — não o chat da sessão, que fica no portal de disputa.',
  },
  // Portais de disputa que o painel ainda não conferiu. Listados porque a pessoa
  // vai perguntar por eles; sem afirmar o que não se sabe.
  { portal: 'BLL Compras', situacao: 'nao_verificada' },
  { portal: 'Licitanet', situacao: 'nao_verificada' },
  { portal: 'Portal de Compras Públicas', situacao: 'nao_verificada' },
  { portal: 'BNC — Bolsa Nacional de Compras', situacao: 'nao_verificada' },
  { portal: 'CELIC-RS', situacao: 'nao_verificada' },
];

/** O catálogo com o texto padrão de cada situação preenchido. */
function catalogoDePortais() {
  return PORTAIS_CONHECIDOS.map((p) => ({
    ...p,
    explicacao: SITUACOES_DO_PORTAL[p.situacao],
    detalhe: p.detalhe || null,
  }));
}

module.exports = {
  ANTES_DA_SESSAO_MS,
  DEPOIS_DA_SESSAO_MS,
  ESPERA_NA_SESSAO_MS,
  ESPERA_SEM_DATA_MS,
  ESPERA_BLOQUEADO_MS,
  ESPERA_ERRO_MS,
  STATUS,
  ABAS,
  CONDICAO_DA_ABA,
  DESTAQUES,
  destaquesDe,
  normalizarMensagem,
  comChaves,
  janelaDoChat,
  proximoPasso,
  alertaDeMensagens,
  abaValida,
  catalogoDePortais,
  SITUACOES_DO_PORTAL,
};
