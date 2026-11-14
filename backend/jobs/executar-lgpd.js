// Exclusão de dados sob pedido (LGPD — Seção 17).
//   npm run lgpd              executa os pedidos cuja carência de 7 dias já venceu
//   npm run lgpd -- --listar  só mostra os pedidos agendados, sem apagar nada
//
// É o que o worker já faz de hora em hora; a linha de comando serve para rodar na
// mão e para conferir o que está agendado. Não vai à internet.
const pool = require('../config/db');
const lgpd = require('../servicos/lgpd');

const listar = process.argv.includes('--listar');

async function principal() {
  if (listar) {
    const [linhas] = await pool.query(
      'SELECT id, nome, exclusao_agendada_em FROM organizacoes WHERE exclusao_agendada_em IS NOT NULL ORDER BY exclusao_agendada_em'
    );
    if (!linhas.length) console.log('Nenhuma exclusão agendada.');
    for (const o of linhas) console.log(`Organização ${o.id} (${o.nome}): exclusão em ${new Date(o.exclusao_agendada_em).toISOString()}.`);
    return;
  }
  const r = await lgpd.excluirVencidas();
  for (const e of r.excluidas) {
    console.log(`Organização ${e.id} (${e.organizacao}) excluída: ${e.linhas} linha(s), ${e.arquivos} arquivo(s), ${e.usuarios} usuário(s).`);
    for (const f of e.falhas) console.log(`  · não apagado: ${f}`);
  }
  for (const erro of r.erros) console.log(`Erro: ${erro}`);
  if (!r.excluidas.length && !r.erros.length) console.log('Nada a excluir: nenhum pedido com a carência vencida.');
}

principal()
  .then(() => pool.end())
  .catch(async (erro) => {
    console.error('Falha na exclusão de dados:', erro.sqlMessage || erro.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
