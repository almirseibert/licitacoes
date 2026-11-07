// Feriados (seção 25.1) — os nacionais vêm da BrasilAPI, os outros são seus.
const express = require('express');
const servico = require('../servicos/feriados');

const rotas = express.Router();

rotas.get('/', async (req, res) => {
  try {
    const ano = Number(req.query.ano) || new Date().getFullYear();
    res.json({
      ano,
      dados: await servico.listar({ de: `${ano}-01-01`, ate: `${ano}-12-31` }),
    });
  } catch (erro) {
    res.status(500).json({ erro: 'Não foi possível listar os feriados.', detalhe: erro.message });
  }
});

// POST /api/feriados/importar — baixa os nacionais do ano corrente e do seguinte.
rotas.post('/importar', async (_req, res) => {
  try {
    const r = await servico.garantirAnos({});
    const comErro = r.filter((x) => x.erro);
    res.json({
      resultados: r,
      mensagem: comErro.length
        ? `Importação parcial: ${comErro.map((x) => `${x.ano} (${x.erro})`).join('; ')}`
        : `Feriados nacionais em dia: ${r.map((x) => `${x.ano} com ${x.baixados || x.ja} dias`).join(', ')}.`,
    });
  } catch (erro) {
    res.status(500).json({ erro: 'Não foi possível importar os feriados.', detalhe: erro.message });
  }
});

// POST /api/feriados — o estadual e o municipal, que só você sabe.
rotas.post('/', async (req, res) => {
  try {
    const r = await servico.guardar({ ...(req.body || {}), origem: 'manual' });
    res.status(201).json({
      ...r,
      mensagem: r.nova ? 'Feriado cadastrado.' : 'Este feriado já estava cadastrado.',
    });
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

// DELETE /api/feriados/:id — só os cadastrados à mão; os da BrasilAPI ficam.
rotas.delete('/:id', async (req, res) => {
  try {
    const removeu = await servico.remover(req.params.id);
    if (!removeu) {
      return res.status(400).json({
        erro: 'Só dá para remover feriado cadastrado à mão. Os nacionais vêm da BrasilAPI.',
      });
    }
    res.json({ ok: true });
  } catch (erro) {
    res.status(500).json({ erro: 'Não foi possível remover.', detalhe: erro.message });
  }
});

module.exports = rotas;
