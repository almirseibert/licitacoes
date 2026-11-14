// Alertas do painel (seção 4.9) — criação idempotente e leitura.
//
// Todo alerta tem uma `chave` única: `prazo_48h:123`. O job roda de hora em
// hora e a chave é o que impede o mesmo aviso de aparecer doze vezes.
const pool = require('../config/db');
const { daOrganizacao } = require('./escopo');

/**
 * Cria o alerta se ainda não existir.
 * @returns {boolean} true quando criou agora
 */
async function criar({
  organizacaoId,
  tipo,
  chave,
  mensagem,
  licitacaoId = null,
  documentoId = null,
  quando = null,
  // 'vermelho' é o aviso que não pode passar batido — edital alterado, hoje
  // (seção 21.3). O padrão continua 'info' para não repintar o que já existia.
  nivel = 'info',
  // Seção 9: `usuarioId` = aviso só desta pessoa; `autorId` = quem causou, e
  // por isso não precisa ser avisado.
  usuarioId = null,
  autorId = null,
}) {
  // Todo alerta é de uma organização (Seção 1b): sem ela, não há para quem avisar.
  if (!organizacaoId) throw new Error('alerta sem organizacao_id');
  const [r] = await pool.query(
    `INSERT INTO alertas (organizacao_id, usuario_id, autor_id, tipo, nivel, chave, mensagem, licitacao_id, documento_id, quando)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [organizacaoId, usuarioId, autorId, tipo, nivel, chave, String(mensagem).slice(0, 500), licitacaoId, documentoId, quando]
  );
  return Boolean(r.insertId);
}

// Aviso pessoal (Seção 9: tarefa atrasada) só aparece no sino de quem é.
const SO_MEU = '(usuario_id IS NULL OR usuario_id = ?)';

async function listar({ organizacaoId, usuarioId = null, lido = null, limite = 60 } = {}) {
  const condicoes = ['a.organizacao_id = ?', '(a.usuario_id IS NULL OR a.usuario_id = ?)'];
  const valores = [organizacaoId, usuarioId];
  if (lido !== null) {
    condicoes.push('a.lido = ?');
    valores.push(lido ? 1 : 0);
  }

  const [linhas] = await pool.query(
    `SELECT a.*, l.objeto, l.orgao_nome, l.fim_propostas, l.etapa, l.pontuacao,
            d.titulo AS documento_titulo
       FROM alertas a
       LEFT JOIN ${daOrganizacao(organizacaoId, { todas: true })} l ON l.id = a.licitacao_id
       LEFT JOIN empresa_documentos d ON d.id = a.documento_id AND d.organizacao_id = a.organizacao_id
      WHERE ${condicoes.join(' AND ')}
      ORDER BY a.lido ASC, a.criado_em DESC
      LIMIT ?`,
    [...valores, limite]
  );

  const [[contagem]] = await pool.query(
    `SELECT COUNT(*) AS nao_lidos FROM alertas WHERE organizacao_id = ? AND lido = 0 AND ${SO_MEU}`,
    [organizacaoId, usuarioId]
  );
  return { dados: linhas, nao_lidos: contagem.nao_lidos };
}

async function marcarLido(organizacaoId, usuarioId, id, lido = true) {
  const [r] = await pool.query(`UPDATE alertas SET lido = ? WHERE id = ? AND organizacao_id = ? AND ${SO_MEU}`, [
    lido ? 1 : 0,
    id,
    organizacaoId,
    usuarioId,
  ]);
  return r.affectedRows > 0;
}

async function marcarTodosLidos(organizacaoId, usuarioId) {
  const [r] = await pool.query(`UPDATE alertas SET lido = 1 WHERE organizacao_id = ? AND lido = 0 AND ${SO_MEU}`, [
    organizacaoId,
    usuarioId,
  ]);
  return r.affectedRows;
}

module.exports = { criar, listar, marcarLido, marcarTodosLidos };
