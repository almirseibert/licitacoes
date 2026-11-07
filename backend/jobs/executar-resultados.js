// Busca o vencedor de cada item de uma licitação do radar, pelo PNCP.
//   npm run resultados -- --licitacao=42
//   npm run resultados -- --etapa="Perdemos"     (todas as da etapa)
const pool = require('../config/db');
const encerradas = require('./encerradas');

function argumento(nome) {
  const prefixo = `--${nome}=`;
  const achado = process.argv.find((a) => a.startsWith(prefixo));
  return achado ? achado.slice(prefixo.length) : null;
}

async function principal() {
  const id = argumento('licitacao');
  const etapa = argumento('etapa');

  let alvos;
  if (id) {
    alvos = [{ id: Number(id) }];
  } else if (etapa) {
    const [linhas] = await pool.query('SELECT id FROM licitacoes WHERE etapa = ?', [etapa]);
    alvos = linhas;
  } else {
    console.error('Informe --licitacao=<id> ou --etapa="<etapa>".');
    await pool.end();
    process.exit(1);
  }

  for (const alvo of alvos) {
    try {
      const r = await encerradas.registrarResultados({ licitacaoId: alvo.id });
      console.log(
        `licitação ${alvo.id}: ${r.gravados} resultado(s) em ${r.itens} item(ns)` +
        (r.sem_resultado ? `, ${r.sem_resultado} sem resultado` : '') +
        (r.aviso ? ` — ${r.aviso}` : '')
      );
      if (r.erros && r.erros.length) console.log('  avisos:', r.erros.slice(0, 4));
    } catch (erro) {
      console.error(`licitação ${alvo.id}: ${erro.message}`);
    }
  }

  await pool.end();
}

principal().catch(async (erro) => {
  console.error('Falha:', erro.sqlMessage || erro.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
