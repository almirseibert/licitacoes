// Calcula os prazos de esclarecimento e impugnação (seção 25).
//   npm run prazos
//   npm run prazos -- --licitacao=195
// Importa os feriados nacionais do ano antes de contar.
const pool = require('../config/db');
const job = require('./questionamentos');
const servico = require('../servicos/questionamento');

const achado = process.argv.slice(2).find((a) => a.startsWith('--licitacao='));

async function principal() {
  if (achado) {
    const id = Number(achado.split('=')[1]);
    const r = await servico.calcular(id);
    if (!r) return console.log(`Licitação ${id} não encontrada.`);
    if (!r.prazo) return console.log(`Licitação ${id}: ${r.motivo}`);

    console.log(`Licitação ${id}`);
    console.log(`  limite: ${r.prazo.limite.toLocaleString('pt-BR')} (${r.prazo.hora_limite}h suposta)`);
    console.log(`  dias úteis: ${r.prazo.uteis_contados.join(', ')}`);
    if (r.prazo.pulados.length) {
      console.log(`  pulou: ${r.prazo.pulados.map((p) => `${p.data} (${p.motivo})`).join(', ')}`);
    }
    console.log(`  ${r.prazo.vencido ? 'VENCIDO' : r.prazo.urgente ? 'último dia' : `faltam ${Math.round(r.prazo.horas_restantes)} h`}`);
    return;
  }

  const r = await job.rodar({});
  console.log(
    `${r.calculados} prazo(s) calculados de ${r.avaliadas} licitações, com ${r.feriados} feriados na base. ` +
      `${r.sem_abertura} sem data de abertura. ${r.criados} alerta(s) de último dia criados.`
  );
}

principal()
  .then(() => pool.end())
  .catch(async (erro) => {
    console.error('Falha nos prazos:', erro.sqlMessage || erro.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
