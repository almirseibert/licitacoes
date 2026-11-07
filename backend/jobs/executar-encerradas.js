// Roda a coleta de encerradas na hora, sem worker (job `coletar_encerradas`).
//   npm run encerradas
//   npm run encerradas -- --termo="site institucional" --paginas=1
const pool = require('../config/db');
const encerradas = require('./encerradas');

function argumento(nome) {
  const prefixo = `--${nome}=`;
  const achado = process.argv.find((a) => a.startsWith(prefixo));
  return achado ? achado.slice(prefixo.length) : null;
}

async function principal() {
  const termo = argumento('termo');
  const paginas = Number(argumento('paginas')) || undefined;

  const r = await encerradas.coletarEncerradas({ termo, paginas });
  console.log(
    `encerradas lidas=${r.encontradas} novas=${r.novas} ` +
    `referências gravadas=${r.referencias_gravadas} em ${r.duracao_ms} ms`
  );
  if (r.erros.length) console.log('avisos:', r.erros.slice(0, 8));
  await pool.end();
}

principal().catch(async (erro) => {
  console.error('Falha:', erro.sqlMessage || erro.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
