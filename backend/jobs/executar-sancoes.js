// CEIS e CNEP do próprio CNPJ e dos concorrentes recorrentes (seções 14 e 26.3).
//   npm run sancoes
//   npm run sancoes -- --quantos=25
//
// Sem PORTAL_TRANSPARENCIA_CHAVE o job não faz nada e diz por quê — e isso é
// diferente de "nenhuma sanção": consulta que não aconteceu não é resposta.
const pool = require('../config/db');
const sancoesMensais = require('./sancoes-mensais');

const achado = process.argv.find((a) => a.startsWith('--quantos='));
const quantos = achado ? Number(achado.split('=')[1]) : undefined;

sancoesMensais
  .rodar(Number.isFinite(quantos) ? { quantos } : {})
  .then(async (r) => {
    if (!r.ligado) {
      console.log(`Consulta de sanções desligada: ${r.motivo}.`);
      console.log('A chave é gratuita, pelo cadastro no gov.br (seção 26.3).');
      await pool.end();
      return;
    }

    if (r.propria && r.propria.ok === false) {
      console.log(`Própria empresa: ${r.propria.motivo}`);
    } else if (r.propria) {
      console.log(`Própria empresa: ${r.propria.resumo}`);
    }

    console.log(`\n${r.consultados} consulta(s) feita(s) (cache de 30 dias conta como consulta).`);
    if (r.sancionados.length) {
      console.log(`Com registro em CEIS/CNEP — confira a vigência antes de concluir:`);
      for (const nome of r.sancionados) console.log(`  · ${nome}`);
    } else {
      console.log('Nenhum registro em CEIS/CNEP entre os consultados.');
    }

    if (r.erros.length) {
      console.log(`\n${r.erros.length} consulta(s) com erro:`);
      for (const erro of r.erros.slice(0, 10)) console.log(`  · ${erro}`);
    }
    await pool.end();
  })
  .catch(async (erro) => {
    console.error('Falha ao consultar sanções:', erro.sqlMessage || erro.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
