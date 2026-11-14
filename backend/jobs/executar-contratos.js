// Alertas de marco de contrato e a faixa da LC 123 (seção 28).
//   npm run contratos
//   npm run contratos -- --contrato=3     mostra o contrato e os marcos
const pool = require('../config/db');
const job = require('./contratos');
const servico = require('../servicos/contrato');

const moeda = (valor) =>
  valor === null || valor === undefined
    ? '—'
    : `R$ ${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const achado = process.argv.slice(2).find((a) => a.startsWith('--contrato='));
// Seção 1b: a linha de comando enxerga a organização pedida (padrão: a 1).
const organizacaoId = require('../servicos/escopo').organizacaoDaLinhaDeComando();

async function principal() {
  if (achado) {
    const id = Number(achado.split('=')[1]);
    const r = await servico.ver(organizacaoId, id);
    if (!r) return console.log(`Contrato ${id} não encontrado.`);

    console.log(`Contrato ${r.contrato.numero || `(sem número) #${r.contrato.id}`} — ${r.contrato.situacao}`);
    console.log(`  licitação ${r.contrato.licitacao_id}: ${String(r.contrato.objeto || '').slice(0, 90)}`);
    console.log(`  órgão: ${r.contrato.orgao_nome || '—'}`);
    console.log(`  valor: ${moeda(r.contrato.valor)} · executado: ${moeda(r.contrato.valor_executado)}`);
    console.log('  marcos:');
    for (const m of r.marcos) {
      const estado = m.concluido_em
        ? `concluído em ${servico.comoDia(m.concluido_em)}`
        : m.previsto_para
          ? `previsto para ${servico.comoDia(m.previsto_para)}`
          : 'sem data';
      console.log(`    ${String(m.ordem).padStart(2)} ${m.tipo.padEnd(12)} ${estado}  ${m.titulo}`);
    }
    if (r.proximo) {
      console.log(
        `  próximo: ${r.proximo.titulo}` +
          (r.proximo.dias_restantes === null
            ? ' (sem data)'
            : r.proximo.atrasado
              ? ` — ATRASADO há ${Math.abs(r.proximo.dias_restantes)} dia(s)`
              : ` — faltam ${r.proximo.dias_restantes} dia(s)`)
      );
    }

    const faixa = await servico.receita12m(organizacaoId);
    console.log(
      `  faixa: ${faixa.faixa} · receita ${moeda(faixa.receita)} (${faixa.origem}) · ` +
        `falta ${moeda(faixa.falta_para_proxima)} para ${faixa.proxima || 'sair da faixa'}`
    );
    return;
  }

  const r = await job.rodar({});
  console.log(
    `${r.criados} alerta(s) de marco criados de ${r.marcos_abertos} marco(s) abertos ` +
      `(${r.atrasados} atrasado(s)). ${r.viraram_vigentes} contrato(s) viraram vigentes, ` +
      `${r.encerrados} encerrados. Faixa: ${r.faixa.faixa || '—'}` +
      (r.faixa.criados ? ` (${r.faixa.criados} aviso(s) de enquadramento)` : '') + '.'
  );
}

principal()
  .then(() => pool.end())
  .catch(async (erro) => {
    console.error('Falha nos contratos:', erro.sqlMessage || erro.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
