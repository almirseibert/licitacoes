// A configuração do adaptador (seção 5.3) precisa ir e voltar sem perder nada:
// a tela mandava objeto, o MariaDB devolvia texto, e o "{}" vazio escondia a perda.
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST = process.env.DB_HOST || 'x';
process.env.DB_USER = process.env.DB_USER || 'x';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'x';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';

const { configComoObjeto, limpar } = require('../backend/rotas/fontes');

test('config devolvida como texto vira objeto', () => {
  assert.deepEqual(configComoObjeto('{"url_busca":"https://a/?q={termo}"}'), { url_busca: 'https://a/?q={termo}' });
});

test('config já objeto passa intacta; vazia ou quebrada vira {}', () => {
  const o = { url_busca: 'x' };
  assert.equal(configComoObjeto(o), o);
  assert.deepEqual(configComoObjeto(null), {});
  assert.deepEqual(configComoObjeto(''), {});
  assert.deepEqual(configComoObjeto('{quebrado'), {});
});

test('limpar aceita config como objeto e como texto, e grava JSON', () => {
  const dado = { url_busca: 'https://a/?q={termo}', paginas_max: 3 };
  assert.equal(limpar({ config: dado }, { exigirTudo: false }).config, JSON.stringify(dado));
  assert.equal(limpar({ config: JSON.stringify(dado) }, { exigirTudo: false }).config, JSON.stringify(dado));
});

test('limpar recusa JSON inválido com mensagem em português', () => {
  assert.throws(() => limpar({ config: '{nao e json' }, { exigirTudo: false }), /JSON válido/);
});
