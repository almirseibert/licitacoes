// "Meu desempenho" (Seção 15): uma leitura, por período, da própria organização.
const express = require('express');
const { responderErro } = require('../middlewares/responder-erro');
const servico = require('../servicos/desempenho');

const rotas = express.Router();

// GET /api/desempenho?janela=todo|1m|3m|6m|1a|definido&de=AAAA-MM-DD&ate=AAAA-MM-DD
rotas.get('/', async (req, res) => {
  try {
    res.json(await servico.desempenho(req.organizacaoId, req.query));
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível montar o seu desempenho agora. Tente de novo em instantes.', erro);
  }
});

module.exports = rotas;
