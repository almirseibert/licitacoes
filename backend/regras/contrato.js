// Marcos do contrato e faixas da LC 123 (seção 28).
//
// O painel não acompanha execução de contrato: ele avisa antes de cada prazo
// que tem multa. São sete marcos, e cada um nasce de uma regra legal ou de um
// prazo típico — nunca de um palpite silencioso. O que é prazo típico está
// marcado como tal, e a tela repete a ressalva, porque o edital pode fixar
// outro e aí o número do edital ganha do nosso.

const prazos = require('./prazos');

// Faixas de receita bruta anual da LC 123, art. 3º.
//
// ME e EPP mantêm os mesmos benefícios em licitação — exclusividade até
// R$ 80 mil, cota de até 25% e empate ficto —, então cruzar de ME para EPP não
// tira nada. Mas muda o enquadramento declarado, e a declaração precisa
// acompanhar a realidade: declarar ME faturando R$ 1 milhão é declaração falsa.
const FAIXAS = [
  { chave: 'ME', rotulo: 'Microempresa', teto: 360000 },
  { chave: 'EPP', rotulo: 'Empresa de pequeno porte', teto: 4800000 },
];

// Acima do teto da EPP não há faixa de ME/EPP: a empresa perde os benefícios.
const ACIMA = { chave: 'acima', rotulo: 'Acima do limite da EPP', teto: null };

// Percentual da faixa a partir do qual o painel avisa (seção 28.3).
const AVISO_FAIXA = 0.8;

// Garantia contratual: até 5% do valor do contrato (Lei 14.133, art. 98).
const GARANTIA_PERCENTUAL = 0.05;

// Prazos típicos, em dias. Os que a lei fixa estão ditos em `nota`; os outros
// são o costume dos editais, e a nota diz que são.
const PRAZO_ASSINATURA_DIAS_UTEIS = 5;
const PRAZO_GARANTIA_DIAS_UTEIS = 10;
const PRAZO_PAGAMENTO_DIAS = 30;
const AVISO_RENOVACAO_DIAS = 90;

/**
 * Um valor virado dia de calendário no fuso local.
 *
 * As duas armadilhas de sempre, as mesmas da seção 25.1: `new Date(null)` é
 * 1970, não data inválida, e `new Date` de data pura é meia-noite UTC, que em
 * Brasília é o dia anterior.
 */
function diaDe(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (!(valor instanceof Date)) {
    const puro = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(valor));
    if (puro) return new Date(Number(puro[1]), Number(puro[2]) - 1, Number(puro[3]));
  }
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Dia de calendário `dias` dias corridos antes de `referencia`. */
function diasCorridosAntes(referencia, dias) {
  const base = diaDe(referencia);
  if (!base) return null;
  base.setDate(base.getDate() - dias);
  return prazos.chaveDia(base);
}

/** Dia de calendário `dias` dias corridos depois de `referencia`. */
function diasCorridosDepois(referencia, dias) {
  const base = diaDe(referencia);
  if (!base) return null;
  base.setDate(base.getDate() + dias);
  return prazos.chaveDia(base);
}

/**
 * Os sete marcos da seção 28.3, na ordem em que acontecem.
 *
 * `calcular` recebe o que se conhece do contrato e devolve a data prevista, ou
 * null quando falta a data de que ela depende. Null não é falha: é o marco
 * entrando na lista sem data, para você preencher. Datar um marco a partir de
 * uma data inventada seria pior — alerta errado só ensina a ignorar alerta.
 */
const MARCOS = [
  {
    tipo: 'assinatura',
    titulo: 'Assinar o contrato ou retirar a nota de empenho',
    ordem: 1,
    // Contado da convocação do órgão, que é o que se sabe quando o card entra
    // em "Ganhamos". Prazo típico: a lei manda o edital fixá-lo, não fixa ela.
    calcular: ({ convocado_em, diasUteis }) => diasUteis(convocado_em, PRAZO_ASSINATURA_DIAS_UTEIS),
    nota: `prazo típico de ${PRAZO_ASSINATURA_DIAS_UTEIS} dias úteis da convocação — confira no edital`,
  },
  {
    tipo: 'garantia',
    titulo: 'Apresentar a garantia contratual',
    ordem: 2,
    // Só nasce quando o edital exige garantia.
    quando: ({ garantia_exigida }) => Boolean(Number(garantia_exigida)),
    calcular: ({ assinado_em, convocado_em, diasUteis }) =>
      diasUteis(assinado_em || convocado_em, PRAZO_GARANTIA_DIAS_UTEIS),
    valor: ({ valor }) => (valor ? Math.round(Number(valor) * GARANTIA_PERCENTUAL * 100) / 100 : null),
    nota: `até 5% do valor do contrato (Lei 14.133, art. 98), prazo típico de ${PRAZO_GARANTIA_DIAS_UTEIS} dias úteis`,
  },
  {
    tipo: 'entrega',
    titulo: 'Entregar ou iniciar a execução',
    ordem: 3,
    // O início da vigência é a referência honesta. Sem ela o marco fica sem
    // data, porque prazo de entrega é do edital e o painel não o lê.
    calcular: ({ vigencia_inicio }) => {
      const dia = diaDe(vigencia_inicio);
      return dia ? prazos.chaveDia(dia) : null;
    },
    nota: 'o prazo de entrega é do edital; preencha com o que ele fixar',
  },
  {
    tipo: 'aceite',
    titulo: 'Aceite ou recebimento definitivo',
    ordem: 4,
    calcular: () => null,
    nota: 'depende da entrega; o recebimento definitivo é o que destrava a nota fiscal',
  },
  {
    tipo: 'nota_fiscal',
    titulo: 'Emitir a nota fiscal com os dados do empenho',
    ordem: 5,
    calcular: () => null,
    nota: 'nota sem o número do empenho correto volta, e o prazo de pagamento recomeça',
  },
  {
    tipo: 'pagamento',
    titulo: 'Receber o pagamento',
    ordem: 6,
    calcular: () => null,
    nota: `prazo legal de até ${PRAZO_PAGAMENTO_DIAS} dias do aceite (Lei 14.133, art. 141)`,
  },
  {
    tipo: 'renovacao',
    titulo: 'Decidir sobre a renovação',
    ordem: 7,
    quando: ({ vigencia_fim }) => Boolean(vigencia_fim),
    calcular: ({ vigencia_fim }) => diasCorridosAntes(vigencia_fim, AVISO_RENOVACAO_DIAS),
    nota: `${AVISO_RENOVACAO_DIAS} dias antes do fim da vigência`,
  },
];

