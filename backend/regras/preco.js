// Regras de preço de referência (seção 12). Só matemática e classificação:
// nada de banco aqui, para dar para testar com números na mão.

/**
 * Números do levantamento de 10/10/2026 sobre 1.371 contratações de 2026
 * (seção 12). Entram no banco como `origem = 'estudo'` e valem até o painel ter
 * amostra própria suficiente. Desconto em fração: 0,34 = fechou 34% abaixo.
 *
 * O "1 em 4 fecha acima de" do estudo é o 3º quartil do desconto: em Serviços
 * digitais · Pregão, metade fechou com 34% ou mais de desconto e um quarto
 * passou de 61%. Confere com as outras linhas — dispensa tem mediana 0% e
 * quartil 22%, que só fecha lendo assim.
 */
const ESTUDO = [
  { grupo: 'Serviços digitais', familia: 'Pregão', mediano: 0.34, acima: 0.61 },
  { grupo: 'Serviços digitais', familia: 'Dispensa', mediano: 0.0, acima: 0.22 },
  { grupo: 'Frota e rastreamento', familia: 'Pregão', mediano: 0.51, acima: 0.68 },
  { grupo: 'Frota e rastreamento', familia: 'Dispensa', mediano: 0.01, acima: 0.34 },
  { grupo: 'Informática e itens', familia: 'Pregão', mediano: 0.28, acima: 0.4 },
  { grupo: 'Informática e itens', familia: 'Dispensa', mediano: 0.03, acima: 0.21 },
  { grupo: 'Geral', familia: 'Pregão', mediano: 0.32, acima: 0.5 },
].map((linha) => ({
  grupo: linha.grupo,
  familia: linha.familia,
  desconto_mediano: linha.mediano,
  // O 1º quartil não foi publicado e o painel não o inventa: fica nulo até a
  // amostra própria existir, e o teto da faixa passa a ser o valor estimado —
  // que é o teto prático de verdade, já que só 1,1% fecha acima dele.
  desconto_q1: null,
  desconto_q3: linha.acima,
  pct_acima_estimado: 0.011,
  mediana_propostas: 17,
  amostra: 0,
  origem: 'estudo',
  apurado_em: '2026-10-10',
}));

/** Contexto do mesmo levantamento, para a tela mostrar como nota de rodapé. */
const CONTEXTO_DO_ESTUDO = [
  'Só 1,1% das contratações fecharam acima do valor estimado: o estimado é o teto prático.',
  'Mediana de 17 propostas por item no Compras.gov.br; 80% tiveram 10 ou mais.',
  'Em 52% dos casos o vencedor não foi o primeiro colocado em preço — inexequibilidade e documentação derrubam mais que preço.',
  'Metade das dispensas fecha exatamente no valor estimado.',
];

/**
 * A família da modalidade. O PNCP escreve "Pregão - Eletrônico",
 * "Dispensa", "Inexigibilidade", "Concorrência - Eletrônica"; o estudo da
 * seção 12 é por família, então o nome longo é reduzido antes de agrupar.
 */
function familiaModalidade(modalidade) {
  const texto = String(modalidade || '').toLowerCase();
  if (!texto) return 'Outra';
  if (texto.includes('pregão') || texto.includes('pregao')) return 'Pregão';
  if (texto.includes('dispensa')) return 'Dispensa';
  if (texto.includes('inexigibilidade')) return 'Inexigibilidade';
  if (texto.includes('concorrência') || texto.includes('concorrencia')) return 'Concorrência';
  if (texto.includes('credenciamento')) return 'Credenciamento';
  if (texto.includes('leilão') || texto.includes('leilao')) return 'Leilão';
  if (texto.includes('manifestação') || texto.includes('manifestacao')) return 'Manifestação de interesse';
  return 'Outra';
}

/** Mediana de uma lista de números. Lista vazia devolve nulo, não zero. */
function mediana(lista) {
  const ordenada = lista.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!ordenada.length) return null;
  const meio = Math.floor(ordenada.length / 2);
  return ordenada.length % 2 ? ordenada[meio] : (ordenada[meio - 1] + ordenada[meio]) / 2;
}

/**
 * Quartil por interpolação linear (o mesmo método do `PERCENTILE.INC` da
 * planilha, para o número do painel bater com o que o usuário confere no Excel).
 */
function quartil(lista, fracao) {
  const ordenada = lista.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!ordenada.length) return null;
  if (ordenada.length === 1) return ordenada[0];
  const posicao = fracao * (ordenada.length - 1);
  const baixo = Math.floor(posicao);
  const alto = Math.ceil(posicao);
  if (baixo === alto) return ordenada[baixo];
  return ordenada[baixo] + (ordenada[alto] - ordenada[baixo]) * (posicao - baixo);
}

