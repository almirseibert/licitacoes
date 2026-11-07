// Detecta as recorrências e imprime o calendário (seção 24).
//   npm run recorrencias
//   npm run recorrencias -- --anos=4 --so-ler
// Não vai à internet: lê o que a coleta já trouxe.
const pool = require('../config/db');
const recorrencias = require('./recorrencias');

const argumentos = process.argv.slice(2);
function opcao(nome, padrao) {
  const achado = argumentos.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.split('=')[1] : padrao;
}
const soLer = argumentos.includes('--so-ler');
const anos = Number(opcao('anos', recorrencias.ANOS));

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function dinheiro(valor) {
  if (valor === null || valor === undefined) return '—';
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

async function principal() {
  if (!soLer) {
    const r = await recorrencias.detectarRecorrencias({ anos });
    console.log(
      `${r.contratacoes} contratações de ${r.orgaos} órgãos nos últimos ${anos} anos → ` +
        `${r.recorrencias} recorrência(s), ${r.novas} nova(s).\n`
    );
    const avisos = await recorrencias.avisarRecorrencias({});
    if (avisos.criados) console.log(`${avisos.criados} alerta(s) de 60/30 dias criados.\n`);
  }

  const [linhas] = await pool.query(
    `SELECT *, DATEDIFF(proxima_prevista, CURDATE()) AS faltam
       FROM recorrencias ORDER BY proxima_prevista IS NULL, proxima_prevista ASC`
  );

  if (!linhas.length) {
    console.log('Nenhuma recorrência: ainda não há duas contratações do mesmo objeto, no mesmo órgão, em anos diferentes.');
    return;
  }

  console.log('Recorrências detectadas\n');
  for (const r of linhas) {
    const objeto = String(r.objeto_exemplo || r.assinatura_objeto).replace(/\s+/g, ' ').slice(0, 52);
    const mes = r.mes_tipico ? MESES[r.mes_tipico - 1] : '—';
    console.log(
      `  ${String(r.ocorrencias)}× conf ${Number(r.confianca).toFixed(2)}  ` +
        `${String(r.uf || '--')}  ${String(r.orgao_nome || '').slice(0, 30).padEnd(30)}  ` +
        `${objeto.padEnd(52)}  típico ${mes}  ` +
        `a cada ${String(r.intervalo_medio_dias || '—').padStart(4)}d  ` +
        `próxima ${r.proxima_prevista ? String(r.proxima_prevista).slice(0, 10) : 'sem previsão'}  ` +
        `${dinheiro(r.valor_medio).padStart(14)}`
    );
  }

  const comprovadas = linhas.filter((r) => r.ocorrencias >= 2).length;
  const previstas = linhas.filter((r) => r.proxima_prevista).length;
  console.log(
    `\n${comprovadas} com duas ocorrências ou mais; ${previstas} com janela prevista à frente.`
  );
}

principal()
  .then(() => pool.end())
  .catch(async (erro) => {
    console.error('Falha ao detectar recorrências:', erro.sqlMessage || erro.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
