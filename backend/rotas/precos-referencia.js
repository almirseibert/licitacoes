// /api/precos-referencia e /api/concorrentes — a tela de preço e concorrência
// (seções 12, 13 e 26).
const express = require('express');
const { responderErro } = require('../middlewares/responder-erro');
const servico = require('../servicos/preco');
const regras = require('../regras/preco');
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

// Filtros que a tela entende (catálogo Área → Segmento, e o recorte da amostra).
const FILTROS = ['grupo', 'area', 'segmento', 'familia', 'uf', 'esfera', 'valor_min', 'valor_max', 'de', 'ate'];
const filtrosDe = (consulta) => Object.fromEntries(FILTROS.filter((f) => consulta[f] !== undefined && consulta[f] !== '').map((f) => [f, consulta[f]]));

// GET /api/precos-referencia/resumo?area=&segmento=&familia=&uf=&esfera=&valor_min=&valor_max=&de=&ate= —
// a frase, a base e as opções da tela. `grupo` (palavra-chave) continua aceito.
rotas.get('/resumo', async (req, res) => {
  try {
    res.json(await servico.resumoDoSegmento(filtrosDe(req.query)));
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar o preço de referência.', erro);
  }
});

// GET /api/precos-referencia/simular?grupo=&familia=&estimado=&custo= — o veredito "vale a pena?".
rotas.get('/simular', async (req, res) => {
  try {
    const estimado = Number(req.query.estimado);
    if (!Number.isFinite(estimado) || estimado <= 0) {
      return res.status(400).json({ erro: 'Informe o valor estimado da licitação.' });
    }
    const { referencia } = await servico.referenciaDoFiltro(filtrosDe(req.query));
    const custo = req.query.custo === undefined || req.query.custo === '' ? null : Number(req.query.custo);
    res.json({
      sem_referencia: !referencia,
      ...regras.simular({ valorEstimado: estimado, custo, referencia }),
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível simular.', erro);
  }
});

// GET /api/precos-referencia/parecidas?grupo=&familia=&q=&pagina= — contratações reais encerradas.
rotas.get('/parecidas', async (req, res) => {
  try {
    res.json(
      await servico.contratacoesParecidas({ ...filtrosDe(req.query), q: req.query.q, pagina: req.query.pagina })
    );
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível listar as contratações parecidas.', erro);
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
