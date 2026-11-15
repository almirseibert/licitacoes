// O MariaDB dos testes aceita o que o MySQL 8 de produção recusa: coluna gerada
// STORED numa tabela cuja coluna-base tem chave estrangeira com CASCADE/SET NULL
// ("Cannot add foreign key constraint", migrações 024 e 026 em 15/11/2026). Este
// teste, sem banco, impede o erro de voltar: use VIRTUAL.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'backend', 'migrations');

test('nenhuma migração usa coluna gerada STORED (o MySQL 8 recusa com FK em cascata)', () => {
  const culpadas = fs
    .readdirSync(DIR)
    .filter((a) => a.endsWith('.sql'))
    .filter((a) => /\bAS\s*\([^;]*\)\s*STORED\b/i.test(fs.readFileSync(path.join(DIR, a), 'utf8')));
  assert.deepStrictEqual(culpadas, [], `use VIRTUAL em: ${culpadas.join(', ')}`);
});
