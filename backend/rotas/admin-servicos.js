// /api/admin — parceiros, andamento dos pedidos e vendas dos serviços complementares
// (Seção 18). Montada dentro de rotas/admin.js, depois do `exigirSuperadmin`.
const express = require('express');
const pool = require('../config/db');
const { responderErro } = require('../middlewares/responder-erro');
const email = require('../servicos/email');
const regras = require('../regras/servicos');

const rotas = express.Router();

const MSG_PARCEIRO_REPETIDO = 'Já existe um parceiro com esse nome neste serviço.';

// Fila da operadora: o que pede ação primeiro (constante nossa, nunca entrada do usuário).
const ORDEM_NA_FILA = ['solicitado', 'interesse', ...Object.keys(regras.STATUS).filter((s) => !['solicitado', 'interesse'].includes(s))];

// GET /api/admin/parceiros
rotas.get('/parceiros', async (_req, res) => {
  try {
    const [linhas] = await pool.query('SELECT id, servico, nome, email_pedidos, ativo FROM parceiros ORDER BY servico, id');
    res.json({ parceiros: linhas, servicos: Object.fromEntries(Object.entries(regras.SERVICOS).map(([k, s]) => [k, s.rotulo])) });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível listar os parceiros.', erro);
  }
});

// POST /api/admin/parceiros
rotas.post('/parceiros', async (req, res) => {
  const v = regras.validarParceiro(req.body);
  if (v.erro) return res.status(400).json({ erro: v.erro });
  try {
    const d = v.dados;
    const [r] = await pool.query(
      'INSERT INTO parceiros (servico, nome, email_pedidos, site, ativo) VALUES (?, ?, ?, ?, ?)',
      [d.servico, d.nome, d.email_pedidos, d.site || null, d.ativo === undefined ? 1 : d.ativo]
    );
    res.status(201).json({ id: r.insertId });
  } catch (erro) {
    if (erro.code === 'ER_DUP_ENTRY') return res.status(409).json({ erro: MSG_PARCEIRO_REPETIDO });
    responderErro(res, 500, 'Não foi possível cadastrar o parceiro.', erro);
  }
});

