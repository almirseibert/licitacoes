// Lê os editais já baixados e monta o checklist, sem worker.
//   npm run ler                       -> os 20 melhores ainda não lidos
//   npm run ler -- --licitacao=582    -> só essa
//   npm run ler -- --limite=10 --refazer
const pool = require('../config/db');
const escopo = require('../servicos/escopo');
const { lerEdital } = require('./ler-edital');

function argumento(nome) {
  const prefixo = `--${nome}=`;
  const achado = process.argv.find((a) => a.startsWith(prefixo));
  return achado ? achado.slice(prefixo.length) : null;
}

async function principal() {
  const umaSo = argumento('licitacao');
  const limite = Number(argumento('limite') || 20);
  const refazer = process.argv.includes('--refazer');

  let alvos;
  if (umaSo) {
    alvos = [{ id: Number(umaSo) }];
  } else {
    const [linhas] = await pool.query(
      `SELECT id FROM ${escopo.agregadoDasOrganizacoes()} l
        WHERE arquivos_status IN ('ok','parcial')
          ${refazer ? '' : "AND exigencias_status IN ('nao_lido','na_fila')"}
          AND descartada = 0
        ORDER BY pontuacao DESC
        LIMIT ?`,
      [limite]
    );
    alvos = linhas;
  }

  console.log(`Lendo ${alvos.length} editais.\n`);
  const total = { ok: 0, semTexto: 0, falhas: 0, exigencias: 0 };

  for (const alvo of alvos) {
    try {
      const r = await lerEdital({ licitacaoId: alvo.id });
      if (r.status === 'sem_texto') {
        total.semTexto += 1;
        console.log(`#${alvo.id} sem texto — ${r.escaneados} de ${r.arquivos} arquivos parecem escaneados`);
      } else {
        total.ok += 1;
        total.exigencias += r.exigidas;
        console.log(
          `#${alvo.id} ${r.paginas} páginas em ${r.lidos} arquivos · ` +
            `${r.exigidas} exigências, ${r.dispensadas} dispensadas`
        );
      }
    } catch (erro) {
      total.falhas += 1;
      console.error(`#${alvo.id} falhou: ${erro.message}`);
    }
  }

  console.log(
    `\n${total.ok} editais lidos, ${total.semTexto} sem texto, ${total.falhas} com erro. ` +
      `Média de ${total.ok ? (total.exigencias / total.ok).toFixed(1) : 0} exigências por edital.`
  );
  await pool.end();
}

principal().catch(async (erro) => {
  console.error('Falha na leitura:', erro.sqlMessage || erro.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
