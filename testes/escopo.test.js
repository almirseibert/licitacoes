// Escopo por organização (Seção 1b do PLANO_SAAS_CONLICITACAO.md) — sem banco
// e sem rede. O que erra calado aqui: o id da organização entra no SQL como
// literal (para não bagunçar a ordem dos `?`), então qualquer coisa que não seja
// inteiro positivo tem de ser recusada antes; a visão "da organização" tem de
// filtrar pela organização certa; e o papel leitor não pode escrever.
const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste';
const escopo = require('../backend/servicos/escopo');
const { leitorSoLe } = require('../backend/middlewares/autenticar');

test('idOrganizacao aceita só inteiro positivo', () => {
  assert.equal(escopo.idOrganizacao(7), 7);
  assert.equal(escopo.idOrganizacao('12'), 12);
  for (const ruim of [0, -1, 1.5, 'abc', '1 OR 1=1', '1; DROP TABLE licitacoes', null, undefined, NaN, '']) {
    assert.throws(() => escopo.idOrganizacao(ruim), /organizacao_id inválido/, `deveria recusar ${String(ruim)}`);
  }
});

test('daOrganizacao filtra pela organização pedida e não abre brecha de injeção', () => {
  const sql = escopo.daOrganizacao(42);
  assert.match(sql, /o_\.organizacao_id = 42\)/);
  assert.match(sql, /JOIN org_licitacoes o_/);
  assert.doesNotMatch(sql, /LEFT JOIN/);
  assert.throws(() => escopo.daOrganizacao('42) OR (1=1'));
});

test('daOrganizacao({ todas }) mostra o catálogo com o estado de "ainda não olhei"', () => {
  const sql = escopo.daOrganizacao(3, { todas: true });
  assert.match(sql, /LEFT JOIN org_licitacoes o_ ON o_\.licitacao_id = l_\.id AND o_\.organizacao_id = 3/);
  assert.match(sql, /COALESCE\(o_\.etapa, 'Triagem'\) AS etapa/);
  assert.match(sql, /COALESCE\(o_\.descartada, 0\) AS descartada/);
});

test('toda coluna de decisão é coluna da organização', () => {
  for (const coluna of escopo.COLUNAS_DECISAO) {
    assert.ok(escopo.COLUNAS_ORG.includes(coluna), `${coluna} falta em COLUNAS_ORG`);
  }
  // As que a coleta pontua não podem ser tratadas como decisão do usuário.
  for (const coluna of ['pontuacao', 'grupo', 'objeto_social']) {
    assert.ok(!escopo.COLUNAS_DECISAO.includes(coluna));
  }
});

test('agruparPorOrganizacao separa as linhas por organizacao_id', () => {
  const grupos = escopo.agruparPorOrganizacao([
    { organizacao_id: 1, id: 10 },
    { organizacao_id: 2, id: 10 },
    { organizacao_id: 1, id: 11 },
  ]);
  assert.deepEqual([...grupos.keys()], [1, 2]);
  assert.deepEqual(grupos.get(1).map((l) => l.id), [10, 11]);
});

function chamar(papel, metodo) {
  const res = {
    codigo: null,
    status(c) {
      this.codigo = c;
      return this;
    },
    json() {
      return this;
    },
  };
  let passou = false;
  leitorSoLe({ papel, method: metodo }, res, () => {
    passou = true;
  });
  return { passou, codigo: res.codigo };
}

test('leitor lê e não escreve; os outros papéis escrevem', () => {
  assert.equal(chamar('leitor', 'GET').passou, true);
  for (const metodo of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    assert.deepEqual(chamar('leitor', metodo), { passou: false, codigo: 403 });
  }
  for (const papel of ['membro', 'admin', 'dono']) {
    assert.equal(chamar(papel, 'PATCH').passou, true);
  }
});
