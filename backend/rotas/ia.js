// Leitura assistida (seção 23) — o que a IA sugeriu e o que você faz com isso.
const express = require('express');
const pool = require('../config/db');
const ia = require('../servicos/ia');
const job = require('../jobs/ia-resumos');

const rotas = express.Router();

// GET /api/ia — estado e livro-caixa (seção 23.3), para Configurações.
rotas.get('/', async (req, res) => {
  try {
    res.json(await ia.gasto({ dias: Number(req.query.dias) || 30 }));
  } catch (erro) {
    res.status(500).json({ erro: 'Não foi possível ler o gasto com IA.', detalhe: erro.message });
  }
});

// GET /api/ia/palavras-sugeridas — a fila da seção 23.5.
rotas.get('/palavras-sugeridas', async (_req, res) => {
  try {
    const [dados] = await pool.query(
      "SELECT * FROM palavras_sugeridas WHERE situacao = 'sugerida' ORDER BY criado_em DESC LIMIT 50"
    );
    res.json({ dados, disponivel: ia.disponivel() });
  } catch (erro) {
    res.status(500).json({ erro: 'Não foi possível carregar as sugestões.', detalhe: erro.message });
  }
});

// POST /api/ia/palavras-sugeridas — pede uma rodada de sugestões agora.
rotas.post('/palavras-sugeridas', async (req, res) => {
  try {
    const r = await job.sugerirPalavras({ forcar: Boolean(req.body && req.body.forcar) });
    if (!r.ok) return res.status(r.desligada ? 409 : 422).json({ erro: r.motivo });
    res.json({ ...r, mensagem: `${r.gravadas} termo(s) novo(s) sugeridos.` });
  } catch (erro) {
    res.status(500).json({ erro: 'Não foi possível pedir sugestões.', detalhe: erro.message });
  }
});

/**
 * PATCH /api/ia/palavras-sugeridas/:id — aceitar vira palavra-chave de
 * verdade; recusar tira da tela e não volta.
 *
 * Quem decide é você (seção 23.5): a IA propõe, o radar só muda se você disser
 * que sim.
 */
rotas.patch('/palavras-sugeridas/:id', async (req, res) => {
  const situacao = req.body && req.body.situacao;
  if (!['aceita', 'recusada'].includes(situacao)) {
    return res.status(400).json({ erro: 'Use situacao: aceita ou recusada.' });
  }

  try {
    const [[sugestao]] = await pool.query('SELECT * FROM palavras_sugeridas WHERE id = ?', [req.params.id]);
    if (!sugestao) return res.status(404).json({ erro: 'Sugestão não encontrada.' });

    if (situacao === 'aceita') {
      // Entra desativada: palavra nova muda o que o radar traz, e trazer
      // centenas de licitações sem você ter olhado o termo é o oposto de ajudar.
      // Você liga na tela de Palavras-chave depois de simular.
      await pool.query(
        `INSERT INTO palavras_chave (termo, grupo, ativa, peso)
         VALUES (?, ?, 0, 1)
         ON DUPLICATE KEY UPDATE grupo = COALESCE(palavras_chave.grupo, VALUES(grupo))`,
        [sugestao.termo, sugestao.grupo]
      );
    }

    await pool.query('UPDATE palavras_sugeridas SET situacao = ? WHERE id = ?', [situacao, req.params.id]);
    res.json({
      ok: true,
      mensagem:
        situacao === 'aceita'
          ? `"${sugestao.termo}" entrou em Palavras-chave, desativada. Simule e ligue quando quiser.`
          : 'Sugestão recusada.',
    });
  } catch (erro) {
    res.status(500).json({ erro: 'Não foi possível salvar a sugestão.', detalhe: erro.message });
  }
});

module.exports = rotas;
