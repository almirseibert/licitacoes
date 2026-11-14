// Gestão por licitação (Seção 8 do PLANO_SAAS_CONLICITACAO.md): tarefas da
// equipe e andamentos do processo. Funções puras — sem banco, testáveis.

// As quatro visões da tela de Tarefas. "Sem prazo" vai para futuras: não está
// atrasada, e esconder a tarefa seria pior do que mostrá-la sem data.
const VISOES = ['atrasadas', 'hoje', 'futuras', 'concluidas'];

// "Hoje" é o dia em Brasília, não o do relógio do banco (UTC): às 22 h de
// Brasília o CURDATE() já é amanhã e a tarefa de hoje viraria "atrasada".
const FUSO = 'America/Sao_Paulo';

/** Dia "AAAA-MM-DD" de um instante, no fuso de Brasília. */
const FORMATO_DIA = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });
function diaNoFuso(instante = new Date()) {
  return FORMATO_DIA.format(instante);
}

/**
 * Início e fim de um período de dias de Brasília, como instantes UTC
 * "AAAA-MM-DD HH:MM:SS" para comparar com DATETIME (o banco guarda em UTC).
 * Brasília não tem horário de verão desde 2019: -03:00 o ano inteiro.
 */
function periodoEmUtc(de, ate) {
  const emUtc = (texto) => new Date(texto).toISOString().slice(0, 19).replace('T', ' ');
  return { inicio: emUtc(`${de}T00:00:00-03:00`), fim: emUtc(`${ate}T23:59:59-03:00`) };
}

/**
 * O WHERE de cada visão, comparando dia com dia. `hoje` entra como literal
 * porque passa por `dataValida` antes — nada além de AAAA-MM-DD chega ao SQL.
 */
function sqlVisao(visao, hoje) {
  if (!dataValida(hoje)) throw new Error(`Dia inválido para a visão: ${hoje}`);
  const d = `'${hoje}'`;
  return {
    atrasadas: `(t.status = 'aberta' AND t.prazo < ${d})`,
    hoje: `(t.status = 'aberta' AND t.prazo = ${d})`,
    futuras: `(t.status = 'aberta' AND (t.prazo > ${d} OR t.prazo IS NULL))`,
    concluidas: "(t.status = 'concluida')",
  }[visao] || null;
}

// Tipos de andamento — os mesmos da Seção 9, para o aviso por tipo filtrar.
const TIPOS_ANDAMENTO = [
  { chave: 'esclarecimento', rotulo: 'Esclarecimento' },
  { chave: 'aviso', rotulo: 'Aviso' },
  { chave: 'impugnacao', rotulo: 'Impugnação' },
  { chave: 'recurso', rotulo: 'Recurso' },
  { chave: 'status', rotulo: 'Mudança de status' },
  { chave: 'resultado', rotulo: 'Resultado' },
  { chave: 'outro', rotulo: 'Outro' },
];
const CHAVES_ANDAMENTO = new Set(TIPOS_ANDAMENTO.map((t) => t.chave));

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-11-13" válido de verdade (não 2026-02-30). */
function dataValida(texto) {
  if (!DATA.test(String(texto))) return false;
  const [a, m, d] = String(texto).split('-').map(Number);
  const data = new Date(Date.UTC(a, m - 1, d));
  return data.getUTCFullYear() === a && data.getUTCMonth() === m - 1 && data.getUTCDate() === d;
}

/**
 * Dia "AAAA-MM-DD" de um valor: DATE chega do banco como texto (é dia de
 * calendário, sem fuso); DATETIME chega como instante e vira o dia de Brasília.
 */
/** Dias inteiros entre dois dias 'AAAA-MM-DD' (até − de). */
function diasEntre(deTexto, ateTexto) {
  return Math.round((Date.parse(`${ateTexto}T00:00:00Z`) - Date.parse(`${deTexto}T00:00:00Z`)) / 86400000);
}

function dia(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return diaNoFuso(valor);
  return String(valor).slice(0, 10);
}

