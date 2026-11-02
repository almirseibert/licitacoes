// Alertas do painel (seção 4.9) — criação idempotente e leitura.
//
// Todo alerta tem uma `chave` única: `prazo_48h:123`. O job roda de hora em
// hora e a chave é o que impede o mesmo aviso de aparecer doze vezes.
const pool = require('../config/db');

/**
 * Cria o alerta se ainda não existir.
 * @returns {boolean} true quando criou agora
 */
async function criar({ tipo, chave, mensagem, licitacaoId = null, documentoId = null, quando = null }) {
  const [r] = await pool.query(
    `INSERT INTO alertas (tipo, chave, mensagem, licitacao_id, documento_id, quando)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [tipo, chave, String(mensagem).slice(0, 500), licitacaoId, documentoId, quando]
  );
  return Boolean(r.insertId);
}

async function listar({ lido = null, limite = 60 } = {}) {
  const condicoes = [];
  const valores = [];
  if (lido !== null) {
    condicoes.push('a.lido = ?');
    valores.push(lido ? 1 : 0);
  }

  const [linhas] = await pool.query(
    `SELECT a.*, l.objeto, l.orgao_nome, l.fim_propostas, l.etapa, l.pontuacao,
            d.titulo AS documento_titulo
       FROM alertas a
       LEFT JOIN licitacoes l ON l.id = a.licitacao_id
       LEFT JOIN empresa_documentos d ON d.id = a.documento_id
      ${condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : ''}
      ORDER BY a.lido ASC, a.criado_em DESC
      LIMIT ?`,
    [...valores, limite]
  );

  const [[contagem]] = await pool.query('SELECT COUNT(*) AS nao_lidos FROM alertas WHERE lido = 0');
  return { dados: linhas, nao_lidos: contagem.nao_lidos };
}

async function marcarLido(id, lido = true) {
  const [r] = await pool.query('UPDATE alertas SET lido = ? WHERE id = ?', [lido ? 1 : 0, id]);
  return r.affectedRows > 0;
}

async function marcarTodosLidos() {
  const [r] = await pool.query('UPDATE alertas SET lido = 1 WHERE lido = 0');
  return r.affectedRows;
}

module.exports = { criar, listar, marcarLido, marcarTodosLidos };
