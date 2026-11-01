// Fila com dois drivers e uma interface só (seção 2.2).
//   FILA_DRIVER=mysql  (padrão) — tabela `tarefas`, polling + FOR UPDATE SKIP LOCKED
//   FILA_DRIVER=bullmq           — mesma interface, usando REDIS_URL
// O resto do código nunca sabe qual está em uso:
//   await fila.enfileirar('baixar_edital', { licitacaoId: 42 }, { prioridade: 5 });
const pool = require('../config/db');
const { fila: cfgFila } = require('../config/ambiente');

const manipuladores = new Map();

function registrar(tipo, funcao) {
  manipuladores.set(tipo, funcao);
}

// ---------------------------------------------------------------- driver mysql
const driverMysql = {
  async enfileirar(tipo, payload = {}, opcoes = {}) {
    const { prioridade = 10, agendadaPara = null, chaveUnica = null, maxTentativas = 3 } = opcoes;
    const [r] = await pool.query(
      `INSERT INTO tarefas (tipo, referencia_id, payload, prioridade, chave_unica, max_tentativas, agendada_para)
       VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))
       ON DUPLICATE KEY UPDATE
         status = IF(status IN ('ok','erro'), 'fila', status),
         tentativas = IF(status IN ('ok','erro'), 0, tentativas),
         erro = NULL,
         payload = VALUES(payload),
         prioridade = VALUES(prioridade),
         agendada_para = VALUES(agendada_para),
         id = LAST_INSERT_ID(id)`,
      [tipo, payload.licitacaoId || payload.fonteId || null, JSON.stringify(payload), prioridade, chaveUnica, maxTentativas, agendadaPara]
    );
    return r.insertId;
  },

  // Pega uma tarefa e a marca como rodando, sem que dois workers peguem a mesma.
  async reservar() {
    const conexao = await pool.getConnection();
    try {
      await conexao.beginTransaction();
      const [linhas] = await conexao.query(
        `SELECT * FROM tarefas
          WHERE status = 'fila' AND agendada_para <= NOW()
          ORDER BY prioridade ASC, id ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED`
      );
      if (!linhas.length) {
        await conexao.commit();
        return null;
      }
      const tarefa = linhas[0];
      await conexao.query(
        `UPDATE tarefas SET status='rodando', tentativas = tentativas + 1, iniciada_em = NOW() WHERE id = ?`,
        [tarefa.id]
      );
      await conexao.commit();
      return tarefa;
    } catch (erro) {
      await conexao.rollback();
      throw erro;
    } finally {
      conexao.release();
    }
  },

  async concluir(id) {
    await pool.query(`UPDATE tarefas SET status='ok', erro=NULL, concluida_em=NOW() WHERE id=?`, [id]);
  },

  async falhar(tarefa, erro) {
    const mensagem = String(erro && erro.message ? erro.message : erro).slice(0, 2000);
    const esgotou = tarefa.tentativas >= (tarefa.max_tentativas || 3);
    if (esgotou) {
      await pool.query(`UPDATE tarefas SET status='erro', erro=?, concluida_em=NOW() WHERE id=?`, [mensagem, tarefa.id]);
      return;
    }
    // espera progressiva: 1 min, 5 min, 15 min
    const esperaMin = [1, 5, 15][Math.min(tarefa.tentativas, 2)];
    await pool.query(
      `UPDATE tarefas SET status='fila', erro=?, agendada_para = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id=?`,
      [mensagem, esperaMin, tarefa.id]
    );
  },

  async resumo() {
    const [linhas] = await pool.query(
      `SELECT status, COUNT(*) AS total FROM tarefas GROUP BY status`
    );
    return linhas.reduce((acc, l) => ({ ...acc, [l.status]: Number(l.total) }), {});
  },

  // Laço do worker: roda até receber pedido de parada.
  async processar({ sinal }) {
    while (!sinal.parar) {
      let tarefa = null;
      try {
        tarefa = await driverMysql.reservar();
      } catch (erro) {
        console.error('Fila: erro ao reservar tarefa —', erro.message);
      }

      if (!tarefa) {
        await esperar(Math.min(cfgFila.intervaloMs, 30000), sinal);
        continue;
      }

      const manipulador = manipuladores.get(tarefa.tipo);
      if (!manipulador) {
        await driverMysql.falhar({ ...tarefa, tentativas: 99 }, new Error(`Sem manipulador para a tarefa "${tarefa.tipo}"`));
        continue;
      }

      const payload = normalizarPayload(tarefa.payload);
      const inicio = Date.now();
      try {
        console.log(`→ tarefa #${tarefa.id} ${tarefa.tipo}`, payload);
        await manipulador(payload, tarefa);
        await driverMysql.concluir(tarefa.id);
        console.log(`✓ tarefa #${tarefa.id} ${tarefa.tipo} em ${Date.now() - inicio} ms`);
      } catch (erro) {
        console.error(`✗ tarefa #${tarefa.id} ${tarefa.tipo}: ${erro.message}`);
        await driverMysql.falhar(tarefa, erro);
      }
    }
  },
};

