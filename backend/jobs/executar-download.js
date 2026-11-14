// Baixa a documentação na hora, sem worker.
//   npm run baixar                       -> as 20 melhores ainda sem arquivo
//   npm run baixar -- --licitacao=123    -> só essa
//   npm run baixar -- --limite=5 --pontuacao=30
const pool = require('../config/db');
const escopo = require('../servicos/escopo');
const { baixarEdital } = require('./baixar');

function argumento(nome) {
  const prefixo = `--${nome}=`;
  const achado = process.argv.find((a) => a.startsWith(prefixo));
  return achado ? achado.slice(prefixo.length) : null;
}

async function principal() {
  const umaSo = argumento('licitacao');
  const limite = Number(argumento('limite') || 20);
  const pontuacaoMin = Number(argumento('pontuacao') || 55);
  const confirmado = process.argv.includes('--confirmado');

  let alvos;
  if (umaSo) {
    alvos = [{ id: Number(umaSo) }];
  } else {
    const [linhas] = await pool.query(
      `SELECT id, pontuacao, objeto FROM ${escopo.agregadoDasOrganizacoes()} l
        WHERE arquivos_status IN ('nao_baixado','na_fila','parcial')
          AND descartada = 0 AND pontuacao >= ?
          AND (fim_propostas IS NULL OR fim_propostas > NOW())
        ORDER BY pontuacao DESC, fim_propostas ASC
        LIMIT ?`,
      [pontuacaoMin, limite]
    );
    alvos = linhas;
  }

  console.log(`Baixando documentação de ${alvos.length} licitações.\n`);
  const total = { ok: 0, falhas: 0, arquivos: 0, pulados: 0, bytes: 0 };

  for (const alvo of alvos) {
    try {
      const r = await baixarEdital({ licitacaoId: alvo.id, confirmado });
      total.ok += 1;
      total.arquivos += r.baixados || 0;
      total.pulados += r.pulados || 0;
      total.bytes += r.bytes || 0;
      console.log(
        `#${alvo.id} ${r.sem_arquivo ? 'sem arquivo no portal' : `${r.baixados} baixados, ${r.pulados} já estavam`}` +
          `${r.erros && r.erros.length ? ` — avisos: ${r.erros.join(' | ')}` : ''}`
      );
    } catch (erro) {
      total.falhas += 1;
      console.error(`#${alvo.id} falhou: ${erro.message}`);
    }
  }

  console.log(
    `\n${total.ok} licitações sem erro, ${total.falhas} com erro. ` +
      `${total.arquivos} arquivos baixados, ${total.pulados} pulados por já existirem, ` +
      `${(total.bytes / 1024 / 1024).toFixed(1)} MB.`
  );
  await pool.end();
}

principal().catch(async (erro) => {
  console.error('Falha no download:', erro.sqlMessage || erro.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
