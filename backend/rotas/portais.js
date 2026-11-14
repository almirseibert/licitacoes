// /api/portais — agenda de portais (Seção 10 do plano SaaS).
//
// Onde a empresa tem cadastro e quando ele vence. Sem login e sem senha: o
// painel não guarda credencial de portal de terceiro (CLAUDE.md), então a
// agenda lembra o vencimento e abre o portal — quem entra é a pessoa.
const express = require('express');
const pool = require('../config/db');
const { responderErro } = require('../middlewares/responder-erro');
const regras = require('../regras/portais');
const { diaNoFuso } = require('../regras/gestao');

const rotas = express.Router();

rotas.get('/', async (req, res) => {
  try {
    const [linhas] = await pool.query(
      `SELECT id, nome, url, tipo, login_vence_em, observacao, criado_em, atualizado_em FROM org_portais
        WHERE organizacao_id = ? ORDER BY login_vence_em IS NULL, login_vence_em ASC, nome ASC`,
      [req.organizacaoId]
    );
    const hoje = diaNoFuso();
    const dados = linhas.map((p) => ({ ...p, situacao: regras.situacao(p.login_vence_em, hoje) }));
    res.json({
      dados,
      tipos: regras.TIPOS,
      resumo: {
        total: dados.length,
        vencendo: dados.filter((p) => p.situacao.cor === 'amarelo').length,
        vencidos: dados.filter((p) => p.situacao.cor === 'vermelho').length,
      },
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar a agenda de portais.', erro);
  }
});

rotas.post('/', async (req, res) => {
  const { campos, erro } = regras.validar(req.body || {});
  if (erro) return res.status(400).json({ erro });
  try {
    const [r] = await pool.query(
      `INSERT INTO org_portais (organizacao_id, nome, url, tipo, login_vence_em, observacao, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.organizacaoId, campos.nome, campos.url, campos.tipo, campos.login_vence_em, campos.observacao, req.usuario.id]
    );
    res.status(201).json({ ok: true, id: r.insertId, mensagem: 'Portal na agenda.' });
  } catch (e) {
    responderErro(res, 500, 'Não foi possível guardar o portal.', e);
  }
});

rotas.patch('/:id', async (req, res) => {
  const { campos, erro } = regras.validar(req.body || {}, { parcial: true });
  if (erro) return res.status(400).json({ erro });
  try {
    const colunas = Object.keys(campos);
    const [r] = await pool.query(
      `UPDATE org_portais SET ${colunas.map((c) => `${c} = ?`).join(', ')} WHERE id = ? AND organizacao_id = ?`,
      [...colunas.map((c) => campos[c]), req.params.id, req.organizacaoId]
    );
    if (!r.affectedRows) return res.status(404).json({ erro: 'Portal não encontrado.' });
    res.json({ ok: true });
  } catch (e) {
    responderErro(res, 500, 'Não foi possível alterar o portal.', e);
  }
});

rotas.delete('/:id', async (req, res) => {
  try {
    const [r] = await pool.query('DELETE FROM org_portais WHERE id = ? AND organizacao_id = ?', [
      req.params.id,
      req.organizacaoId,
    ]);
    if (!r.affectedRows) return res.status(404).json({ erro: 'Portal não encontrado.' });
    res.json({ ok: true, mensagem: 'Portal saiu da agenda.' });
  } catch (e) {
    responderErro(res, 500, 'Não foi possível tirar o portal da agenda.', e);
  }
});

module.exports = rotas;
