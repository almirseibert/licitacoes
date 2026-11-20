// A IA só roda por clique de quem usa o painel (decisão de 20/11/2026).
// Este teste lê o código-fonte: se alguém religar leitura, resumo ou sugestão
// de palavras no worker ou na fila, ele falha antes de gastar crédito.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const ler = (rel) => fs.readFileSync(path.join(raiz, rel), 'utf8');

function arquivosJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : arquivosJs(p);
    return e.name.endsWith('.js') ? [p] : [];
  });
}

test('o worker não chama a IA nem registra jobs de IA', () => {
  const worker = ler('worker/index.js');
  for (const proibido of ['ia-resumos', 'iaResumos', 'lerEdital(', 'resumirEdital', 'sugerirPalavras', 'servicos/ia']) {
    // `lerEdital` do worker é o job de leitura de PDF (sem IA): só `lerEdital(` com IA importa,
    // e o worker usa `lerEdital.lerEditais`, que não bate com o padrão acima.
    assert.ok(!worker.includes(proibido), `worker/index.js menciona "${proibido}"`);
  }
});

test('nenhum job entra na fila com tipo de IA', () => {
  const achados = [];
  for (const arq of arquivosJs(path.join(raiz, 'backend'))) {
    const texto = fs.readFileSync(arq, 'utf8');
    if (/fila\.enfileirar\(\s*['"](ia_|sugerir_palavras)/.test(texto)) achados.push(path.relative(raiz, arq));
  }
  assert.deepEqual(achados, []);
});

test('a leitura assistida não grava erro transitório no cache', () => {
  const ia = ler('backend/servicos/ia.js');
  assert.match(ia, /\['http', 'timeout', 'rede'\]\.includes\(erro\.codigo\)/);
});
