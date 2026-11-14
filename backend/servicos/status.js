// Status das ferramentas (Seção 17): lê os sinais do banco e deixa a regra
// (regras/status.js) dizer se está no ar. Também grava o batimento do worker.
const pool = require('../config/db');
const regras = require('../regras/status');
const email = require('./email');

const NOME_WORKER = 'worker';

/** Chamado pelo worker a cada minuto. Falha não derruba o worker. */
async function baterWorker() {
  try {
    await pool.query(
      'INSERT INTO worker_batimentos (nome, em) VALUES (?, NOW()) ON DUPLICATE KEY UPDATE em = NOW()',
      [NOME_WORKER]
    );
  } catch (erro) {
    console.error('Batimento do worker não gravou:', erro.message);
  }
}

async function ler(organizacaoId, agora = new Date()) {
  const itens = [];
  const antes = Date.now();
  let bancoOk = true;
  try {
    await pool.query('SELECT 1');
  } catch (erro) {
    bancoOk = false;
    console.error('Status: banco não respondeu —', erro.message);
  }
  itens.push({
    chave: 'banco',
    rotulo: 'Banco de dados',
    nivel: bancoOk ? 'ok' : 'parado',
    mensagem: bancoOk ? `Respondendo em ${Date.now() - antes} ms.` : 'O banco não respondeu.',
  });
  if (!bancoOk) return { geral: 'parado', verificado_em: agora.toISOString(), itens, fontes: [] };

  const [[batimento]] = await pool.query('SELECT em FROM worker_batimentos WHERE nome = ?', [NOME_WORKER]);
  itens.push({ chave: 'worker', rotulo: 'Worker (coleta, boletim e avisos)', ...regras.worker(batimento ? batimento.em : null, agora) });

  const [filas] = await pool.query('SELECT status, COUNT(*) AS total FROM tarefas GROUP BY status');
  const contagem = Object.fromEntries(filas.map((f) => [f.status, Number(f.total)]));
  const [[velha]] = await pool.query(
    "SELECT TIMESTAMPDIFF(MINUTE, MIN(agendada_para), NOW()) AS minutos FROM tarefas WHERE status = 'fila' AND agendada_para <= NOW()"
  );
  itens.push({ chave: 'fila', rotulo: 'Fila de tarefas', ...regras.fila(contagem, velha ? velha.minutos : 0) });

  const [fontes] = await pool.query('SELECT id, nome, ativa, intervalo_horas, ultima_coleta, ultimo_status FROM fontes ORDER BY nome');
  itens.push({ chave: 'coleta', rotulo: 'Coleta das fontes', ...regras.coleta(fontes, agora) });

  const [[ultimoBoletim]] = await pool.query(
    'SELECT data, total_itens, email_status FROM boletins WHERE organizacao_id = ? ORDER BY id DESC LIMIT 1',
    [organizacaoId]
  );
  itens.push({
    chave: 'boletim',
    rotulo: 'Boletim da sua organização',
    nivel: ultimoBoletim ? (['erro'].includes(ultimoBoletim.email_status) ? 'atrasado' : 'ok') : 'desligado',
    mensagem: ultimoBoletim
      ? `Último boletim em ${String(ultimoBoletim.data).slice(0, 10)}: ${ultimoBoletim.total_itens} licitação(ões), e-mail ${ultimoBoletim.email_status || 'enviado'}.`
      : 'Nenhum boletim gerado ainda.',
  });

  itens.push({ chave: 'email', rotulo: 'Envio de e-mail', ...regras.recurso(email.servicoLigado(), 'O envio de e-mail', 'sem SMTP configurado o boletim e os avisos ficam só no painel') });
  itens.push({ chave: 'ia', rotulo: 'Leitura assistida (IA)', ...regras.recurso(Boolean(process.env.GEMINI_API_KEY), 'A leitura assistida', 'o painel funciona inteiro sem ela') });

  return {
    geral: regras.geral(itens),
    verificado_em: agora.toISOString(),
    itens,
    fontes: fontes.map((f) => ({ nome: f.nome, ativa: Boolean(f.ativa), ultima_coleta: f.ultima_coleta, ultimo_status: f.ultimo_status })),
  };
}

module.exports = { baterWorker, ler, NOME_WORKER };