const POR_TIPO = new Map(MARCOS.map((m) => [m.tipo, m]));

/**
 * O checklist automático da seção 28.3.
 *
 * @param {object} contrato o que se conhece: valor, garantia_exigida, datas, UF
 * @param {Array}  feriados linhas da tabela `feriados`, para a conta de dia útil
 * @returns {Array} marcos com `{tipo, titulo, previsto_para, valor, ordem, nota}`
 */
function montarChecklist(contrato = {}, feriados = []) {
  const valem = prazos.feriadosQueValem(feriados, { uf: contrato.uf, municipio: contrato.municipio });

  // Dias úteis para frente. `diasUteisAntes` da seção 25.1 conta para trás; a
  // contagem para frente é a mesma lógica no outro sentido, e mora aqui porque
  // é só o contrato que precisa dela.
  const diasUteis = (referencia, quantos) => {
    const base = diaDe(referencia);
    if (!base) return null;
    const cursor = new Date(base);
    let achados = 0;
    let voltas = 0;
    while (achados < quantos && voltas < 400) {
      cursor.setDate(cursor.getDate() + 1);
      voltas += 1;
      if (prazos.ehDiaUtil(cursor, valem)) achados += 1;
    }
    return achados < quantos ? null : prazos.chaveDia(cursor);
  };

  const contexto = { ...contrato, diasUteis, diasCorridos: diasCorridosDepois };

  return MARCOS.filter((m) => (m.quando ? m.quando(contexto) : true)).map((m) => ({
    tipo: m.tipo,
    titulo: m.titulo,
    ordem: m.ordem,
    previsto_para: m.calcular(contexto) || null,
    valor: m.valor ? m.valor(contexto) : null,
    nota: m.nota,
    origem: 'automatico',
  }));
}

/**
 * A faixa da LC 123 em que a receita cai, e quanto falta para a próxima.
 *
 * O número é o que passou pelo painel, não a contabilidade da empresa — e a
 * tela diz isso, porque o enquadramento se declara com o número do contador.
 */
function faixaDe(receita) {
  const valor = Number(receita || 0);
  const faixa = FAIXAS.find((f) => valor <= f.teto) || ACIMA;

  const proxima = faixa === ACIMA ? null : FAIXAS[FAIXAS.indexOf(faixa) + 1] || null;
  const usado = faixa.teto ? valor / faixa.teto : null;

  return {
    faixa: faixa.chave,
    rotulo: faixa.rotulo,
    teto: faixa.teto,
    receita: valor,
    // Quanto falta para deixar a faixa atual, que é o número que interessa.
    falta_para_proxima: faixa.teto ? Math.max(0, Math.round((faixa.teto - valor) * 100) / 100) : null,
    proxima: proxima ? proxima.chave : null,
    proxima_teto: proxima ? proxima.teto : null,
    usado_da_faixa: usado === null ? null : Math.round(usado * 1000) / 1000,
    // O aviso de 80% da seção 28.3.
    perto_do_teto: usado !== null && usado >= AVISO_FAIXA,
    base_legal: 'LC 123/2006, art. 3º',
  };
}

module.exports = {
  MARCOS,
  POR_TIPO,
  FAIXAS,
  ACIMA,
  AVISO_FAIXA,
  GARANTIA_PERCENTUAL,
  AVISO_RENOVACAO_DIAS,
  PRAZO_PAGAMENTO_DIAS,
  montarChecklist,
  faixaDe,
  diaDe,
  diasCorridosAntes,
  diasCorridosDepois,
};
