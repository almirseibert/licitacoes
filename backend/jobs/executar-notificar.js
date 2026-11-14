// Uma rodada do despacho de avisos (Seção 9): cria os de tarefa atrasada e leva
// todo alerta ainda não despachado a quem quer recebê-lo, por canal.
//   npm run notificar
const pool = require('../config/db');
const notificar = require('../servicos/notificar');

async function principal() {
  const r = await notificar.rodadaDeAvisos();
  console.log(notificar.descrever(r));
  if (r.erros.length) throw new Error(r.erros.join(' | '));
}

principal()
  .then(() => pool.end())
  .catch(async (erro) => {
    console.error('Falha no despacho de avisos:', erro.sqlMessage || erro.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
