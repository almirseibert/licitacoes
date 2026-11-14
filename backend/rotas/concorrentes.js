// /api/concorrentes — quem aparece nas licitações que o painel acompanha.
// A ficha completa (sanções, órgãos, taxa de vitória) é o dossiê da seção 26,
// que fecha na fase 12; aqui vem o que já dá para medir com o que está no banco.
const express = require('express');
const { responderErro } = require('../middlewares/responder-erro');
const servico = require('../servicos/preco');

const rotas = express.Router();

rotas.get('/', async (req, res) => {
  try {
    res.json({
      dados: await servico.listarConcorrentes({
        organizacaoId: req.organizacaoId,
        grupo: req.query.grupo || undefined,
        limite: Math.min(Number(req.query.limite) || 50, 200),
      }),
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível listar os concorrentes.', erro);
  }
});

rotas.get('/:cnpj', async (req, res) => {
  try {
    const ficha = await servico.perfilDoConcorrente(req.organizacaoId, req.params.cnpj);
    if (!ficha) {
      return res.status(404).json({
        erro: 'Este CNPJ ainda não apareceu em nenhuma licitação que o painel acompanha.',
      });
    }
    res.json(ficha);
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível abrir a ficha.', erro);
  }
});

module.exports = rotas;
