// /api/alertas — a caixa de avisos do painel (seções 13 e 4.9).
const express = require('express');
const { responderErro } = require('../middlewares/responder-erro');
const alertas = require('../servicos/alertas');

const rotas = express.Router();

rotas.get('/', async (req, res) => {
  try {
    const lido = req.query.lido === undefined ? null : req.query.lido === '1';
    const resultado = await alertas.listar({ lido, limite: Number(req.query.limite) || 60 });
    res.json(resultado);
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar os alertas.', erro);
  }
});

rotas.patch('/:id/lido', async (req, res) => {
  try {
    const lido = !(req.body && req.body.lido === false);
    const achou = await alertas.marcarLido(req.params.id, lido);
    if (!achou) return res.status(404).json({ erro: 'Alerta não encontrado.' });
    res.json({ ok: true });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível marcar o alerta.', erro);
  }
});

rotas.post('/lidos', async (_req, res) => {
  try {
    const quantos = await alertas.marcarTodosLidos();
    res.json({ ok: true, quantos, mensagem: `${quantos} alerta(s) marcados como lidos.` });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível marcar os alertas.', erro);
  }
});

module.exports = rotas;
