// Quem vê o quê no menu (decisões de 20/11/2026): Órgãos só para a equipe do painel,
// Meus contratos em Administração › Conta. A regra vive em frontend/src/config/navegacao.js
// (módulo ESM com ícones do React) — aqui lemos o texto da configuração, sem montar a interface.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const fonte = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', 'config', 'navegacao.js'), 'utf8');
const linha = (chave) => fonte.split('\n').find((l) => l.includes(`chave: '${chave}'`)) || '';

test('Órgãos é só da equipe do painel (superadmin), não do admin de cada cliente', () => {
  const l = linha('orgaos');
  assert.match(l, /soSuperadmin: true/);
  assert.doesNotMatch(l, /soAdmin: true/);
});

test('Meus contratos fica em Administração › Conta', () => {
  const l = linha('contratos');
  assert.match(l, /categoria: 'administracao'/);
  assert.match(l, /grupo: 'Conta'/);
});

test('as rotas de órgão do backend exigem superadmin', () => {
  const rotas = fs.readFileSync(path.join(__dirname, '..', 'backend', 'rotas', 'dossies.js'), 'utf8');
  for (const rota of ["'/agregar'", "'/orgaos'", "'/orgaos/:cnpj'"]) {
    assert.match(rotas, new RegExp(`rotas\\.(get|post)\\(${rota.replace(/[/:]/g, (c) => `\\${c}`)}, apenasSuperadmin`), rota);
  }
});

test('apenasSuperadmin: só admin/dono da organização operadora passa', () => {
  process.env.DB_HOST = process.env.DB_HOST || 'x';
  process.env.DB_USER = process.env.DB_USER || 'x';
  process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'x';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
  const { apenasSuperadmin } = require('../backend/middlewares/autenticar');

  const tentar = (organizacaoId, papel) => {
    let status = null;
    let passou = false;
    const res = { status(c) { status = c; return this; }, json() { return this; } };
    apenasSuperadmin({ organizacaoId, papel }, res, () => { passou = true; });
    return { passou, status };
  };

  assert.equal(tentar(1, 'dono').passou, true);
  assert.equal(tentar(1, 'admin').passou, true);
  assert.deepEqual(tentar(1, 'membro'), { passou: false, status: 403 });
  assert.deepEqual(tentar(7, 'dono'), { passou: false, status: 403 }); // cliente, mesmo sendo dono
});
