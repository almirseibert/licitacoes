// Planos e limites (Seção 3 do PLANO_SAAS_CONLICITACAO.md).
//
// O que cada plano libera mora em `planos.recursos` e `planos.limites` (JSON,
// migração 020) — aqui só se lê e se compara. A metade de cima deste arquivo é
// pura (testada sem banco em testes/limites.test.js); a de baixo lê o banco.
const { ehOperadora } = require('./escopo');

// Dias depois do `pago_ate` em que o painel ainda funciona inteiro — boleto
// compensa em até 3 dias úteis, e cortar o cliente por isso é injusto.
const DIAS_CARENCIA = 5;
const BYTES_POR_GB = 1024 ** 3;

// Nome do limite em português, para a mensagem de quem estourou.
const NOMES_LIMITE = {
  usuarios: 'usuários na equipe',
  palavras_chave: 'palavras-chave de busca',
  perfis_empresa: 'perfis de empresa',
  ia_resumos_mes: 'leituras de edital por IA neste mês',
  ia_perguntas_mes: 'perguntas ao edital neste mês',
  exportacoes_mes: 'exportações neste mês',
  cofre_gb: 'GB no cofre de documentos',
  monitoramentos: 'licitações acompanhadas',
  monitores_chat: 'monitores de chat',
  tokens_api: 'tokens de API',
};

const NOMES_RECURSO = {
  radar: 'Radar',
  boletim: 'Boletim diário',
  gestao: 'Gestão de licitações',
  documentos: 'Documentos',
  declaracoes: 'Declarações',
  alertas: 'Alertas',
  ia: 'Leitura por IA',
  acompanhamentos: 'Acompanhamentos',
  contratos: 'Contratos e atas',
  concorrentes: 'Concorrentes e órgãos',
  historico: 'Histórico de preços',
  api: 'API',
  estrategicas: 'Oportunidades estratégicas',
  mercado: 'Mercado',
  consultor_juridico: 'Consultor jurídico',
  relatorios: 'Relatórios e diagnóstico',
};

// Limites mensais vêm de `uso_mensal`; os outros são estoque, contados na hora.
const MENSAIS = ['ia_resumos_mes', 'ia_perguntas_mes', 'exportacoes_mes'];

// ------------------------------------------------------------------- puro

/** 'AAAA-MM-DD' de uma data (string DATE do mysql2 ou Date). */
function dia(valor) {
  if (!valor) return null;
  if (typeof valor === 'string') return valor.slice(0, 10);
  return new Date(valor).toISOString().slice(0, 10);
}

