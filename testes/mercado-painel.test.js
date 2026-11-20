// A frase do painel de Mercado é o que a pessoa lê primeiro: precisa dizer a verdade com o que há
// (e dizer quando não há), em português, sem inventar número.
const test = require('node:test');
const assert = require('node:assert/strict');
const r = require('../backend/regras/mercado-painel');

const totais = { contratos: 1234, valor: 56700000, orgaos: 88, fornecedores: 301 };
const compradores = [{ nome: 'Município de A' }, { nome: 'Município de B' }, { nome: 'Município de C' }, { nome: 'Município de D' }];

test('frase completa: período, recorte, valor, quem comprou (só os 3 primeiros) e desconto', () => {
  const f = r.fraseDoMercado({
    recorte: { area: 'Saúde', segmento: 'Medicamentos', uf: 'RS' }, dias: 90, totais, compradores,
    desconto: { mediano: 0.38, amostra: 36 },
  });
  assert.match(f, /Nos últimos 90 dias foram assinados 1\.234 contratos de Saúde › Medicamentos em RS/);
  assert.match(f, /R\$\s?56\.700\.000/);
  assert.match(f, /301 fornecedores em 88 órgãos/);
  assert.match(f, /Município de A, Município de B e Município de C\./);
  assert.doesNotMatch(f, /Município de D/);
  assert.match(f, /38% abaixo do estimado\./);
  assert.doesNotMatch(f, /amostra pequena/);
});

test('sem contrato no recorte diz que não há, em vez de um zero que pareça resultado', () => {
  const f = r.fraseDoMercado({ recorte: { area: 'Saúde' }, dias: 30, totais: { contratos: 0, valor: 0, orgaos: 0, fornecedores: 0 } });
  assert.match(f, /Nenhum contrato de Saúde foi assinado nos últimos 30 dias/);
  assert.match(f, /UF que a coleta ainda não cobre/);
});

test('amostra pequena de desconto é dita; desconto zero vira "fecha no estimado"; sem desconto não inventa', () => {
  const base = { recorte: {}, dias: 90, totais, compradores: [] };
  assert.match(r.fraseDoMercado({ ...base, desconto: { mediano: 0.2, amostra: 5 } }), /amostra pequena/);
  assert.match(r.fraseDoMercado({ ...base, desconto: { mediano: 0, amostra: 50 } }), /fecha no próprio valor estimado/);
  assert.doesNotMatch(r.fraseDoMercado({ ...base, desconto: { mediano: null, amostra: 0 } }), /abaixo do estimado|valor estimado/);
  assert.match(r.fraseDoMercado(base), /todos os segmentos/);
});

test('janelas: valor fora da lista cai no padrão (nada de intervalo arbitrário no SQL)', () => {
  assert.equal(r.escolher('180', r.JANELAS_ASSINADOS, r.PADRAO_ASSINADOS), 180);
  assert.equal(r.escolher('7; DROP', r.JANELAS_ASSINADOS, r.PADRAO_ASSINADOS), 90);
  assert.equal(r.escolher(undefined, r.JANELAS_VENCIMENTO, r.PADRAO_VENCIMENTO), 90);
  assert.equal(r.lista(['A', 'B']), 'A e B');
  assert.equal(r.lista(['A']), 'A');
});
