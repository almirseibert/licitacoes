// Preço de referência (seção 12): a frase que abre a tela e o simulador "vale a pena?".
// Onde o painel erra calado: faixa com desconto trocado, quartil ausente virando zero,
// custo maior que o preço mediano passando por margem boa.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const preco = require('../backend/regras/preco');

const referencia = { desconto_mediano: 0.34, desconto_q1: 0.2, desconto_q3: 0.61, pct_acima_estimado: 0.011, amostra: 80, origem: 'calculado' };

test('frase: mediana, metade das contratações e teto do estimado', () => {
  const f = preco.fraseDaReferencia({ referencia, segmento: 'Serviços digitais', familia: 'Pregão' });
  assert.match(f, /Em Pregão de Serviços digitais, quem vence fecha em média 34% abaixo do valor estimado/);
  assert.match(f, /Metade fecha entre 20% e 61% abaixo/);
  assert.match(f, /Só 1,1% fecham acima do estimado/);
});

test('frase: segmento Geral não vira "de Geral"; dispensa sem desconto diz que fecha no estimado', () => {
  assert.doesNotMatch(preco.fraseDaReferencia({ referencia, segmento: 'Geral', familia: 'Pregão' }), /de Geral/);
  const dispensa = preco.fraseDaReferencia({ referencia: { ...referencia, desconto_mediano: 0 }, segmento: 'Geral', familia: 'Dispensa' });
  assert.match(dispensa, /fecha no próprio valor estimado/);
});

test('frase: sem referência diz que falta amostra, nunca inventa número', () => {
  const f = preco.fraseDaReferencia({ referencia: null, segmento: 'Geral', familia: 'Leilão' });
  assert.match(f, /Ainda não há contratações encerradas suficientes/);
  assert.doesNotMatch(f, /\d%/);
});

test('frase: estudo sem 1º quartil usa só o quartil alto', () => {
  const f = preco.fraseDaReferencia({ referencia: { ...referencia, desconto_q1: null }, segmento: 'Geral', familia: 'Pregão' });
  assert.match(f, /Um quarto passa de 61% de desconto/);
});

test('base: calculado diz quantas contratações; estudo cita o levantamento', () => {
  assert.match(preco.baseDaReferencia(referencia), /80 contratações encerradas/);
  assert.match(preco.baseDaReferencia({ origem: 'estudo' }), /10\/10\/2026/);
  assert.equal(preco.baseDaReferencia(null), null);
});

test('simulador: faixa respeita preço e desconto em sentidos contrários', () => {
  const r = preco.simular({ valorEstimado: 100000, custo: null, referencia });
  assert.equal(r.fecha_por, 66000); // 100.000 × (1 − 0,34)
  assert.equal(r.faixa_min, 39000); // maior desconto (61%) → menor preço
  assert.equal(r.faixa_max, 80000); // menor desconto (20%) → maior preço
  assert.equal(r.veredito, null); // sem custo não há veredito
});

test('simulador: vale, apertado e não compensa pelo custo', () => {
  assert.equal(preco.simular({ valorEstimado: 100000, custo: 40000, referencia }).veredito, 'vale');
  assert.equal(preco.simular({ valorEstimado: 100000, custo: 58000, referencia }).veredito, 'apertado');
  const perda = preco.simular({ valorEstimado: 100000, custo: 70000, referencia });
  assert.equal(perda.veredito, 'nao_compensa');
  assert.match(perda.frase, /prejuízo/);
});

test('simulador: avisa quando o preço mais baixo da faixa dá prejuízo mesmo com a mediana boa', () => {
  const r = preco.simular({ valorEstimado: 100000, custo: 45000, referencia });
  assert.equal(r.veredito, 'vale');
  assert.match(r.frase, /preço mais baixo da faixa/);
  assert.equal(r.preco_para_20, 56250);
});

test('simulador: sem estimado ou sem referência não calcula nada', () => {
  assert.equal(preco.simular({ valorEstimado: null, custo: 1000, referencia }).fecha_por, null);
  assert.equal(preco.simular({ valorEstimado: 100000, custo: 1000, referencia: null }).veredito, null);
});

test('simulador: teto da faixa é o estimado quando falta o 1º quartil (estudo)', () => {
  const r = preco.simular({ valorEstimado: 50000, custo: null, referencia: { ...referencia, desconto_q1: null } });
  assert.equal(r.faixa_max, 50000);
  assert.equal(r.teto_estimado, true);
});

test('frase: modalidade desconhecida ("Outra") vira "contratações", não "Em Outra"', () => {
  const f = preco.fraseDaReferencia({ referencia, segmento: 'Geral', familia: 'Outra' });
  assert.match(f, /^Em contratações, quem vence/);
});
