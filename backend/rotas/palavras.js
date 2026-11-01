// /api/palavras — leitura das palavras-chave e das excluídas (seção 4.2).
// A tela de edição com "Simular" entra na Fase 2.
const express = require('express');
const pool = require('../config/db');

const rotas = express.Router();

rotas.get('/', async (_req, res) => {
  try {
    const [palavras] = await pool.query(
      `SELECT p.*,
              (SELECT COUNT(*) FROM licitacoes l WHERE l.palavra_casada = p.termo AND l.descartada = 0) AS licitacoes
         FROM palavras_chave p
        ORDER BY p.grupo ASC, p.peso DESC, p.termo ASC`
    );
    const [excluidas] = await pool.query('SELECT * FROM palavras_excluidas ORDER BY termo');
    res.json({
      dados: palavras.map((p) => ({
        ...p,
        fontes_ids: typeof p.fontes_ids === 'string' ? JSON.parse(p.fontes_ids) : p.fontes_ids,
      })),
      excluidas,
    });
  } catch (erro) {
    res.status(500).json({ erro: 'Não foi possível carregar as palavras-chave.', detalhe: erro.message });
  }
});

module.exports = rotas;
