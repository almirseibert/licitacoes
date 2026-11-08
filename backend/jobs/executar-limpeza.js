// Higiene do volume (seção 14, `limpar_temporarios`).
//   npm run limpar
//   npm run limpar -- --dias=365    (mais conservador que o padrão de 180)
//   npm run limpar -- --horas=48    (só .tmp com mais de 48 h)
//
// Não vai à internet. Apaga `.tmp` esquecido e a documentação de licitação
// descartada há muito tempo — a ficha e o motivo do descarte ficam, porque é
// deles que a tela de diagnóstico vive.
const pool = require('../config/db');
const limpar = require('./limpar');

function argumento(nome, padrao) {
  const achado = process.argv.find((a) => a.startsWith(`--${nome}=`));
  if (!achado) return padrao;
  const n = Number(achado.split('=')[1]);
  return Number.isFinite(n) ? n : padrao;
}

const dias = argumento('dias', limpar.DIAS_DO_DESCARTE);
const horas = argumento('horas', limpar.HORAS_DO_TMP);

function mb(bytes) {
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

limpar
  .rodar({ dias, horas })
  .then(async ({ temporarios, descartadas }) => {
    console.log(
      `Temporários: ${temporarios.apagados} arquivo(s) .tmp com mais de ${horas} h apagados ` +
        `(${mb(temporarios.bytes)}).`
    );
    console.log(
      `Descartadas: ${descartadas.arquivos} arquivo(s) de ${descartadas.licitacoes} licitação(ões) ` +
        `descartada(s) há mais de ${dias} dias (${mb(descartadas.bytes)}).`
    );

    const erros = [...temporarios.erros, ...descartadas.erros];
    if (erros.length) {
      console.log(`\n${erros.length} caminho(s) com problema:`);
      for (const erro of erros.slice(0, 10)) console.log(`  · ${erro}`);
    }

    if (!temporarios.apagados && !descartadas.arquivos) {
      console.log('\nNada a limpar — o volume já está em ordem.');
    }
    await pool.end();
  })
  .catch(async (erro) => {
    console.error('Falha na limpeza:', erro.sqlMessage || erro.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
