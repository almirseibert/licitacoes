// GET /api/diagnostico — a tela da seção 20.2.
const express = require('express');
const { responderErro } = require('../middlewares/responder-erro');
const servico = require('../servicos/diagnostico');
const descarte = require('../regras/descarte');
const exigencias = require('../regras/exigencias');
const descartarVencidas = require('../jobs/descartar-vencidas');

const rotas = express.Router();

rotas.get('/', async (req, res) => {
  const pedido = Number(req.query.periodo || 90);
  // Período fora da lista da tela não é erro do usuário: cai no padrão de 90
  // dias, que é o da seção 20.2.
  const dias = servico.PERIODOS.some((p) => p.dias === pedido) ? pedido : 90;

  try {
    const diagnostico = await servico.diagnosticar({ organizacaoId: req.organizacaoId, dias });
    res.json({
      ...diagnostico,
      // O catálogo vai junto: é o que preenche o seletor de "qual exigência
      // barrou" na tela de descarte, sem uma segunda chamada.
      motivos: descarte.MOTIVOS,
      exigencias: exigencias.CATALOGO.map((e) => ({ codigo: e.codigo, grupo: e.grupo, rotulo: e.rotulo })),
    });
  } catch (erro) {
    console.error('Erro no diagnóstico de descarte:', erro.message);
    responderErro(res, 500, 'Não foi possível montar o diagnóstico.', erro);
  }
});

// POST /api/diagnostico/descartar-vencidas — o job da seção 20.4 na mão, para
// quem não quiser esperar a rodada do worker.
rotas.post('/descartar-vencidas', async (req, res) => {
  try {
    const resultado = await descartarVencidas.descartarVencidas({ organizacaoId: req.organizacaoId });
    res.json({
      ...resultado,
      mensagem: resultado.descartadas
        ? `${resultado.descartadas} licitação(ões) com prazo vencido foram descartadas como "prazo venceu sem análise".`
        : 'Nenhuma licitação com prazo vencido esperando análise.',
    });
  } catch (erro) {
    console.error('Erro ao descartar vencidas:', erro.message);
    responderErro(res, 500, 'Não foi possível descartar as vencidas.', erro);
  }
});

module.exports = rotas;
