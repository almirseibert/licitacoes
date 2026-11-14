// Seção 1c — a correção manual da exigência é da organização. Sem banco e sem rede:
// o que erra calado aqui é o SQL que decide "o edital exige garantia?" na visão de cada um.
const test = require('node:test');
const assert = require('node:assert/strict');
const { exigidaSql } = require('../backend/servicos/exigencias');

test('exigidaSql: a correção da organização passa na frente da leitura do edital', () => {
  const sql = exigidaSql({ licitacao: 'l.id', organizacao: 'l.organizacao_id', codigos: ['garantia_contrato'] });
  // Ramo 1: a leitura do edital, trocada pela correção da MESMA organização quando existe.
  assert.match(sql, /COALESCE\(\(SELECT oe\.detectado FROM org_exigencias oe\s+WHERE oe\.organizacao_id = l\.organizacao_id/);
  assert.match(sql, /ex\.detectado\) = 'sim'/);
  // Ramo 2: a organização afirmou "sim" onde o catálogo não leu nada.
  assert.match(sql, /oe\.organizacao_id = l\.organizacao_id AND oe\.licitacao_id = l\.id\s+AND oe\.codigo IN \('garantia_contrato'\) AND oe\.detectado = 'sim'/);
});

test('exigidaSql: vários códigos entram como lista literal, nos dois ramos', () => {
  const sql = exigidaSql({ licitacao: 'l.id', organizacao: 'l.organizacao_id', codigos: ['garantia_proposta', 'garantia_contrato'] });
  assert.equal(sql.split("IN ('garantia_proposta', 'garantia_contrato')").length - 1, 2);
});

test('exigidaSql: código fora do catálogo ou lista vazia não vira SQL', () => {
  assert.throws(() => exigidaSql({ licitacao: 'l.id', organizacao: 'l.organizacao_id', codigos: ["x') OR 1=1 --"] }), /fora do catálogo/);
  assert.throws(() => exigidaSql({ licitacao: 'l.id', organizacao: 'l.organizacao_id', codigos: ['inventado'] }), /fora do catálogo/);
  // Lista vazia casaria "tudo" ou "nada" por acaso do SQL: melhor falhar alto.
  assert.throws(() => exigidaSql({ licitacao: 'l.id', organizacao: 'l.organizacao_id', codigos: [] }), /fora do catálogo/);
});
