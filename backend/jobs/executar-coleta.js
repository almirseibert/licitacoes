// Roda uma coleta na hora, sem worker. Útil no desenvolvimento e no aceite da Fase 1.
//   npm run coletar                  -> todas as fontes ativas
//   npm run coletar -- --fonte=1     -> só a fonte 1
//   npm run coletar -- --fonte=1 --termo="site institucional" --simular
const pool = require('../config/db');
const coletar = require('./coletar');

function argumento(nome) {
  const prefixo = `--${nome}=`;
  const achado = process.argv.find((a) => a.startsWith(prefixo));
  return achado ? achado.slice(prefixo.length) : null;
}

async function principal() {
  const fonteId = argumento('fonte');
  const termo = argumento('termo');
  const simular = process.argv.includes('--simular');

  let fontes;
  if (fonteId) {
    fontes = [{ id: Number(fonteId) }];
  } else {
    const [linhas] = await pool.query('SELECT id, nome FROM fontes WHERE ativa = 1 ORDER BY prioridade');
    fontes = linhas;
  }

  for (const fonte of fontes) {
    console.log(`\n--- coletando fonte ${fonte.id} ${fonte.nome || ''} ---`);
    try {
      const resultado = await coletar.coletarFonte({ fonteId: fonte.id, termo, simular });
      console.log(
        `encontradas=${resultado.encontradas} novas=${resultado.novas} ` +
        `atualizadas=${resultado.atualizadas} ignoradas=${resultado.ignoradas} ` +
        `em ${resultado.duracao_ms} ms`
      );
      if (resultado.erros.length) console.log('avisos:', resultado.erros.slice(0, 5));
      if (simular) console.log(resultado.amostra);
    } catch (erro) {
      console.error(`falhou: ${erro.message}`);
    }
  }

  await pool.end();
}

principal().catch(async (erro) => {
  console.error(erro);
  await pool.end().catch(() => {});
  process.exit(1);
});