function somarDias(diaTexto, dias) {
  const d = new Date(`${diaTexto}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function diasEntre(deTexto, ateTexto) {
  return Math.round((Date.parse(`${ateTexto}T00:00:00Z`) - Date.parse(`${deTexto}T00:00:00Z`)) / 86400000);
}

function mesDe(agora = new Date()) {
  return agora.toISOString().slice(0, 7);
}

/**
 * Em que pé está a organização. `pode_escrever` falso deixa o painel em
 * leitura (o cliente vê os próprios dados para decidir renovar); `pode_ler`
 * falso só na suspensão.
 *
 * @param {{status:string, teste_ate?:string|null}} organizacao
 * @param {{pago_ate?:string|null}|null} assinatura
 */
function situacao(organizacao, assinatura, agora = new Date()) {
  const hoje = dia(agora);
  if (organizacao.status === 'suspensa') {
    return {
      codigo: 'suspensa', pode_ler: false, pode_escrever: false, dias_restantes: null,
      mensagem: 'Esta organização está suspensa. Fale com o suporte para reativar.',
    };
  }
  if (organizacao.status === 'teste') {
    const ate = dia(organizacao.teste_ate);
    if (!ate || ate >= hoje) {
      return {
        codigo: 'teste', pode_ler: true, pode_escrever: true,
        dias_restantes: ate ? diasEntre(hoje, ate) : null,
        mensagem: ate ? `Teste grátis até ${ate}.` : 'Teste grátis.',
      };
    }
    return {
      codigo: 'teste_vencido', pode_ler: true, pode_escrever: false, dias_restantes: 0,
      mensagem: 'O teste grátis terminou. Escolha um plano para continuar usando o painel — seus dados estão guardados.',
    };
  }
  // 'ativa'
  const pago = dia(assinatura && assinatura.pago_ate);
  if (!pago || somarDias(pago, DIAS_CARENCIA) >= hoje) {
    return {
      codigo: 'ativa', pode_ler: true, pode_escrever: true,
      dias_restantes: pago ? diasEntre(hoje, pago) : null,
      mensagem: pago && pago < hoje ? `Pagamento em aberto desde ${pago}. Regularize para não perder o acesso.` : '',
    };
  }
  return {
    codigo: 'vencida', pode_ler: true, pode_escrever: false, dias_restantes: 0,
    mensagem: `A assinatura venceu em ${pago}. Renove para voltar a editar — seus dados estão guardados.`,
  };
}

function temRecurso(plano, recurso) {
  return Array.isArray(plano && plano.recursos) && plano.recursos.includes(recurso);
}

/**
 * Cabe mais `acrescimo` dentro do limite? `null` = sem teto; ausente = 0.
 * `cofre_gb` compara em bytes (o `usado` chega em bytes).
 */
function cabe(limites, chave, usado, acrescimo = 1) {
  // Falha fechada: sem plano, ou chave que o plano não lista, vale zero —
  // igual a `temRecurso`. Só o `null` explícito é "sem teto".
  const bruto = limites && chave in limites ? limites[chave] : 0;
  if (bruto === null) return { ok: true, limite: null, usado };
  const limite = chave === 'cofre_gb' ? Number(bruto) * BYTES_POR_GB : Number(bruto);
  return { ok: Number(usado) + Number(acrescimo) <= limite, limite, usado: Number(usado) };
}

/** O plano mais barato (pela ordem) que tem o recurso, ou que comporta o limite. */
function planoQueResolve(planos, { recurso, chave, precisa } = {}) {
  const ordenados = [...planos].sort((a, b) => a.ordem - b.ordem);
  return (
    ordenados.find((p) => {
      if (recurso) return temRecurso(p, recurso);
      const r = cabe(p.limites, chave, precisa, 0);
      return r.ok;
    }) || null
  );
}

function sugestao(planoAtual, alvo) {
  if (!alvo || (planoAtual && alvo.id === planoAtual.id)) return 'Fale com o suporte para ampliar.';
  return `Passe para o plano ${alvo.nome} em Assinatura.`;
}

/** Corpo do 402 de recurso fora do plano. */
function erroRecurso(planoAtual, planos, recurso) {
  const alvo = planoQueResolve(planos, { recurso });
  return {
    erro: `${NOMES_RECURSO[recurso] || recurso} não faz parte do plano ${planoAtual ? planoAtual.nome : 'atual'}. ${sugestao(planoAtual, alvo)}`,
    upgrade: { recurso, plano_sugerido: alvo ? alvo.codigo : null },
  };
}

/** Corpo do 402 de limite estourado. `usado`/`limite` em bytes no cofre. */
function erroLimite(planoAtual, planos, chave, { usado, limite, acrescimo = 1 }) {
  const alvo = planoQueResolve(planos, { chave, precisa: Number(usado) + Number(acrescimo) });
  const mostrar = (v) => (chave === 'cofre_gb' ? `${(v / BYTES_POR_GB).toFixed(2).replace('.', ',')}` : String(v));
  return {
    erro:
      `Seu plano ${planoAtual ? planoAtual.nome : ''} permite ${mostrar(limite)} ${NOMES_LIMITE[chave] || chave}` +
      ` e você já usa ${mostrar(usado)}. ${sugestao(planoAtual, alvo)}`,
    upgrade: { limite: chave, plano_sugerido: alvo && alvo.id !== (planoAtual && planoAtual.id) ? alvo.codigo : null },
  };
}

function lerJson(valor, padrao) {
  if (valor === null || valor === undefined) return padrao;
  if (typeof valor !== 'string') return valor;
  try {
    return JSON.parse(valor);
  } catch {
    return padrao;
  }
}

function montarPlano(linha) {
  return {
    id: linha.id,
    codigo: linha.codigo,
    nome: linha.nome,
    descricao: linha.descricao,
    preco_mensal_centavos: linha.preco_mensal_centavos,
    preco_anual_centavos: linha.preco_anual_centavos,
    ordem: linha.ordem,
    recursos: lerJson(linha.recursos, []),
    limites: lerJson(linha.limites, {}),
  };
}

// ------------------------------------------------------------------ banco
// O pool é carregado na hora: os testes deste módulo rodam sem banco.
const db = () => require('../config/db');

const VALIDADE_CACHE_MS = 15000;
const cache = new Map(); // organizacaoId -> { dados, em }
let cachePlanos = null;

function esquecer(organizacaoId) {
  if (organizacaoId === undefined) {
    cache.clear();
    cachePlanos = null;
  } else {
    cache.delete(Number(organizacaoId));
  }
}

async function listarPlanos() {
  if (cachePlanos && Date.now() - cachePlanos.em < VALIDADE_CACHE_MS) return cachePlanos.dados;
  const [linhas] = await db().query('SELECT * FROM planos WHERE ativo = 1 ORDER BY ordem');
  const dados = linhas.map(montarPlano);
  // Corrida inofensiva: duas leituras simultâneas gravam o mesmo catálogo.
  // eslint-disable-next-line require-atomic-updates
  cachePlanos = { dados, em: Date.now() };
  return dados;
}

/** Organização + assinatura + plano + situação, com cache curto. */
async function daOrganizacao(organizacaoId) {
  const id = Number(organizacaoId);
  const guardado = cache.get(id);
  if (guardado && Date.now() - guardado.em < VALIDADE_CACHE_MS) return guardado.dados;

  const [[linha]] = await db().query(
    `SELECT o.id, o.nome, o.status, o.teste_ate,
            a.ciclo, a.pago_ate, a.provedor, a.plano_pedido_id, a.ciclo_pedido, a.pedido_em,
            p.id AS plano_id
       FROM organizacoes o
       LEFT JOIN assinaturas a ON a.organizacao_id = o.id
       LEFT JOIN planos p ON p.id = a.plano_id
      WHERE o.id = ?`,
    [id]
  );
  if (!linha) return null;
  const planos = await listarPlanos();
  const plano = planos.find((p) => p.id === linha.plano_id) || null;
  const dados = {
    organizacao: { id: linha.id, nome: linha.nome, status: linha.status, teste_ate: linha.teste_ate },
    assinatura: {
      ciclo: linha.ciclo, pago_ate: linha.pago_ate, provedor: linha.provedor,
      pedido: linha.plano_pedido_id
        ? { plano: (planos.find((p) => p.id === linha.plano_pedido_id) || {}).codigo, ciclo: linha.ciclo_pedido, em: linha.pedido_em }
        : null,
    },
    plano,
    planos,
    situacao: situacao(linha, linha),
    // A operadora (Studio Mythos) não tem teto: é ela quem opera o serviço.
    isenta: ehOperadora(id),
  };
  cache.set(id, { dados, em: Date.now() });
  return dados;
}

/** Quanto a organização usa agora de cada limite (estoque + mês corrente). */
async function uso(organizacaoId, agora = new Date()) {
  const id = Number(organizacaoId);
  const [[estoque]] = await db().query(
    `SELECT
       (SELECT COUNT(*) FROM organizacao_membros WHERE organizacao_id = ?)
       + (SELECT COUNT(*) FROM convites WHERE organizacao_id = ? AND aceito_em IS NULL AND expira_em > NOW()) AS usuarios,
       (SELECT COUNT(*) FROM palavras_chave WHERE organizacao_id = ?) AS palavras_chave,
       (SELECT COUNT(*) FROM empresa_perfis WHERE organizacao_id = ?) AS perfis_empresa,
       (SELECT COUNT(*) FROM monitoramentos WHERE organizacao_id = ? AND ativo = 1) AS monitoramentos,
       COALESCE((SELECT SUM(tamanho_bytes) FROM empresa_documentos WHERE organizacao_id = ?), 0)
       + COALESCE((SELECT SUM(tamanho_bytes) FROM licitacao_anexos WHERE organizacao_id = ?), 0)
       + COALESCE((SELECT SUM(tamanho_bytes) FROM pacotes WHERE organizacao_id = ?), 0) AS cofre_gb`,
    [id, id, id, id, id, id, id, id]
  );
  const [mensais] = await db().query(
    'SELECT recurso, quantidade FROM uso_mensal WHERE organizacao_id = ? AND mes = ?',
    [id, mesDe(agora)]
  );
  const resultado = { monitores_chat: 0, tokens_api: 0 };
  for (const [chave, valor] of Object.entries(estoque)) resultado[chave] = Number(valor || 0);
  for (const chave of MENSAIS) resultado[chave] = 0;
  for (const m of mensais) resultado[m.recurso] = Number(m.quantidade);
  return resultado;
}

async function registrarUso(organizacaoId, recurso, quantidade = 1, agora = new Date()) {
  await db().query(
    `INSERT INTO uso_mensal (organizacao_id, mes, recurso, quantidade) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE quantidade = quantidade + VALUES(quantidade)`,
    [Number(organizacaoId), mesDe(agora), recurso, quantidade]
  );
}

/**
 * Confere um limite antes de gastar. Devolve `null` se cabe, ou o corpo do
 * 402 se não cabe — a rota decide o que fazer (em geral, responder 402).
 * `usadoAtual` evita reler o banco quando a rota já sabe o número.
 */
async function conferir(organizacaoId, chave, { acrescimo = 1, usadoAtual } = {}) {
  const dados = await daOrganizacao(organizacaoId);
  if (!dados || dados.isenta) return null;
  const usado = usadoAtual !== undefined ? usadoAtual : (await uso(organizacaoId))[chave];
  const r = cabe(dados.plano && dados.plano.limites, chave, usado, acrescimo);
  if (r.ok) return null;
  return erroLimite(dados.plano, dados.planos, chave, { usado, limite: r.limite, acrescimo });
}

// -------------------------------------------------------------- middlewares

function logPlano(req, corpo) {
  console.warn(`Plano: organização ${req.organizacaoId} recebeu 402 em ${req.method} ${req.originalUrl} — ${corpo.erro}`);
}

/**
 * Situação da assinatura em toda rota de dado: suspensa não entra; teste
 * vencido ou assinatura vencida só lê. A tela de Assinatura fica fora disto,
 * para quem venceu conseguir renovar.
 */
async function assinaturaValida(req, res, next) {
  try {
    const dados = await daOrganizacao(req.organizacaoId);
    if (!dados || dados.isenta) return next();
    const s = dados.situacao;
    const leitura = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (s.pode_escrever || (leitura && s.pode_ler)) return next();
    const corpo = { erro: s.mensagem, situacao: s.codigo, upgrade: { plano_sugerido: null } };
    logPlano(req, corpo);
    return res.status(402).json(corpo);
  } catch (erro) {
    return next(erro);
  }
}

/** Uso: `app.use('/api/contratos', ..., exigirRecurso('contratos'), rotas)`. */
function exigirRecurso(recurso) {
  return async (req, res, next) => {
    try {
      const dados = await daOrganizacao(req.organizacaoId);
      if (!dados || dados.isenta || temRecurso(dados.plano, recurso)) return next();
      const corpo = erroRecurso(dados.plano, dados.planos, recurso);
      logPlano(req, corpo);
      return res.status(402).json(corpo);
    } catch (erro) {
      return next(erro);
    }
  };
}

/** Uso: `rotas.post('/', exigirLimite('palavras_chave'), handler)`. */
function exigirLimite(chave, acrescimo = 1) {
  return async (req, res, next) => {
    try {
      const corpo = await conferir(req.organizacaoId, chave, { acrescimo });
      if (!corpo) return next();
      logPlano(req, corpo);
      return res.status(402).json(corpo);
    } catch (erro) {
      return next(erro);
    }
  };
}

module.exports = {
  DIAS_CARENCIA,
  BYTES_POR_GB,
  NOMES_LIMITE,
  NOMES_RECURSO,
  MENSAIS,
  situacao,
  temRecurso,
  cabe,
  planoQueResolve,
  erroRecurso,
  erroLimite,
  montarPlano,
  mesDe,
  somarDias,
  listarPlanos,
  daOrganizacao,
  uso,
  registrarUso,
  conferir,
  esquecer,
  assinaturaValida,
  exigirRecurso,
  exigirLimite,
};
