// Monitor de andamento e resultado (seção 21) — a parte que fala com o banco.
// A cadência e os hashes ficam em regras/monitor.js.
const pool = require('../config/db');
const regras = require('../regras/monitor');
const alertas = require('./alertas');

/**
 * Registra um evento na linha do tempo (seção 21.4).
 * Idempotente pela chave: o job pode rodar dez vezes sem criar dez linhas.
 *
 * @returns {boolean} true quando o evento é novo
 */
async function registrarEvento({ licitacaoId, tipo, descricao, dados = null, ocorridoEm = null, chave = null }) {
  const [r] = await pool.query(
    `INSERT INTO eventos_licitacao (licitacao_id, tipo, descricao, dados, ocorrido_em, chave)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [
      licitacaoId,
      tipo,
      String(descricao || '').slice(0, 500),
      dados ? JSON.stringify(dados) : null,
      ocorridoEm || new Date(),
      chave || `${tipo}:${licitacaoId}:${Date.now()}`,
    ]
  );
  return Boolean(r.insertId);
}

/**
 * Liga (ou religa) o monitoramento de uma licitação.
 * Religar não zera o contador nem os hashes: a história do que já foi visto é
 * justamente o que permite detectar que mudou.
 */
async function ligar({ licitacaoId, motivo = 'interesse', agora = new Date() }) {
  const [[licitacao]] = await pool.query(
    'SELECT id, etapa, fim_propostas FROM licitacoes WHERE id = ?',
    [licitacaoId]
  );
  if (!licitacao) return null;

  // Monitoramento novo vence agora, não daqui a uma cadência: é a primeira
  // checagem que grava os hashes, e sem eles não há com o que comparar depois.
  // Esperar uma semana para estabelecer a linha de base deixaria o monitor
  // cego justamente na janela em que o edital costuma mudar.
  //
  // Religar não mexe no relógio de quem já está sendo vigiado — para isso a
  // tela tem "checar agora".
  await pool.query(
    `INSERT INTO monitoramentos (licitacao_id, motivo, ativo, proxima_checagem)
     VALUES (?, ?, 1, NOW())
     ON DUPLICATE KEY UPDATE
       ativo = 1,
       motivo = VALUES(motivo),
       encerrado_em = NULL,
       proxima_checagem = COALESCE(proxima_checagem, NOW())`,
    [licitacaoId, motivo]
  );

  const [[monitoramento]] = await pool.query('SELECT * FROM monitoramentos WHERE licitacao_id = ?', [licitacaoId]);
  return monitoramento;
}

async function desligar(licitacaoId, motivo = null) {
  await pool.query(
    'UPDATE monitoramentos SET ativo = 0, encerrado_em = NOW(), ultimo_erro = ? WHERE licitacao_id = ?',
    [motivo, licitacaoId]
  );
}

/**
 * Liga o monitoramento de tudo o que merece ser vigiado e ainda não é
 * (seção 21.2): o que está em disputa, o favorito, e as encerradas recentes
 * que alimentam a base de preços.
 */
async function ligarOsQueFaltam({ limite = 500 } = {}) {
  const [candidatas] = await pool.query(
    `SELECT l.id, l.etapa, l.fim_propostas, l.favorito, l.pontuacao
       FROM licitacoes l
       LEFT JOIN monitoramentos m ON m.licitacao_id = l.id
      WHERE m.id IS NULL
        AND l.descartada = 0
        AND (
          l.etapa IN (?, ?, ?)
          OR l.favorito = 1
          OR (l.fim_propostas IS NOT NULL
              AND l.fim_propostas < NOW()
              AND l.fim_propostas >= DATE_SUB(NOW(), INTERVAL ? DAY))
        )
      ORDER BY FIELD(l.etapa, ?, ?, ?) DESC, l.pontuacao DESC
      LIMIT ?`,
    [...regras.ETAPAS_DISPUTANDO, regras.DIAS_PRECO, ...regras.ETAPAS_DISPUTANDO, limite]
  );

  const agora = new Date();
  let ligados = 0;
  for (const licitacao of candidatas) {
    const cadencia = regras.cadenciaDe(licitacao, agora);
    if (!cadencia) continue;
    const motivo = regras.ETAPAS_DISPUTANDO.includes(licitacao.etapa)
      ? 'disputando'
      : licitacao.favorito
        ? 'interesse'
        : 'preco';
    await ligar({ licitacaoId: licitacao.id, motivo, agora });
    ligados += 1;
  }
  return { ligados, candidatas: candidatas.length };
}

/** As que estão na hora de olhar, na ordem em que importam. */
async function devidas({ limite = 40 } = {}) {
  const [linhas] = await pool.query(
    `SELECT m.*, l.etapa, l.objeto, l.orgao_nome, l.orgao_cnpj, l.chave_externa, l.fonte_id,
            l.abertura_propostas, l.fim_propostas, l.situacao, l.valor_estimado, l.pasta,
            l.cnpj_vencedor, l.uf, f.adaptador
       FROM monitoramentos m
       JOIN licitacoes l ON l.id = m.licitacao_id
       JOIN fontes f ON f.id = l.fonte_id
      WHERE m.ativo = 1
        AND (m.proxima_checagem IS NULL OR m.proxima_checagem <= NOW())
      ORDER BY FIELD(m.motivo, 'disputando') DESC, m.proxima_checagem ASC
      LIMIT ?`,
    [limite]
  );
  return linhas;
}

/** Alerta vermelho: o edital mudou. É o aviso que a seção 21.3 pede em destaque. */
async function alertarEditalAlterado(licitacao, oQueMudou) {
  return alertas.criar({
    tipo: 'edital_alterado',
    nivel: 'vermelho',
    // A chave inclui o hash novo: cada alteração gera um aviso, e a mesma
    // alteração não gera dois.
    chave: `edital_alterado:${licitacao.id}:${oQueMudou.hash.slice(0, 16)}`,
    licitacaoId: licitacao.id,
    quando: licitacao.fim_propostas,
    mensagem: `O edital mudou. Reveja antes de enviar: ${oQueMudou.resumo} — ${
      licitacao.orgao_nome || 'órgão não informado'
    }`,
  });
}

/** A linha do tempo de uma licitação (seção 21.4). */
async function linhaDoTempo(licitacaoId) {
  const [eventos] = await pool.query(
    `SELECT id, tipo, descricao, dados, ocorrido_em, criado_em
       FROM eventos_licitacao WHERE licitacao_id = ?
      ORDER BY ocorrido_em ASC, id ASC`,
    [licitacaoId]
  );
  const [[monitoramento]] = await pool.query(
    'SELECT * FROM monitoramentos WHERE licitacao_id = ?',
    [licitacaoId]
  );
  return {
    eventos: eventos.map((e) => ({
      ...e,
      dados: typeof e.dados === 'string' ? JSON.parse(e.dados || 'null') : e.dados,
    })),
    monitoramento: monitoramento || null,
  };
}

module.exports = {
  registrarEvento,
  ligar,
  desligar,
  ligarOsQueFaltam,
  devidas,
  alertarEditalAlterado,
  linhaDoTempo,
};