/** Desconto de uma contratação, em fração. Nulo quando não dá para calcular. */
function descontoDe({ valor_estimado: estimado, valor_homologado: homologado }) {
  const e = Number(estimado);
  const h = Number(homologado);
  if (!Number.isFinite(e) || e <= 0) return null;
  if (!Number.isFinite(h) || h <= 0) return null;
  return Number(((e - h) / e).toFixed(4));
}

/**
 * Estatística de um conjunto de contratações encerradas do mesmo grupo e
 * família. Devolve no formato da tabela `precos_referencia`.
 */
function estatistica(linhas) {
  const comHomologacao = linhas.filter((l) => !l.sem_homologacao && Number.isFinite(Number(l.desconto)));
  const descontos = comHomologacao.map((l) => Number(l.desconto));

  return {
    desconto_mediano: arredondar(mediana(descontos)),
    // Quartis de desconto: q1 é o desconto pequeno (fechou perto do estimado),
    // q3 é o desconto grande. A faixa provável de preço nasce invertida deles.
    desconto_q1: arredondar(quartil(descontos, 0.25)),
    desconto_q3: arredondar(quartil(descontos, 0.75)),
    pct_acima_estimado: descontos.length
      ? arredondar(descontos.filter((d) => d < 0).length / descontos.length)
      : null,
    pct_sem_homologacao: linhas.length
      ? arredondar(linhas.filter((l) => l.sem_homologacao).length / linhas.length)
      : null,
    mediana_propostas: null,
    amostra: descontos.length,
  };
}

function arredondar(n) {
  return Number.isFinite(n) ? Number(n.toFixed(4)) : null;
}

/** Amostra mínima para o painel confiar na própria medida em vez do estudo. */
const AMOSTRA_MINIMA = 12;

/**
 * O bloco da seção 12 para uma licitação, dada a referência escolhida.
 *
 * `faixa_min` sai do maior desconto (q3) e `faixa_max` do menor (q1): preço e
 * desconto andam em sentidos contrários, e trocar os dois é o erro clássico aqui.
 * Sem q1, o teto da faixa é o próprio valor estimado.
 */
function faixa({ valorEstimado, referencia }) {
  const estimado = Number(valorEstimado);
  if (!Number.isFinite(estimado) || estimado <= 0 || !referencia) {
    return { fecha_por: null, faixa_min: null, faixa_max: null, teto_estimado: false };
  }

  // `Number(null)` é 0, e tratar quartil ausente como desconto zero daria um
  // preço igual ao estimado passando por medida — por isso o ausente é testado
  // antes de converter.
  const preco = (desconto) => {
    if (desconto === null || desconto === undefined || desconto === '') return null;
    const n = Number(desconto);
    return Number.isFinite(n) ? Number((estimado * (1 - n)).toFixed(2)) : null;
  };

  const maximo = preco(referencia.desconto_q1);

  return {
    fecha_por: preco(referencia.desconto_mediano),
    faixa_min: preco(referencia.desconto_q3),
    faixa_max: maximo === null ? Number(estimado.toFixed(2)) : maximo,
    teto_estimado: maximo === null,
  };
}

/**
 * Margem no preço informado. O semáforo da seção 19 em forma simples:
 * verde acima de 20%, atenção entre 0 e 20%, vermelho no prejuízo.
 */
function margem({ custo, preco }) {
  const c = Number(custo);
  const p = Number(preco);
  if (!Number.isFinite(c) || c <= 0 || !Number.isFinite(p) || p <= 0) return null;

  const valor = Number((p - c).toFixed(2));
  const pct = Number(((p - c) / p).toFixed(4));
  const sinal = pct < 0 ? 'erro' : pct < 0.2 ? 'atencao' : 'ok';
  const frase =
    pct < 0
      ? 'No preço mediano você entrega no prejuízo: nessa faixa não dá para brigar.'
      : pct < 0.2
        ? 'Dá para brigar, mas a margem é apertada: qualquer imprevisto come o lucro.'
        : 'Margem confortável no preço mediano: essa é uma licitação para disputar.';

  return { valor, pct, sinal, frase };
}

module.exports = {
  ESTUDO,
  CONTEXTO_DO_ESTUDO,
  AMOSTRA_MINIMA,
  familiaModalidade,
  mediana,
  quartil,
  descontoDe,
  estatistica,
  faixa,
  margem,
};
