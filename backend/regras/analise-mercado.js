// Concorrentes, histórico e mercado (Seção 13 do PLANO_SAAS_CONLICITACAO.md).
//
// Regras puras, sem banco e sem rede: como o segmento da organização vira
// filtro de SQL, como um mês vira período, por que uma licitação foi perdida e
// o que recomendar. O que erra calado aqui (segmento vazio virando "sem
// filtro", perda sem valor virando "perdeu por preço", mês de 31 dias cortado)
// está em `testes/analise-mercado.test.js`.

const { dataValida } = require('./gestao');

// Teto de termos por análise: cada termo é uma coluna a mais na varredura do
// "por produto". O segmento maior hoje tem 16; 40 dá folga sem virar SQL de 1 MB.
const TERMOS_MAX = 40;

// Período padrão da análise e dos recorrentes quando a tela não manda datas.
const DIAS_PADRAO = 30;
const DIAS_RECORRENTES = 90;
const JANELAS_RECORRENTES = [30, 90, 180, 365];

/**
 * Motivos de desclassificação e inabilitação. Conferido no PNCP em 14/11/2026
 * (`/api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seq}/itens/{n}/resultados`): o
 * resultado do item publica SÓ o fornecedor homologado, com `motivoCancelamento`
 * para resultado cancelado — quem foi desclassificado ou inabilitado, e por quê,
 * fica na ata da sessão do portal de disputa (o Compras.gov.br a mostra atrás
 * de CAPTCHA, seção 5.2). Sem o dado, a tela diz isto em vez de inventar um
 * percentual.
 */
const DESCLASSIFICACAO = {
  disponivel: false,
  motivo:
    'O PNCP publica só o fornecedor vencedor de cada item, não quem foi desclassificado ou ' +
    'inabilitado nem o motivo. Esse dado fica na ata da sessão do portal de disputa.',
};

// Cada letra do termo aceita a forma com e sem acento, maiúscula e minúscula:
// o PNCP publica tanto "Periféricos" quanto "PERIFERICOS".
const VARIANTES = {
  a: 'aáàâãAÁÀÂÃ', e: 'eéèêEÉÈÊ', i: 'iíìîIÍÌÎ', o: 'oóòôõOÓÒÔÕ', u: 'uúùûüUÚÙÛÜ', c: 'cçCÇ',
};
const PLURAL = '([sS]|[eE][sS])?';
const semAcento = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Termo → expressão regular de PALAVRA INTEIRA (com plural -s/-es), no
 * dialeto POSIX que o MySQL 8 (ICU) e o MariaDB (PCRE) entendem.
 *
 * Por que não LIKE '%termo%' (o Radar casa por trecho): na conferência da
 * Seção 13, "monitor" achou 14 contratos de vigilância e videomonitoramento
 * entre os 24 do segmento de informática — R$ 3,3 milhões de R$ 3,4 milhões.
 * No Radar a pessoa olha cada linha; num relatório agregado o falso positivo
 * some dentro do total.
 */
function padraoDePalavra(termo) {
  const corpo = [...semAcento(String(termo).trim().replace(/\s+/g, ' '))]
    .map((ch) => {
      // Plural em cada palavra: "cabo de rede" acha "cabos de rede".
      if (ch === ' ') return `${PLURAL}[[:space:]]+`;
      if (VARIANTES[ch]) return `[${VARIANTES[ch]}]`;
      if (/[a-z]/.test(ch)) return `[${ch}${ch.toUpperCase()}]`;
      if (/[0-9]/.test(ch)) return ch;
      // Pontuação do termo (hífen, ponto, barra) vira classe literal.
      return `[${'[]\\^-'.includes(ch) ? `\\${ch}` : ch}]`;
    })
    .join('');
  return `(^|[^[:alnum:]])${corpo}${PLURAL}($|[^[:alnum:]])`;
}

/** Termos de busca → condição `(a.objeto REGEXP ? OR ...)`. Lista vazia = nada casa. */
function condicaoDeTermos(termos, coluna = 'a.objeto') {
  const limpos = [...new Set((termos || []).map((t) => String(t || '').trim()).filter(Boolean))].slice(0, TERMOS_MAX);
  // Segmento sem termo não pode virar "sem filtro": viraria o mercado inteiro
  // rotulado com o nome do segmento.
  if (!limpos.length) return { sql: '1 = 0', valores: [], termos: [] };
  return {
    sql: `(${limpos.map(() => `${coluna} REGEXP ?`).join(' OR ')})`,
    valores: limpos.map(padraoDePalavra),
    termos: limpos,
  };
}

/** Lista que veio de uma coluna JSON (string no MariaDB, array no MySQL). */
function listaJson(valor) {
  if (Array.isArray(valor)) return valor;
  if (typeof valor !== 'string') return [];
  try {
    const lida = JSON.parse(valor);
    return Array.isArray(lida) ? lida : [];
  } catch {
    return [];
  }
}

/** '2026-02' → { de: '2026-02-01', ate: '2026-02-28' }; inválido → null. */
function periodoDoMes(mes) {
  const achado = /^(\d{4})-(\d{2})$/.exec(String(mes || ''));
  if (!achado) return null;
  const ano = Number(achado[1]);
  const m = Number(achado[2]);
  if (m < 1 || m > 12) return null;
  const ultimo = new Date(Date.UTC(ano, m, 0)).getUTCDate();
  return { de: `${achado[1]}-${achado[2]}-01`, ate: `${achado[1]}-${achado[2]}-${String(ultimo).padStart(2, '0')}` };
}

