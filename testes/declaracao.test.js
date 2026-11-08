// Testes do gerador de declarações (seção 18) e da regra que o atravessa:
// dado que falta vira lacuna visível, nunca valor inventado.
//
// É a promessa mais fácil de quebrar sem ninguém notar — basta alguém "melhorar"
// a substituição para não deixar espaço em branco no PDF, e a declaração passa a
// afirmar coisa que a empresa não disse.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const declaracao = require('../backend/servicos/declaracao');

test('variável sem dado vira lacuna, e a lacuna é cobrada em `faltando`', () => {
  const r = declaracao.preencher('A empresa {{razao_social}}, CNPJ {{cnpj}}, declara.', {
    razao_social: 'Studio Mythos ME',
    cnpj: null,
  });

  assert.match(r.texto, /Studio Mythos ME/);
  assert.match(r.texto, new RegExp(declaracao.LACUNA), 'o CNPJ vazio tem de aparecer como lacuna');
  assert.deepEqual(r.faltando, ['cnpj']);
});

test('variável que nem existe nos dados também vira lacuna', () => {
  const r = declaracao.preencher('Assina {{representante}}.', {});
  assert.match(r.texto, new RegExp(declaracao.LACUNA));
  assert.deepEqual(r.faltando, ['representante']);
});

test('campo opcional vazio sai como nada, sem lacuna e sem espaço duplo', () => {
  const r = declaracao.preencher('Pregão nº 1{{processo_frase}}, do órgão.', { processo_frase: '' });
  assert.equal(r.texto, 'Pregão nº 1, do órgão.');
  assert.deepEqual(r.faltando, []);
});

test('a cidade da assinatura sai do fim do endereço', () => {
  assert.equal(declaracao.cidadeDoEndereco('Rua X, 123 - Centro, Lajeado/RS'), 'Lajeado');
  assert.equal(declaracao.cidadeDoEndereco('Av. Brasil, 500, Porto Alegre'), 'Porto Alegre');
  assert.equal(declaracao.cidadeDoEndereco(null), null);
});

test('data por extenso sai em português', () => {
  const texto = declaracao.porExtenso(new Date('2026-03-09T12:00:00'));
  assert.match(texto, /de 2026$/);
  assert.match(texto, /mar/i);
});
