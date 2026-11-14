// GET /api/auditoria — a trilha da organização (Seção 17): quem entrou e quem
// alterou documento, tarefa, etapa e equipe. Só admin e dono leem.
const express = require('express');
const pool = require('../config/db');
const { exigirPapel } = require('../middlewares/autenticar');
const { responderErro } = require('../middlewares/responder-erro');
const regras = require('../regras/auditoria');
const { dataValida } = require('../regras/gestao');

const rotas = express.Router();
rotas.use(exigirPapel('admin'));

const POR_PAGINA = 50;

// ?entidade= &acao= &usuario= &de=AAAA-MM-DD &ate=AAAA-MM-DD &pagina=1
rotas.get('/', async (req, res) => {
  const { entidade, acao, usuario, de, ate } = req.query;
  const pagina = Math.max(1, Number(req.query.pagina) || 1);
  if ((de && !dataValida(de)) || (ate && !dataValida(ate))) {
    return res.status(400).json({ erro: 'Data inválida. Use o formato AAAA-MM-DD.' });
  }

  const onde = ['a.organizacao_id = ?'];
  const valores = [req.organizacaoId];
  if (entidade) { onde.push('a.entidade = ?'); valores.push(String(entidade)); }
  if (acao) { onde.push('a.acao = ?'); valores.push(String(acao)); }
  if (Number(usuario)) { onde.push('a.usuario_id = ?'); valores.push(Number(usuario)); }
  if (de) { onde.push('a.criado_em >= ?'); valores.push(`${de} 00:00:00`); }
  if (ate) { onde.push('a.criado_em < DATE_ADD(?, INTERVAL 1 DAY)'); valores.push(`${ate} 00:00:00`); }

  try {
    const [[[{ total }]], [linhas], [pessoas]] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS total FROM auditoria a WHERE ${onde.join(' AND ')}`, valores),
      pool.query(
        `SELECT a.id, a.criado_em, a.usuario_id, COALESCE(a.usuario_nome, 'Pessoa removida') AS usuario, a.acao, a.entidade, a.entidade_id, a.detalhe, a.ip
           FROM auditoria a WHERE ${onde.join(' AND ')} ORDER BY a.id DESC LIMIT ? OFFSET ?`,
        [...valores, POR_PAGINA, (pagina - 1) * POR_PAGINA]
      ),
      pool.query(
        `SELECT DISTINCT usuario_id AS id, usuario_nome AS nome FROM auditoria
          WHERE organizacao_id = ? AND usuario_id IS NOT NULL ORDER BY usuario_nome LIMIT 200`,
        [req.organizacaoId]
      ),
    ]);
    res.json({
      total: Number(total),
      pagina,
      por_pagina: POR_PAGINA,
      eventos: linhas.map((l) => ({ ...l, rotulo: regras.rotulo(l.acao) })),
      filtros: {
        entidades: regras.ENTIDADES,
        acoes: Object.entries(regras.ROTULOS).map(([chave, rotulo]) => ({ chave, rotulo })),
        pessoas,
      },
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar a trilha de auditoria.', erro);
  }
});

module.exports = rotas;