/** Dia (AAAA-MM-DD) menos N dias, em calendário, sem fuso. */
function diasAntes(dia, n) {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Período pedido pela tela: `mes` vence `de`/`ate`; sem nada, os últimos
 * `padrao` dias até `hoje`. Datas inválidas são ignoradas, não viram erro.
 */
function periodoPedido(q = {}, { hoje, padrao = DIAS_PADRAO }) {
  const doMes = periodoDoMes(q.mes);
  if (doMes) return doMes;
  const ate = dataValida(q.ate) ? q.ate : hoje;
  const de = dataValida(q.de) ? q.de : diasAntes(ate, padrao - 1);
  return de <= ate ? { de, ate } : { de: ate, ate: de };
}

const RECOMENDACOES = {
  sem_proposta: {
    rotulo: 'Sem o valor da sua proposta',
    recomendacao:
      'Registre o valor proposto ao mover o card para "Proposta enviada": sem ele o painel não mede a distância do vencedor.',
  },
  sem_resultado: {
    rotulo: 'Valor do vencedor não publicado',
    recomendacao:
      'Busque o resultado na aba Concorrentes da licitação ou digite o valor final à mão — o PNCP ainda não publicou.',
  },
  preco_por_pouco: {
    rotulo: 'Preço — perdeu por pouco (até 5%)',
    recomendacao:
      'A diferença cabe numa revisão de margem ou de custo de frete/insumo. Confira o preço de referência antes da próxima.',
  },
  preco: {
    rotulo: 'Preço acima do vencedor',
    recomendacao:
      'A distância é estrutural, não de margem: confira o preço de referência e os fornecedores do item antes de disputar de novo.',
  },
  nao_preco: {
    rotulo: 'Não foi preço',
    recomendacao:
      'Seu valor era igual ou menor que o do vencedor: a perda veio de habilitação, desclassificação ou desempate. ' +
      'O PNCP não publica o motivo — confira a ata da sessão no portal e o checklist de documentos.',
  },
};

// "Por pouco" = até 5% acima do vencedor. É o limite em que o desempate
// ficto da ME/EPP (LC 123, art. 44, §2º) ainda alcança no pregão — passou
// disso, não é margem que se ajusta na hora do lance.
const POR_POUCO = 0.05;

/**
 * Por que uma licitação perdida foi perdida, com o que o painel sabe:
 * a proposta da organização (`valor_proposto`) contra o valor do vencedor
 * (`valor_final`). Sem um dos dois, o motivo é a falta do dado — nunca "preço".
 */
function motivoDaPerda({ valor_proposto: proposto, valor_final: vencedor, beneficio_me: beneficioMe } = {}) {
  const meu = Number(proposto);
  const dele = Number(vencedor);
  let chave;
  let diferenca = null;
  if (!(meu > 0)) chave = 'sem_proposta';
  else if (!(dele > 0)) chave = 'sem_resultado';
  else {
    diferenca = (meu - dele) / dele;
    if (diferenca <= 0) chave = 'nao_preco';
    else chave = diferenca <= POR_POUCO ? 'preco_por_pouco' : 'preco';
  }
  const base = RECOMENDACOES[chave];
  let recomendacao = base.recomendacao;
  if (chave === 'nao_preco' && Number(beneficioMe)) {
    recomendacao += ' A licitação tinha benefício ME/EPP: o desempate por porte pode ter decidido.';
  }
  return {
    motivo: chave,
    rotulo: base.rotulo,
    diferenca: diferenca === null ? null : Math.round(diferenca * 10000) / 10000,
    recomendacao,
  };
}

/**
 * Agrupa as perdas por motivo, do mais frequente ao menos, e devolve a
 * recomendação principal: a do motivo que mais se repete, contando só os que
 * dizem algo do jogo (falta de dado vem por último no desempate).
 */
function resumirPerdas(perdas) {
  const grupos = new Map();
  for (const p of perdas) {
    if (!grupos.has(p.motivo)) {
      grupos.set(p.motivo, { motivo: p.motivo, rotulo: p.rotulo, recomendacao: RECOMENDACOES[p.motivo].recomendacao, quantidade: 0, valor: 0, diferencas: [] });
    }
    const g = grupos.get(p.motivo);
    g.quantidade += 1;
    g.valor += Number(p.valor_estimado || 0);
    if (p.diferenca !== null) g.diferencas.push(p.diferenca);
  }
  const faltaDado = (m) => m === 'sem_proposta' || m === 'sem_resultado';
  const motivos = [...grupos.values()]
    .map(({ diferencas, ...g }) => ({
      ...g,
      valor: Math.round(g.valor * 100) / 100,
      percentual: perdas.length ? Math.round((g.quantidade / perdas.length) * 1000) / 10 : 0,
      diferenca_media: diferencas.length
        ? Math.round((diferencas.reduce((s, d) => s + d, 0) / diferencas.length) * 10000) / 10000
        : null,
    }))
    .sort((a, b) => b.quantidade - a.quantidade || faltaDado(a.motivo) - faltaDado(b.motivo));
  const principal = motivos.find((m) => !faltaDado(m.motivo)) || motivos[0] || null;
  return { motivos, principal };
}

module.exports = {
  DESCLASSIFICACAO,
  DIAS_PADRAO,
  DIAS_RECORRENTES,
  JANELAS_RECORRENTES,
  TERMOS_MAX,
  condicaoDeTermos,
  padraoDePalavra,
  listaJson,
  periodoDoMes,
  periodoPedido,
  motivoDaPerda,
  resumirPerdas,
};