/** Em que visão a tarefa cai, dado o dia de hoje ("AAAA-MM-DD"). */
function visaoDaTarefa(tarefa, hoje) {
  if (tarefa.status === 'concluida') return 'concluidas';
  const prazo = dia(tarefa.prazo);
  if (!prazo || prazo > hoje) return 'futuras';
  return prazo === hoje ? 'hoje' : 'atrasadas';
}

/**
 * Lê e valida o corpo de uma tarefa. `parcial` = PATCH (só o que veio).
 * Devolve { campos } ou { erro }. Não decide se o responsável é da
 * organização — isso pede banco e fica na rota.
 */
function lerTarefa(corpo = {}, { parcial = false } = {}) {
  const campos = {};

  if (corpo.titulo !== undefined || !parcial) {
    const titulo = String(corpo.titulo || '').replace(/\s+/g, ' ').trim();
    if (!titulo) return { erro: 'Dê um título à tarefa.' };
    campos.titulo = titulo.slice(0, 200);
  }
  if (corpo.descricao !== undefined) {
    const descricao = String(corpo.descricao || '').trim();
    campos.descricao = descricao ? descricao.slice(0, 4000) : null;
  }
  if (corpo.prazo !== undefined) {
    if (corpo.prazo === null || corpo.prazo === '') campos.prazo = null;
    else if (!dataValida(corpo.prazo)) return { erro: 'Prazo inválido. Use uma data no formato dia/mês/ano.' };
    else campos.prazo = corpo.prazo;
  }
  for (const chave of ['responsavel_id', 'licitacao_id']) {
    if (corpo[chave] === undefined) continue;
    if (corpo[chave] === null || corpo[chave] === '') {
      campos[chave] = null;
      continue;
    }
    const id = Number(corpo[chave]);
    if (!Number.isInteger(id) || id <= 0) {
      return { erro: chave === 'responsavel_id' ? 'Responsável inválido.' : 'Licitação inválida.' };
    }
    campos[chave] = id;
  }
  if (corpo.status !== undefined) {
    if (!['aberta', 'concluida'].includes(corpo.status)) {
      return { erro: 'Situação da tarefa inválida. Use aberta ou concluida.' };
    }
    campos.status = corpo.status;
  }

  if (parcial && !Object.keys(campos).length) return { erro: 'Nada para atualizar.' };
  return { campos };
}

/** Lê e valida um andamento. `ocorrido_em` vazio = agora. */
function lerAndamento(corpo = {}) {
  const texto = String(corpo.texto || '').trim();
  if (!texto) return { erro: 'Descreva o andamento.' };
  const tipo = corpo.tipo || 'outro';
  if (!CHAVES_ANDAMENTO.has(tipo)) {
    return { erro: `Tipo de andamento inválido. Use um de: ${[...CHAVES_ANDAMENTO].join(', ')}.` };
  }
  // O banco guarda DATETIME em UTC (config/db.js, timezone 'Z'): a tela manda
  // o instante em ISO COM fuso (sem fuso, o servidor leria no dele), e ele é
  // gravado convertido.
  let ocorridoEm = null;
  if (corpo.ocorrido_em) {
    const texto = String(corpo.ocorrido_em);
    const instante = new Date(texto);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(texto) || !dataValida(texto.slice(0, 10)) || Number.isNaN(instante.getTime())) {
      return { erro: 'Data do andamento inválida.' };
    }
    if (instante.getTime() > Date.now() + 5 * 60 * 1000) {
      return { erro: 'O andamento é do que já aconteceu: a data não pode estar no futuro.' };
    }
    ocorridoEm = instante.toISOString().slice(0, 19).replace('T', ' ');
  }
  return { campos: { tipo, texto: texto.slice(0, 4000), ocorrido_em: ocorridoEm } };
}

module.exports = {
  VISOES,
  FUSO,
  diaNoFuso,
  periodoEmUtc,
  sqlVisao,
  TIPOS_ANDAMENTO,
  dataValida,
  dia,
  diasEntre,
  visaoDaTarefa,
  lerTarefa,
  lerAndamento,
};