// PATCH /api/admin/parceiros/:id
rotas.patch('/parceiros/:id', async (req, res) => {
  // O cliente aceitou o termo vendo o NOME do parceiro e o serviço: trocar um dos dois com pedidos
  // pendentes mandaria dado a quem ele não autorizou. Para outro parceiro, cadastre um novo.
  if (req.body && (req.body.servico !== undefined || req.body.nome !== undefined)) {
    return res.status(400).json({ erro: 'Nome e serviço do parceiro não mudam. Desative este e cadastre outro.' });
  }
  const v = regras.validarParceiro(req.body, true);
  if (v.erro) return res.status(400).json({ erro: v.erro });
  const campos = Object.keys(v.dados);
  if (!campos.length) return res.status(400).json({ erro: 'Nada para alterar.' });
  try {
    const [r] = await pool.query(`UPDATE parceiros SET ${campos.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [
      ...campos.map((c) => v.dados[c]), Number(req.params.id) || 0,
    ]);
    if (!r.affectedRows) return res.status(404).json({ erro: 'Parceiro não encontrado.' });
    res.json({ ok: true });
  } catch (erro) {
    if (erro.code === 'ER_DUP_ENTRY') return res.status(409).json({ erro: MSG_PARCEIRO_REPETIDO });
    responderErro(res, 500, 'Não foi possível alterar o parceiro.', erro);
  }
});

// GET /api/admin/servicos/pedidos?status=
rotas.get('/servicos/pedidos', async (req, res) => {
  const status = req.query.status;
  if (status && !regras.STATUS[status]) return res.status(400).json({ erro: 'Status inválido.' });
  try {
    const [linhas] = await pool.query(
      `SELECT p.id, o.nome AS organizacao, p.servico, p.status, p.criado_em, p.valor_contratado, par.nome AS parceiro_nome
         FROM servico_pedidos p
         JOIN organizacoes o ON o.id = p.organizacao_id
         LEFT JOIN parceiros par ON par.id = p.parceiro_id
        ${status ? 'WHERE p.status = ?' : ''}
        ORDER BY FIELD(p.status, ${ORDEM_NA_FILA.map((x) => `'${x}'`).join(',')}), p.id DESC
        LIMIT 300`,
      status ? [status] : []
    );
    res.json({ pedidos: linhas.map(regras.comProtocolo) });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível listar os pedidos.', erro);
  }
});

// POST /api/admin/servicos/pedidos/:id — { status?, valor_contratado?, observacao? }
rotas.post('/servicos/pedidos/:id', async (req, res) => {
  try {
    const id = Number(req.params.id) || 0;
    const [[atual]] = await pool.query('SELECT status, valor_contratado FROM servico_pedidos WHERE id = ?', [id]);
    if (!atual) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    const v = regras.validarAtualizacao(req.body, atual);
    if (v.erro) return res.status(400).json({ erro: v.erro });
    const campos = { ...v.dados };
    if (campos.status === 'contratado') campos.contratado_em = new Date();
    const nomes = Object.keys(campos);
    if (!nomes.length) return res.json({ ok: true });
    await pool.query(`UPDATE servico_pedidos SET ${nomes.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [
      ...nomes.map((c) => campos[c]), id,
    ]);
    res.json({ ok: true });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível atualizar o pedido.', erro);
  }
});

// POST /api/admin/servicos/pedidos/:id/reenviar — o e-mail ao parceiro que não saiu.
// Só reenvia o que o cliente consentiu: os dados gravados no pedido, nunca dados novos.
rotas.post('/servicos/pedidos/:id/reenviar', async (req, res) => {
  try {
    const id = Number(req.params.id) || 0;
    const [[p]] = await pool.query(
      `SELECT p.id, p.servico, p.status, p.criado_em, p.dados_enviados, p.termo_versao, par.nome, par.email_pedidos, par.ativo
         FROM servico_pedidos p LEFT JOIN parceiros par ON par.id = p.parceiro_id WHERE p.id = ?`,
      [id]
    );
    if (!p) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    if (p.status !== 'solicitado' || !p.dados_enviados || !p.email_pedidos) {
      return res.status(409).json({ erro: 'Só se reenvia pedido "Aguardando envio ao parceiro", com parceiro e aceite.' });
    }
    if (!p.ativo) return res.status(409).json({ erro: 'O parceiro deste pedido está desativado.' });
    // Reserva o pedido antes de enviar: dois cliques (ou duas pessoas) não mandam o e-mail duas vezes.
    const [reserva] = await pool.query(
      "UPDATE servico_pedidos SET status = 'encaminhado', encaminhado_em = NOW() WHERE id = ? AND status = 'solicitado'",
      [id]
    );
    if (!reserva.affectedRows) return res.status(409).json({ erro: 'Este pedido já foi reenviado por outra pessoa.' });
    const dados = typeof p.dados_enviados === 'string' ? JSON.parse(p.dados_enviados) : p.dados_enviados;
    const envio = await email.enviarTransacional(
      regras.montarEmail({ pedido: p, parceiro: { nome: p.nome, email_pedidos: p.email_pedidos }, dados })
    );
    if (!envio.enviado) {
      await pool.query("UPDATE servico_pedidos SET status = 'solicitado', encaminhado_em = NULL WHERE id = ? AND status = 'encaminhado'", [id]);
      return responderErro(res, 502, 'O e-mail não saiu. Confira a configuração de SMTP.', new Error(envio.motivo));
    }
    res.json({ ok: true });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível reenviar o pedido.', erro);
  }
});

// GET /api/admin/servicos/vendas — o que foi contratado, por serviço.
rotas.get('/servicos/vendas', async (_req, res) => {
  try {
    const [linhas] = await pool.query('SELECT servico, status, organizacao_id, valor_contratado FROM servico_pedidos');
    res.json({ vendas: regras.resumoDeVendas(linhas) });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível somar as vendas.', erro);
  }
});

module.exports = rotas;
