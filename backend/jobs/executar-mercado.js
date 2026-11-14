// Contratos, atas e acompanhamentos do mercado (Seção 12).
//   npm run mercado
//   npm run mercado -- --uf=RS,SC --tipo=contrato --dias=10 --paginas=20
//
// Sem --uf, vale MERCADO_UFS (padrão RS). Na primeira rodada de cada tipo a
// busca volta --dias (padrão 7); depois, só até onde a rodada anterior chegou.
const pool = require('../config/db');
const mercado = require('./mercado');

const arg = (nome) => {
  const achado = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.split('=')[1] : undefined;
};
const lista = (v) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : undefined);

const opcoes = {};
if (arg('uf')) opcoes.ufs = lista(arg('uf')).map((u) => u.toUpperCase());
if (arg('tipo')) opcoes.tipos = lista(arg('tipo'));
if (Number(arg('dias')) > 0) opcoes.desdeDias = Number(arg('dias'));
if (Number(arg('paginas')) > 0) opcoes.paginasMax = Number(arg('paginas'));

mercado
  .rodar(opcoes)
  .then(async (r) => {
    for (const x of r.resultados) {
      console.log(
        `${x.uf} · ${x.tipo}: ${x.lidos} lido(s), ${x.gravados} linha(s) gravada(s) — ${x.status}` +
          (x.erro ? ` (${x.erro})` : '')
      );
    }
    console.log(`${r.alertas} alerta(s) de publicação em favorita.`);
    await pool.end();
  })
  .catch(async (erro) => {
    console.error('Falha na coleta do mercado:', erro.sqlMessage || erro.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
