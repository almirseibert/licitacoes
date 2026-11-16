// GET /api/status — status das ferramentas (Seção 17): worker, coleta, fila, boletim,
// e-mail e IA. Só administrador vê (decisão de 16/11/2026): é tela de operação.
const express = require('express');
const { responderErro } = require('../middlewares/responder-erro');
const status = require('../servicos/status');
const { apenasAdmin } = require('../middlewares/autenticar');

const rotas = express.Router();

rotas.get('/', apenasAdmin, async (req, res) => {
  try {
    res.json(await status.ler(req.organizacaoId));
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível verificar o status agora.', erro);
  }
});

module.exports = rotas;
