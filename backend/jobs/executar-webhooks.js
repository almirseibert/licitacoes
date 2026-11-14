// Webhook de novas oportunidades (Seção 14 do PLANO_SAAS_CONLICITACAO.md), pela linha de comando.
//   npm run webhooks                       uma rodada do worker (todos os webhooks ativos)
//   npm run webhooks -- --org=<id>         só os da organização
//   npm run webhooks -- --webhook=<id>     só um
//   --simular                              mostra o que seria entregue; não envia nem grava
const pool = require('../config/db');
const webhooks = require('./webhooks');

const argumentos = process.argv.slice(2);
const valor = (nome) => {
  const achado = argumentos.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.slice(nome.length + 3) : null;
};
const simular = argumentos.includes('--simular');

async function principal() {
  const r = await webhooks.rodar({ org: valor('org'), webhookId: valor('webhook'), simular });
  console.log(`Webhooks ${simular ? '(simulação) ' : ''}— ${r.webhooks} ativo(s)\n`);
  if (!r.entregas.length) console.log('  Nada a entregar agora.');
  for (const e of r.entregas) {
    const estado = e.simulado ? 'simulado' : e.erro ? `FALHOU: ${e.erro}` : 'ok';
    console.log(`  Org ${e.organizacao_id} · webhook ${e.webhook_id} · filtro "${e.filtro || '-'}" — ${e.novos} novo(s), ${e.entregues} entregue(s) (${estado})`);
  }
  for (const e of r.erros) console.log(`  Erro: ${e}`);
}

principal()
  .then(() => pool.end())
  .catch(async (erro) => {
    console.error('Falha nos webhooks:', erro.sqlMessage || erro.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
