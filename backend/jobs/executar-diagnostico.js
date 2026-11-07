// Fecha as vencidas sem análise e imprime o diagnóstico da seção 20.
//   npm run diagnostico
//   npm run diagnostico -- --periodo=365 --so-ler
// Mesma conta que a tela faz, no terminal — é assim que o aceite da Fase 9 é
// medido contra o banco real, sem depender do navegador.
const pool = require('../config/db');
const { descartarVencidas } = require('./descartar-vencidas');
const { diagnosticar } = require('../servicos/diagnostico');

const argumentos = process.argv.slice(2);
function opcao(nome, padrao) {
  const achado = argumentos.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.split('=')[1] : padrao;
}
const soLer = argumentos.includes('--so-ler');
const dias = Number(opcao('periodo', 90));

function dinheiro(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function licitacoes(n) {
  return n === 1 ? '1 licitação' : `${n} licitações`;
}

async function principal() {
  if (!soLer) {
    const fechadas = await descartarVencidas({});
    console.log(
      fechadas.descartadas
        ? `Prazo vencido sem análise: ${fechadas.descartadas} descartada(s), ${dinheiro(fechadas.valor)} estimados (corte < ${fechadas.corte} pontos).`
        : 'Nenhuma licitação com prazo vencido esperando análise.'
    );
  }

  const d = await diagnosticar({ dias });
  console.log(`\nO que mais te barrou nos últimos ${d.periodo.rotulo}\n`);

  if (!d.bloqueios.length) {
    console.log('  Nenhum descarte com motivo no período.');
  }
  for (const b of d.bloqueios) {
    const nome = b.rotulo.padEnd(42, '.');
    console.log(
      `  ${String(b.posicao).padStart(2)}. ${nome} ${licitacoes(b.licitacoes).padStart(16)}   ` +
        `${dinheiro(b.valor).padStart(18)} em jogo` +
        (b.resolver ? `\n      resolver: ${b.resolver} (custo ${b.custo_rotulo.toLowerCase()})` : '')
    );
  }

  if (d.simulacoes.length) {
    console.log('\nSimulação');
    for (const s of d.simulacoes) {
      console.log(
        `  Se você tivesse ${s.rotulo.toUpperCase()},\n` +
          `  ${licitacoes(s.licitacoes)} a mais ${s.licitacoes === 1 ? 'teria' : 'teriam'} sido ` +
          `elegíve${s.licitacoes === 1 ? 'l' : 'is'} — ${dinheiro(s.valor)} em valor estimado,\n` +
          `  e ao desconto mediano do grupo, cerca de ${dinheiro(s.disputavel)} em contratos disputáveis` +
          (s.parcial ? ' (parte do grupo sem mediana medida).' : '.')
      );
    }
  }

  console.log(
    `\nTotal no período: ${d.total.descartadas} descartadas, ${d.total.analisadas} com motivo, ` +
      `${d.nao_analisadas.licitacoes} por prazo vencido sem análise (${dinheiro(d.nao_analisadas.valor)}).`
  );
  if (d.nao_analisadas.recado) console.log(`Atenção: ${d.nao_analisadas.recado}`);
}

principal()
  .then(() => pool.end())
  .catch(async (erro) => {
    console.error('Falha no diagnóstico:', erro.sqlMessage || erro.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
