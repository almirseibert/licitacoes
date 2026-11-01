// GET /api/painel/resumo — números do topo do Radar (seção 13).
const express = require('express');
const pool = require('../config/db');
const fila = require('../servicos/fila');

const rotas = express.Router();

rotas.get('/resumo', async (_req, res) => {
  try {
    const [[numeros]] = await pool.query(
      `SELECT
         COUNT(*) AS total,
         SUM(l.criado_em >= DATE_SUB(NOW(), INTERVAL 24 HOUR)) AS novas_24h,
         SUM(l.pontuacao >= 80) AS prioridade_alta,
         SUM(l.fim_propostas IS NOT NULL AND l.fim_propostas BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 48 HOUR)) AS fecham_48h,
         SUM(l.beneficio_me IN ('exclusivo','cota')) AS exclusivas_me,
         SUM(l.etapa = 'Vou disputar') AS vou_disputar,
         SUM(l.valor_estimado) AS valor_em_jogo
       FROM licitacoes l
      WHERE l.descartada = 0 AND (l.fim_propostas IS NULL OR l.fim_propostas >= NOW())`
    );

    const [ultimaColeta] = await pool.query(
      'SELECT MAX(ultima_coleta) AS quando FROM fontes WHERE ativa = 1'
    );

    const resumoFila = await fila.resumo().catch(() => ({}));

    res.json({
      total: Number(numeros.total || 0),
      novas_24h: Number(numeros.novas_24h || 0),
      prioridade_alta: Number(numeros.prioridade_alta || 0),
      fecham_48h: Number(numeros.fecham_48h || 0),
      exclusivas_me: Number(numeros.exclusivas_me || 0),
      vou_disputar: Number(numeros.vou_disputar || 0),
      valor_em_jogo: Number(numeros.valor_em_jogo || 0),
      ultima_coleta: ultimaColeta[0] ? ultimaColeta[0].quando : null,
      fila: { driver: fila.driver, ...resumoFila },
    });
  } catch (erro) {
    console.error('Erro no resumo do painel:', erro.message);
    res.status(500).json({ erro: 'Não foi possível carregar o resumo.', detalhe: erro.message });
  }
});

module.exports = rotas;
