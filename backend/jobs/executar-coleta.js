// Roda uma coleta na hora, sem worker. Útil no desenvolvimento e no aceite da Fase 1.
//   npm run coletar                  -> todas as fontes ativas
//   npm run coletar -- --fonte=1     -> só a fonte 1
//   npm run coletar -- --fonte=1 --termo="site institucional" --simular
//   npm run coletar -- --fonte=1 --varrer=RS   -> varredura total de uma UF (sem palavra); --varrer=todas para o país
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
  const varrer = argumento('varrer');

  if (varrer) {
    if (!fonteId) {
      console.error('Use --fonte=<id da fonte PNCP> junto com --varrer.');
      await pool.end();
      process.exit(1);
    }
    const [[fonte]] = await pool.query('SELECT config FROM fontes WHERE id = ?', [Number(fonteId)]);
    const config = fonte && (typeof fonte.config === 'string' ? JSON.parse(fonte.config || '{}') : fonte.config || {});
    const ufs = varrer === 'todas' ? coletar.ufsDaVarredura(config || {}) : varrer.toUpperCase().split(',');
    for (const uf of ufs) {
      try {
        // Cada rodada lê poucas páginas e enfileira a seguinte; na linha de comando, segue sem a fila.
        let pedido = { fonteId: Number(fonteId), uf, encadear: false };
        for (let rodada = 1; rodada <= 200 && pedido; rodada += 1) {
          const r = await coletar.varrerUf(pedido);
          console.log(
            `${uf} ${r.ordenacao} até p.${r.paginas_ate}: ${r.total_na_uf} abertos no PNCP, ${r.encontradas} lidos, ` +
              `${r.novas} novos, ${r.atualizadas} atualizados, ${r.ignoradas} sem palavra-chave, ${Math.round(r.duracao_ms / 1000)} s` +
              (r.erros.length ? ` · avisos: ${r.erros.slice(0, 2).join(' | ')}` : '')
          );
          pedido = r.continua
            ? { fonteId: Number(fonteId), uf, ordenacao: r.proxima_ordenacao, pagina: r.proxima_pagina, encadear: false }
            : null;
        }
      } catch (erro) {
        console.error(`${uf} falhou: ${erro.message}`);
      }
    }
    await pool.end();
    return;
  }

  let fontes;
  if (fonteId) {
    const [linhas] = await pool.query('SELECT id, nome FROM fontes WHERE id = ?', [Number(fonteId)]);
    if (!linhas.length) {
      console.error(`Fonte ${fonteId} não existe.`);
      await pool.end();
      process.exit(1);
    }
    fontes = linhas;
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
