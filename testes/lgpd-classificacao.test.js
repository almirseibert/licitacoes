// Seção 17b (plano SaaS): a exportação e a exclusão LGPD descobrem as tabelas por `organizacao_id`
// no schema — então tabela nova entra sozinha. Este teste (sem banco) lê as migrações e falha
// quando surge tabela por organização que ninguém classificou como "exporta" ou "fora", para
// alguém olhar se há credencial (coluna secreta) ou dado que não deveria sair.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const regras = require('../backend/regras/lgpd');

const DIR = path.join(__dirname, '..', 'backend', 'migrations');

/** Tabelas que as migrações criam (ou alteram) com a coluna `organizacao_id`. */
function tabelasPorOrganizacao() {
  const achadas = new Set();
  for (const arquivo of fs.readdirSync(DIR).filter((f) => f.endsWith('.sql'))) {
    const sql = fs.readFileSync(path.join(DIR, arquivo), 'utf8');
    for (const m of sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+`?(\w+)`?\s*\(([\s\S]*?)\)\s*ENGINE/gi)) {
      if (/\borganizacao_id\b/.test(m[2])) achadas.add(m[1]);
    }
    for (const m of sql.matchAll(/ALTER TABLE\s+`?(\w+)`?\s+([^;]*);/gi)) {
      if (/ADD(?:\s+COLUMN)?\s+`?organizacao_id\b/i.test(m[2])) achadas.add(m[1]);
    }
  }
  return achadas;
}

test('toda tabela com organizacao_id nas migrações está classificada (exporta ou fora)', () => {
  const classificadas = new Set([...regras.TABELAS_EXPORTADAS, ...regras.TABELAS_FORA_DA_EXPORTACAO, regras.TABELA_DO_COMPROVANTE]);
  const semClasse = [...tabelasPorOrganizacao()].filter((t) => !classificadas.has(t));
  assert.deepEqual(semClasse, [], `tabela nova por organização sem classificação em backend/regras/lgpd.js: ${semClasse.join(', ')}`);
});

test('a classificação não guarda tabela que não existe mais, nem classifica a mesma tabela duas vezes', () => {
  const existentes = tabelasPorOrganizacao();
  for (const t of [...regras.TABELAS_EXPORTADAS, ...regras.TABELAS_FORA_DA_EXPORTACAO]) assert.ok(existentes.has(t), `classificada mas inexistente: ${t}`);
  for (const t of regras.TABELAS_FORA_DA_EXPORTACAO) assert.ok(!regras.TABELAS_EXPORTADAS.has(t), `${t} está nas duas listas`);
  assert.ok(regras.TABELAS_EXPORTADAS.has('organizacao_membros'));
});

test('o parser enxerga as tabelas novas desta seção (para o teste não passar por não ler nada)', () => {
  const t = tabelasPorOrganizacao();
  for (const nome of ['juridico_conversas', 'juridico_mensagens', 'ia_perguntas', 'servico_pedidos', 'org_licitacoes']) assert.ok(t.has(nome), nome);
  assert.ok(t.size >= 45, `só ${t.size} tabelas lidas`);
});
