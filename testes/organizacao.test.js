// Teste dos helpers de backend/config/organizacao.js (seção 1 do
// PLANO_SAAS_CONLICITACAO.md) — sem banco e sem rede.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  PAPEIS,
  papelValido,
  gerarTokenConvite,
  dataFimTeste,
  expiraConvite,
  DIAS_TESTE_PADRAO,
  HORAS_VALIDADE_CONVITE,
} = require('../backend/config/organizacao');

test('papelValido aceita só os quatro papéis conhecidos', () => {
  for (const papel of PAPEIS) assert.equal(papelValido(papel), true);
  assert.equal(papelValido('superusuario'), false);
  assert.equal(papelValido(''), false);
  assert.equal(papelValido(undefined), false);
});

test('gerarTokenConvite devolve 64 caracteres hexadecimais, diferentes a cada chamada', () => {
  const a = gerarTokenConvite();
  const b = gerarTokenConvite();
  assert.equal(a.length, 64);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, b);
});

test('dataFimTeste soma exatamente DIAS_TESTE_PADRAO dias', () => {
  const base = new Date('2026-01-01T00:00:00Z');
  const fim = dataFimTeste(base);
  const dias = Math.round((new Date(fim) - base) / 86400000);
  assert.equal(dias, DIAS_TESTE_PADRAO);
  // DATE puro (sem hora), do jeito que a coluna `teste_ate` espera.
  assert.match(fim, /^\d{4}-\d{2}-\d{2}$/);
});

test('expiraConvite soma exatamente HORAS_VALIDADE_CONVITE horas', () => {
  const base = new Date('2026-01-01T00:00:00Z');
  const expira = expiraConvite(base);
  const horas = Math.round((expira - base) / 3600000);
  assert.equal(horas, HORAS_VALIDADE_CONVITE);
});
