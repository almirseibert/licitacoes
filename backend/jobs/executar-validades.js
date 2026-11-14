// Validades do cofre, revisão de 90 dias e agenda de portais (seções 9.2 e 10).
//   npm run validades
const pool = require('../config/db');
const { verificarValidades } = require('./validades');

verificarValidades()
  .then(async (r) => {
    console.log(
      `${r.verificados} documento(s) com validade: ${r.alertas} alerta(s), ${r.vencidos} vencido(s). ` +
        `Revisão de 90 dias: ${r.revisao.avaliados} devido(s), ${r.revisao.alertas} alerta(s) novo(s). ` +
        `Portais: ${r.portais.avaliados} perto de vencer, ${r.portais.alertas} alerta(s) novo(s).`
    );
    await pool.end();
  })
  .catch(async (erro) => {
    console.error('Falha nas validades:', erro.sqlMessage || erro.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
