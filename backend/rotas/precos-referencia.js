// /api/precos-referencia e /api/concorrentes — a tela de preço e concorrência
// (seções 12, 13 e 26).
const express = require('express');
const { responderErro } = require('../middlewares/responder-erro');
const servico = require('../servicos/preco');
const encerradas = require('../jobs/encerradas');

const rotas = express.Router();

// GET /api/precos-referencia — a tabela por grupo e família, com a amostra.
rotas.get('/', async (_req, res) => {
  try {
    res.json(await servico.listarReferencias());
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar o preço de referência.', erro);
  }
});

// POST /api/precos-referencia/recalcular — refaz as medianas com o que já está
// na amostra. É o job `recalcular_precos` acionado à mão.
rotas.post('/recalcular', async (_req, res) => {
  try {
    const r = await servico.recalcular();
    res.json({
      ok: true,
      ...r,
      mensagem: r.gravadas
        ? `${r.gravadas} linha(s) de referência recalculada(s).`
        : 'A amostra de encerradas ainda está vazia: rode a coleta de encerradas primeiro.',
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível recalcular.', erro);
  }
});

// POST /api/precos-referencia/coletar — varre as encerradas e recalcula.
// Pode levar minutos: a conduta da seção 5.4 pede 1,5 s entre chamadas.
rotas.post('/coletar', async (req, res) => {
  try {
    const r = await encerradas.coletarEncerradas({
      termo: (req.body || {}).termo || undefined,
      paginas: Number((req.body || {}).paginas) || undefined,
    });
    res.json({
      ok: true,
      ...r,
      mensagem:
        `${r.encontradas} encerrada(s) lida(s), ${r.novas} nova(s) na amostra; ` +
        `${r.referencias_gravadas} linha(s) de referência recalculada(s).`,
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível coletar as encerradas.', erro);
  }
});

module.exports = rotas;
