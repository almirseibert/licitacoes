// Boletim diário (Seção 4 do PLANO_SAAS_CONLICITACAO.md), pela linha de comando.
//   npm run boletim -- --org=<id> --simular   mostra o que sairia agora; não grava nem envia
//   npm run boletim -- --org=<id>             gera e envia já, no horário da hora corrente
//   npm run boletim                           uma rodada do worker (só os horários vencidos)
//   --dias=N                                  janela de coleta (padrão 3 dias)
const pool = require('../config/db');
const boletim = require('./boletim');
const regras = require('../regras/boletim');

const argumentos = process.argv.slice(2);
const valor = (nome) => {
  const achado = argumentos.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.slice(nome.length + 3) : null;
};
const simular = argumentos.includes('--simular');
const org = valor('org');
const dias = valor('dias') ? Number(valor('dias')) : boletim.DIAS_JANELA;

async function principal() {
  const r = await boletim.rodar({ org, simular, forcar: Boolean(org), dias });
  console.log(`Boletim ${simular ? '(simulação) ' : ''}— ${r.data} ${String(r.hora).padStart(2, '0')}h, janela de ${dias} dia(s)\n`);
  if (!r.boletins.length) console.log('  Nenhum boletim devido agora.');
  for (const b of r.boletins) {
    const estado = b.ja_gerado ? 'já gerado nesta hora' : b.simulado ? 'simulado' : `nº ${b.numero || '-'}, e-mail: ${b.email}`;
    console.log(`  Org ${b.organizacao_id} · filtro "${b.perfil}" · ${b.horario}h — ${b.total_itens} licitação(ões) (${estado})`);
    for (const i of (b.itens || []).slice(0, 15)) {
      const casou = i.palavra ? `"${i.palavra}" no ${i.onde}` : 'sem palavra';
      console.log(
        `     #${String(i.id).padEnd(5)} ${String(i.uf || '--')} ${regras.formatarValor(i).padStart(16)}  ${casou.padEnd(32)} ` +
          String(i.objeto || '').replace(/\s+/g, ' ').slice(0, 60)
      );
    }
    if ((b.itens || []).length > 15) console.log(`     … e mais ${b.itens.length - 15}.`);
  }
  for (const e of r.erros) console.log(`  Erro: ${e}`);
}

principal()
  .then(() => pool.end())
  .catch(async (erro) => {
    console.error('Falha no boletim:', erro.sqlMessage || erro.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
