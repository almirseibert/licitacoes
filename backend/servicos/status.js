// Status das ferramentas (Seção 17): lê os sinais do banco e deixa a regra
// (regras/status.js) dizer se está no ar. Também grava o batimento do worker.
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const { dirDados } = require('../config/ambiente');
const regras = require('../regras/status');
const email = require('./email');
const fila = require('./fila');
const { dia } = require('../regras/gestao');

const NOME_WORKER = 'worker';
const SINAL_DO_VOLUME = '.sinal-worker';

/** Quando o worker gravou o sinal no volume que ESTE processo enxerga; null se não vê. */
function lerSinalDoVolume() {
  try {
    const quando = new Date(fs.readFileSync(path.join(dirDados, SINAL_DO_VOLUME), 'utf8').trim());
    return Number.isNaN(quando.getTime()) ? null : quando;
  } catch {
    return null;
  }
}

/** Chamado pelo worker a cada minuto. Falha não derruba o worker. */
async function baterWorker() {
  // O sinal no volume: a API o procura para saber se enxerga o mesmo /dados (regras/status.js `volume`).
  try {
    fs.mkdirSync(dirDados, { recursive: true });
    fs.writeFileSync(path.join(dirDados, SINAL_DO_VOLUME), new Date().toISOString());
  } catch (erro) {
    console.error(`Sinal do volume não gravou em ${dirDados}:`, erro.message);
  }
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
  const antes = Date.now();
  let lido;
  try {
    // Uma consulta que falha já diz que o banco não está respondendo: não há `SELECT 1` à parte.
    lido = await Promise.all([
      pool.query('SELECT em FROM worker_batimentos WHERE nome = ?', [NOME_WORKER]),
      fila.resumo(),
      pool.query(
        "SELECT TIMESTAMPDIFF(MINUTE, MIN(agendada_para), NOW()) AS minutos FROM tarefas WHERE status = 'fila' AND agendada_para <= NOW()"
      ),
      pool.query('SELECT id, nome, ativa, intervalo_horas, ultima_coleta, ultimo_status FROM fontes ORDER BY nome'),
      pool.query('SELECT data, total_itens, email_status FROM boletins WHERE organizacao_id = ? ORDER BY id DESC LIMIT 1', [organizacaoId]),
    ]);
  } catch (erro) {
    console.error('Status: banco não respondeu —', erro.message);
    return {
      geral: 'parado',
      verificado_em: agora.toISOString(),
      itens: [{ chave: 'banco', rotulo: 'Banco de dados', nivel: 'parado', mensagem: 'O banco não respondeu.' }],
      fontes: [],
    };
  }
  const [[[batimento]], contagem, [[velha]], [fontes], [[ultimoBoletim]]] = lido;

  const itens = [
    { chave: 'banco', rotulo: 'Banco de dados', nivel: 'ok', mensagem: `Respondendo em ${Date.now() - antes} ms.` },
    { chave: 'worker', rotulo: 'Worker (coleta, boletim e avisos)', ...regras.worker(batimento ? batimento.em : null, agora) },
    { chave: 'volume', rotulo: 'Volume de arquivos (/dados)', ...regras.volume(lerSinalDoVolume(), batimento ? batimento.em : null, agora) },
    { chave: 'fila', rotulo: 'Fila de tarefas', ...regras.fila(contagem, velha ? velha.minutos : 0) },
    { chave: 'coleta', rotulo: 'Coleta das fontes', ...regras.coleta(fontes, agora) },
    {
      chave: 'boletim',
      rotulo: 'Boletim da sua organização',
      nivel: ultimoBoletim ? (ultimoBoletim.email_status === 'erro' ? 'atrasado' : 'ok') : 'desligado',
      mensagem: ultimoBoletim
        ? `Último boletim em ${dia(ultimoBoletim.data)}: ${ultimoBoletim.total_itens} licitação(ões), e-mail ${ultimoBoletim.email_status || 'enviado'}.`
        : 'Nenhum boletim gerado ainda.',
    },
    { chave: 'email', rotulo: 'Envio de e-mail', ...regras.recurso(email.servicoLigado(), 'O envio de e-mail', 'sem SMTP configurado o boletim e os avisos ficam só no painel') },
    { chave: 'ia', rotulo: 'Leitura assistida (IA)', ...regras.recurso(Boolean(process.env.GEMINI_API_KEY), 'A leitura assistida', 'o painel funciona inteiro sem ela') },
  ];

  return {
    geral: regras.geral(itens),
    verificado_em: agora.toISOString(),
    itens,
    fontes: fontes.map((f) => ({ nome: f.nome, ativa: Boolean(f.ativa), ultima_coleta: f.ultima_coleta, ultimo_status: f.ultimo_status })),
  };
}

module.exports = { baterWorker, ler };