// --------------------------------------------------------------- driver bullmq
// Carregado só se FILA_DRIVER=bullmq, para não exigir Redis nem o pacote na Fase 1.
function criarDriverBullmq() {
  let bullmq;
  try {
    bullmq = require('bullmq');
  } catch {
    throw new Error('FILA_DRIVER=bullmq exige o pacote bullmq instalado (npm i bullmq).');
  }
  if (!cfgFila.redisUrl) throw new Error('FILA_DRIVER=bullmq exige REDIS_URL. Veja a seção 2.3.');

  const conexao = { url: cfgFila.redisUrl };
  const NOME = 'licitacoes';
  const fila = new bullmq.Queue(NOME, { connection: conexao });

  return {
    async enfileirar(tipo, payload = {}, opcoes = {}) {
      const trabalho = await fila.add(tipo, payload, {
        priority: opcoes.prioridade || 10,
        delay: opcoes.agendadaPara ? Math.max(0, new Date(opcoes.agendadaPara) - Date.now()) : 0,
        jobId: opcoes.chaveUnica || undefined,
        attempts: opcoes.maxTentativas || 3,
        backoff: { type: 'exponential', delay: 60000 },
        removeOnComplete: 500,
        removeOnFail: 500,
      });
      return trabalho.id;
    },
    async resumo() {
      const c = await fila.getJobCounts();
      return { fila: c.waiting + c.delayed, rodando: c.active, ok: c.completed, erro: c.failed };
    },
    async processar({ sinal }) {
      const trabalhador = new bullmq.Worker(
        NOME,
        async (trabalho) => {
          const manipulador = manipuladores.get(trabalho.name);
          if (!manipulador) throw new Error(`Sem manipulador para a tarefa "${trabalho.name}"`);
          return manipulador(trabalho.data, trabalho);
        },
        { connection: conexao, concurrency: 2 }
      );
      await new Promise((resolver) => {
        const checar = setInterval(() => {
          if (sinal.parar) { clearInterval(checar); resolver(); }
        }, 500);
      });
      await trabalhador.close();
    },
  };
}

function normalizarPayload(payload) {
  if (!payload) return {};
  if (typeof payload === 'string') {
    try { return JSON.parse(payload); } catch { return {}; }
  }
  return payload;
}

function esperar(ms, sinal) {
  return new Promise((resolver) => {
    const fim = setTimeout(resolver, ms);
    if (sinal) {
      const checar = setInterval(() => {
        if (sinal.parar) { clearTimeout(fim); clearInterval(checar); resolver(); }
      }, 250);
      setTimeout(() => clearInterval(checar), ms + 50);
    }
  });
}

const driver = cfgFila.driver === 'bullmq' ? criarDriverBullmq() : driverMysql;

module.exports = {
  driver: cfgFila.driver,
  registrar,
  enfileirar: (...args) => driver.enfileirar(...args),
  resumo: () => driver.resumo(),
  processar: (...args) => driver.processar(...args),
};
