// Exigências do edital vistas por uma organização (Seção 1c).
//
// `licitacao_exigencias` é catálogo: o que a leitura do edital achou. A
// correção manual é decisão de quem usa e mora em `org_exigencias`; na visão
// da organização ela passa na frente da leitura. A leitura automática nunca
// escreve em `org_exigencias`, e a correção de uma organização nunca aparece
// para outra.
const pool = require('../config/db');
const escopo = require('./escopo');
const { PORCODIGO } = require('../regras/exigencias');

/**
 * Condição SQL "o edital exige algum destes códigos, na visão da organização".
 * Os códigos entram como literal — vêm do catálogo, não do usuário — para não
 * mexer na ordem dos `?` da consulta que a usa.
 *
 * @param {{ licitacao: string, organizacao: string, codigos: string[] }} colunas
 *        expressões SQL do id da licitação e da organização (ex.: 'l.id', 'l.organizacao_id')
 */
function exigidaSql({ licitacao = 'l.id', organizacao = 'l.organizacao_id', codigos }) {
  if (!codigos.length || codigos.some((c) => !PORCODIGO.has(c))) {
    throw new Error('código de exigência fora do catálogo');
  }
  const lista = codigos.map((c) => `'${c}'`).join(', ');
  return `(
    EXISTS (SELECT 1 FROM licitacao_exigencias ex
             WHERE ex.licitacao_id = ${licitacao} AND ex.codigo IN (${lista})
               AND COALESCE((SELECT oe.detectado FROM org_exigencias oe
                              WHERE oe.organizacao_id = ${organizacao} AND oe.licitacao_id = ex.licitacao_id
                                AND oe.codigo = ex.codigo), ex.detectado) = 'sim')
    OR EXISTS (SELECT 1 FROM org_exigencias oe
                WHERE oe.organizacao_id = ${organizacao} AND oe.licitacao_id = ${licitacao}
                  AND oe.codigo IN (${lista}) AND oe.detectado = 'sim')
  )`;
}

/**
 * Exigências da licitação na visão da organização: a leitura do edital com a
 * correção da organização por cima. `corrigido` diz de onde veio o valor.
 *
 * @returns {Promise<Map<string, { codigo, detectado, trecho, pagina, nome_arquivo, corrigido }>>}
 */
async function daLicitacao(organizacaoId, licitacaoId, { codigos = null, conexao = pool } = {}) {
  const filtro = codigos ? ' AND e.codigo IN (?)' : '';
  const [[lidas], [corrigidas]] = await Promise.all([conexao.query(
    `SELECT e.codigo, e.detectado, e.trecho, e.pagina, a.nome_arquivo
       FROM licitacao_exigencias e
       LEFT JOIN licitacao_arquivos a ON a.id = e.arquivo_id
      WHERE e.licitacao_id = ?${filtro}`,
    codigos ? [licitacaoId, codigos] : [licitacaoId]
  ), conexao.query(
    `SELECT codigo, detectado FROM org_exigencias
      WHERE organizacao_id = ? AND licitacao_id = ?${codigos ? ' AND codigo IN (?)' : ''}`,
    codigos
      ? [escopo.idOrganizacao(organizacaoId), licitacaoId, codigos]
      : [escopo.idOrganizacao(organizacaoId), licitacaoId]
  )]);

  const mapa = new Map(lidas.map((l) => [l.codigo, { ...l, corrigido: false }]));
  for (const c of corrigidas) {
    const lida = mapa.get(c.codigo) || { codigo: c.codigo, trecho: null, pagina: null, nome_arquivo: null };
    mapa.set(c.codigo, { ...lida, detectado: c.detectado, corrigido: true });
  }
  return mapa;
}

/** Só os códigos que a organização vê como exigidos (`detectado = 'sim'`). */
async function exigidas(organizacaoId, licitacaoId, opcoes = {}) {
  const mapa = await daLicitacao(organizacaoId, licitacaoId, opcoes);
  return [...mapa.values()].filter((e) => e.detectado === 'sim');
}

/** Grava a correção da organização; `false` se a licitação não existe no catálogo. */
async function corrigir(organizacaoId, licitacaoId, codigo, detectado, usuarioId = null) {
  const [[existe]] = await pool.query('SELECT id FROM licitacoes WHERE id = ?', [licitacaoId]);
  if (!existe) return false;
  await pool.query(
    `INSERT INTO org_exigencias (organizacao_id, licitacao_id, codigo, detectado, usuario_id)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE detectado = VALUES(detectado), usuario_id = VALUES(usuario_id)`,
    [escopo.idOrganizacao(organizacaoId), licitacaoId, codigo, detectado, usuarioId]
  );
  return true;
}

/** Devolve a linha à leitura automática (apaga só a correção desta organização). */
async function soltar(organizacaoId, licitacaoId, codigo) {
  await pool.query(
    'DELETE FROM org_exigencias WHERE organizacao_id = ? AND licitacao_id = ? AND codigo = ?',
    [escopo.idOrganizacao(organizacaoId), licitacaoId, codigo]
  );
}

module.exports = { exigidaSql, daLicitacao, exigidas, corrigir, soltar };
