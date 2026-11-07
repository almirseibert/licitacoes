// Varredura de estratégicas (seção 22.3), pela linha de comando.
//   npm run estrategicas
//   npm run estrategicas -- --dias=365
// Não vai à internet: lê o que a coleta já trouxe.
const pool = require('../config/db');
const estrategicas = require('./estrategicas');

const argumentos = process.argv.slice(2);
const achado = argumentos.find((a) => a.startsWith('--dias='));
const dias = achado ? Number(achado.split('=')[1]) : estrategicas.DIAS;

function dinheiro(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

async function principal() {
  const r = await estrategicas.varrerEstrategicas({ dias });

  console.log(`Varredura de estratégicas — janela de ${dias} dias\n`);
  if (r.assinaturas) console.log(`  ${r.assinaturas} assinatura(s) de objeto calculadas.`);
  console.log(`  Radar:   ${r.radar.itens} item(ns) sem vencedor, ${r.radar.criadas} oportunidade(s) novas.`);
  console.log(`  Amostra: ${r.amostra.encerradas} encerrada(s) sem homologação, ${r.amostra.criadas} novas.`);
  console.log(`  Reaberturas: ${r.reaberturas.ligadas} ligada(s), ${r.reaberturas.avisos} alerta(s).`);
  console.log(
    `\n  ${r.aguardando} oportunidade(s) aguardando, ${dinheiro(r.valor)} em jogo; ` +
      `${r.reabertas} já reaberta(s) pelo órgão.`
  );

  const [melhores] = await pool.query(
    `SELECT orgao_nome, uf, objeto, valor_estimado, DATEDIFF(CURDATE(), encerrada_em) AS dias_desde
       FROM oportunidades_retomada
      WHERE situacao = 'aguardando'
      ORDER BY valor_estimado DESC LIMIT 10`
  );
  if (melhores.length) {
    console.log('\n  As dez maiores:');
    for (const o of melhores) {
      const objeto = String(o.objeto || '').replace(/\s+/g, ' ').slice(0, 68);
      console.log(
        `   ${dinheiro(o.valor_estimado).padStart(16)}  ${String(o.uf || '--')}  ` +
          `há ${String(o.dias_desde).padStart(3)}d  ${objeto}`
      );
    }
  }
}

principal()
  .then(() => pool.end())
  .catch(async (erro) => {
    console.error('Falha na varredura:', erro.sqlMessage || erro.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
