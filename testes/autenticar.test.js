// Teste do middleware de autenticação multiempresa (seção 1 do
// PLANO_SAAS_CONLICITACAO.md) — sem banco e sem rede, como os outros arquivos
// desta pasta. Cobre o que não se vê rodando a mão: token sem organizacao_id
// (formato antigo) é recusado, e exigirPapel respeita a ordem
// leitor < membro < admin < dono.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste';
const { autenticar, exigirPapel } = require('../backend/middlewares/autenticar');

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

function tokenValido(extra = {}) {
  return jwt.sign(
    { id: 1, nome: 'Teste', email: 't@t.com', organizacao_id: 1, papel: 'membro', ...extra },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

test('sem cabeçalho Authorization, a rota responde 401', () => {
  const req = { headers: {} };
  const res = resFalso();
  let chamouNext = false;
  autenticar(req, res, () => { chamouNext = true; });

  assert.equal(res.chamadas.status, 401);
  assert.equal(chamouNext, false);
});

test('token sem organizacao_id (formato pré-multiempresa) é recusado', () => {
  const tokenAntigo = jwt.sign({ id: 1, nome: 'Teste', papel: 'admin' }, process.env.JWT_SECRET);
  const req = { headers: { authorization: `Bearer ${tokenAntigo}` } };
  const res = resFalso();
  let chamouNext = false;
  autenticar(req, res, () => { chamouNext = true; });

  assert.equal(res.chamadas.status, 401);
  assert.equal(chamouNext, false);
});

test('token válido com organizacao_id e papel passa e preenche req.organizacaoId/req.papel', () => {
  const req = { headers: { authorization: `Bearer ${tokenValido({ organizacao_id: 7, papel: 'admin' })}` } };
  const res = resFalso();
  let chamouNext = false;
  autenticar(req, res, () => { chamouNext = true; });

  assert.equal(chamouNext, true);
  assert.equal(req.organizacaoId, 7);
  assert.equal(req.papel, 'admin');
  assert.equal(req.usuario.email, 't@t.com');
});

test('exigirPapel: membro não passa a barreira de admin', () => {
  const req = { papel: 'membro' };
  const res = resFalso();
  let chamouNext = false;
  exigirPapel('admin')(req, res, () => { chamouNext = true; });

  assert.equal(chamouNext, false);
  assert.equal(res.chamadas.status, 403);
});

test('exigirPapel: dono passa a barreira de admin', () => {
  const req = { papel: 'dono' };
  const res = resFalso();
  let chamouNext = false;
  exigirPapel('admin')(req, res, () => { chamouNext = true; });

  assert.equal(chamouNext, true);
});

test('exigirPapel: leitor não passa a barreira de membro', () => {
  const req = { papel: 'leitor' };
  const res = resFalso();
  let chamouNext = false;
  exigirPapel('membro')(req, res, () => { chamouNext = true; });

  assert.equal(chamouNext, false);
});

test('exigirPapel: papel exatamente igual ao mínimo passa', () => {
  const req = { papel: 'membro' };
  const res = resFalso();
  let chamouNext = false;
  exigirPapel('membro')(req, res, () => { chamouNext = true; });

  assert.equal(chamouNext, true);
});
