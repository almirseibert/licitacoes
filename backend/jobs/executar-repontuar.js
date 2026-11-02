// Repontua tudo o que já está gravado, sem ir aos portais.
//   npm run repontuar
// Útil depois de mexer em pesos, palavras de corte ou CNAEs quando o worker
// não está no ar. Pela tela, o botão "Repontuar" faz o mesmo pela fila.
const pool = require('../config/db');
const { repontuar } = require('./coletar');

repontuar()
  .then(async (resumo) => {
    console.log(
      `Repontuadas ${resumo.avaliadas} licitações: ${resumo.mudaram} mudaram de pontuação, ` +
        `${resumo.descartadas} passaram a cair em palavra excluída.`
    );
    await pool.end();
  })
  .catch(async (erro) => {
    console.error('Falha ao repontuar:', erro.sqlMessage || erro.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
