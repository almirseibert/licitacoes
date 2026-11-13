// Uma rodada do monitor (seção 21), pela linha de comando.
//   npm run monitorar
//   npm run monitorar -- --limite=5 --licitacao=677
// Com `--licitacao` checa só aquela, agora, ignorando a cadência — é assim que
// se confere à mão se o portal mudou alguma coisa.
const pool = require('../config/db');
const monitorar = require('./monitorar');
const servico = require('../servicos/monitor');
const escopo = require('../servicos/escopo');

const argumentos = process.argv.slice(2);
function opcao(nome, padrao) {
  const achado = argumentos.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.split('=')[1] : padrao;
}

async function uma(licitacaoId) {
  // Seção 1b: o monitoramento é de uma organização (`--org=`, padrão 1).
  const organizacaoId = escopo.organizacaoDaLinhaDeComando();
  await servico.ligar({ organizacaoId, licitacaoId: Number(licitacaoId), motivo: 'interesse' });
  const [[completo]] = await pool.query(
    `SELECT m.*, l.etapa, l.objeto, l.orgao_nome, l.orgao_cnpj, l.chave_externa, l.fonte_id,
            l.abertura_propostas, l.fim_propostas, l.situacao, l.valor_estimado, l.pasta, f.adaptador
       FROM monitoramentos m
       JOIN ${escopo.daOrganizacao(organizacaoId, { todas: true })} l ON l.id = m.licitacao_id
       JOIN fontes f ON f.id = l.fonte_id
      WHERE m.organizacao_id = ? AND m.licitacao_id = ?`,
    [organizacaoId, licitacaoId]
  );
  if (!completo) throw new Error(`licitação ${licitacaoId} não encontrada`);

  const r = await monitorar.checar(completo);
  console.log(`Licitação ${licitacaoId}: ${r.eventos.length ? r.eventos.join('; ') : 'nada mudou no portal'}.`);
  console.log(
    r.proxima
      ? `Próxima checagem: ${new Date(r.proxima).toLocaleString('pt-BR')} (cadência "${r.cadencia}").`
      : 'Monitoramento encerrado: não há mais o que observar nesta licitação.'
  );
}

async function principal() {
  const licitacao = opcao('licitacao');
  if (licitacao) return uma(licitacao);

  const r = await monitorar.monitorar({ limite: Number(opcao('limite', 25)) });
  console.log(
    `Monitor: ${r.ligados} monitoramento(s) novos, ${r.checadas} licitação(ões) checadas, ` +
      `${r.eventos} evento(s), ${r.alertas} alerta(s), ${r.encerrados} encerrados.`
  );
  for (const erro of r.erros) console.log(`  · ${erro}`);
}

principal()
  .then(() => pool.end())
  .catch(async (erro) => {
    console.error('Falha no monitor:', erro.sqlMessage || erro.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
