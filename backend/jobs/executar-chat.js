// Uma rodada do monitor de chat (Seção 6), pela linha de comando.
//   npm run chat
//   npm run chat -- --limite=5
const pool = require('../config/db');
const chat = require('./chat');

const argumentos = process.argv.slice(2);
function opcao(nome, padrao) {
  const achado = argumentos.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.split('=')[1] : padrao;
}

async function principal() {
  const r = await chat.monitorarChat({ limite: Number(opcao('limite', 30)) });
  console.log(
    `Chat do pregão: ${r.checados} chat(s) lido(s), ${r.novas} mensagem(ns) nova(s), ${r.bloqueados} bloqueado(s).`
  );
  for (const erro of r.erros) console.log(`  · ${erro}`);
}

principal()
  .then(() => pool.end())
  .catch(async (erro) => {
    console.error('Falha no monitor de chat:', erro.sqlMessage || erro.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
