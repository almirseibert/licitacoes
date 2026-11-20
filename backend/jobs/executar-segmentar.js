// Classifica no catálogo de segmentos o que ainda não foi e imprime a cobertura (decisão de 20/11/2026).
//   npm run segmentar
//   npm run segmentar -- --refazer   (zera e reclassifica tudo: use depois de mudar o catálogo)
// Não vai à internet.
const pool = require('../config/db');
const segmentar = require('./segmentar');

const refazer = process.argv.includes('--refazer');

async function principal() {
  if (refazer) {
    for (const tabela of segmentar.TABELAS) await pool.query(`UPDATE ${tabela} SET area = NULL, segmento = NULL`);
    console.log('Classificação anterior zerada.\n');
  }

  for (const r of await segmentar.segmentarTudo()) {
    console.log(`${r.tabela}: ${r.classificadas} linha(s) classificada(s), ${r.sem_classificacao} sem classificação.`);
  }

  for (const tabela of segmentar.TABELAS) {
    const [[t]] = await pool.query(
      `SELECT COUNT(*) AS total, SUM(segmento = 'Sem classificação') AS sem FROM ${tabela}`
    );
    const total = Number(t.total || 0);
    const sem = Number(t.sem || 0);
    const pct = total ? (((total - sem) / total) * 100).toFixed(1) : '0.0';
    console.log(`\n${tabela}: ${total - sem} de ${total} com segmento reconhecido (${pct}%).`);
    const [top] = await pool.query(
      `SELECT area, segmento, COUNT(*) AS n FROM ${tabela} GROUP BY area, segmento ORDER BY n DESC LIMIT 12`
    );
    for (const l of top) console.log(`  ${String(l.n).padStart(7)}  ${l.area} › ${l.segmento}`);
  }
}

principal()
  .then(() => pool.end())
  .catch(async (erro) => {
    console.error('Falha ao segmentar:', erro.sqlMessage || erro.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
