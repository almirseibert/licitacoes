// Recalcula os dossiês de concorrente e de órgão (seções 26 e 27).
//   npm run dossies
// Não vai à internet: é tudo derivado do que a coleta já trouxe.
const pool = require('../config/db');
const dossies = require('./dossies');

dossies
  .agregarDossies()
  .then(async (r) => {
    console.log(`${r.concorrentes} concorrente(s) e ${r.orgaos} órgão(s) recalculados.`);
    const [[c]] = await pool.query(
      'SELECT COUNT(*) AS com_vitoria FROM concorrentes WHERE vitorias > 0'
    );
    const [[o]] = await pool.query('SELECT COUNT(*) AS com_exigencia FROM orgaos WHERE JSON_LENGTH(exigencias_json) > 0');
    console.log(
      `${c.com_vitoria} concorrente(s) com item homologado; ` +
        `${o.com_exigencia} órgão(s) com perfil de exigência montado.`
    );
    await pool.end();
  })
  .catch(async (erro) => {
    console.error('Falha ao agregar dossiês:', erro.sqlMessage || erro.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
