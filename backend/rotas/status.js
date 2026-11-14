// GET /api/status — status das ferramentas (Seção 17): worker, coleta, fila, boletim,
// e-mail e IA. Qualquer membro vê (inclusive leitor e teste vencido): é a primeira
// pergunta de quem acha que "o painel parou".
const express = require('express');
const { responderErro } = require('../middlewares/responder-erro');
const status = require('../servicos/status');

const rotas = express.Router();

rotas.get('/', async (req, res) => {
  try {
    res.json(await status.ler(req.organizacaoId));
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível verificar o status agora.', erro);
  }
});

module.exports = rotas;
