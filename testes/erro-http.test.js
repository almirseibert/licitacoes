// Teste do padrão de erro da seção 13 — { "erro": "...", "detalhe": "técnico, só em
// log" }. Existe porque 89 respostas em backend/rotas/*.js mandavam o `erro.message`
// cru no corpo JSON, inclusive na rota de login, que não exige token. O helper
// `responderErro` (backend/middlewares/responder-erro.js) corrige isso num ponto só:
// grava o técnico sempre no log, e só devolve `detalhe` no corpo fora de produção.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const caminhoAmbiente = require.resolve('../backend/config/ambiente');
const caminhoHelper = require.resolve('../backend/middlewares/responder-erro');

/** Recarrega os dois módulos com o NODE_ENV indicado, sem vazar para outros testes. */
function carregarComAmbiente(nodeEnv) {
  const antigo = process.env.NODE_ENV;
  process.env.NODE_ENV = nodeEnv;
  delete require.cache[caminhoAmbiente];
  delete require.cache[caminhoHelper];
  const { responderErro } = require(caminhoHelper);
  process.env.NODE_ENV = antigo;
  return responderErro;
}

/** Res falso: só grava o que foi chamado, como o Express faria. */
function resFalso() {
  const chamadas = { status: null, corpo: null };
  return {
    status(codigo) {
      chamadas.status = codigo;
      return this;
    },
    json(corpo) {
      chamadas.corpo = corpo;
      return this;
    },
    chamadas,
  };
}

test('em produção, o corpo da resposta de erro não leva "detalhe"', () => {
  const responderErro = carregarComAmbiente('production');
  const res = resFalso();

  responderErro(res, 500, 'Não foi possível entrar agora.', new Error('ER_ACCESS_DENIED_ERROR'));

  assert.equal(res.chamadas.status, 500);
  assert.deepEqual(res.chamadas.corpo, { erro: 'Não foi possível entrar agora.' });
  assert.equal('detalhe' in res.chamadas.corpo, false);
});

test('fora de produção, o corpo da resposta de erro leva "detalhe" para quem desenvolve', () => {
  const responderErro = carregarComAmbiente('development');
  const res = resFalso();

  responderErro(res, 500, 'Não foi possível entrar agora.', new Error('conexão recusada'));

  assert.equal(res.chamadas.status, 500);
  assert.equal(res.chamadas.corpo.erro, 'Não foi possível entrar agora.');
  assert.equal(res.chamadas.corpo.detalhe, 'conexão recusada');
});

test('o detalheExtra (ex.: o GRANT que falta) segue a mesma regra de produção', () => {
  const responderErro = carregarComAmbiente('production');
  const res = resFalso();

  responderErro(
    res,
    503,
    'Login indisponível: este painel não tem permissão de leitura na base de usuários.',
    new Error('ER_DBACCESS_DENIED_ERROR'),
    "GRANT SELECT ON digitalplussmysql.usuarios TO 'mysql'@'%';"
  );

  assert.deepEqual(res.chamadas.corpo, {
    erro: 'Login indisponível: este painel não tem permissão de leitura na base de usuários.',
  });
});

// Restaura o módulo com o NODE_ENV real do processo de teste, para não deixar o
// cache de require sujo para os outros arquivos de teste.
test.after(() => {
  delete require.cache[caminhoAmbiente];
  delete require.cache[caminhoHelper];
  require(caminhoHelper);
});
