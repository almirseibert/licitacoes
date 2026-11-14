// Uma rodada do despacho de avisos (Seção 9): cria os de tarefa atrasada e leva
// todo alerta ainda não despachado a quem quer recebê-lo, por canal.
//   npm run notificar
const pool = require('../config/db');
const prazos = require('./prazos');
const notificar = require('../servicos/notificar');

async function principal() {
  const tarefas = await prazos.avisarTarefasAtrasadas({});
  const r = await notificar.despachar({});
  const canais = Object.entries(r.porCanal)
    .map(([c, n]) => `${c} ${n.enviados} ok/${n.falhas} falha(s)`)
    .join(', ');
  console.log(
    `${tarefas.criados} aviso(s) de tarefa atrasada criados. ` +
      `${r.alertas} alerta(s) despachados em ${r.envios} envio(s), ${r.enviados} entregues${canais ? ` (${canais})` : ''}.`
  );
}

principal()
  .then(() => pool.end())
  .catch(async (erro) => {
    console.error('Falha no despacho de avisos:', erro.sqlMessage || erro.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
