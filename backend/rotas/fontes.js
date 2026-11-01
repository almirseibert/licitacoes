// /api/fontes — leitura, "Testar agora" e disparo de coleta (seções 4.1 e 13).
// O CRUD completo da tela de Fontes entra na Fase 2.
const express = require('express');
const pool = require('../config/db');
const fila = require('../servicos/fila');
const adaptadores = require('../adaptadores');
const { coletarFonte } = require('../jobs/coletar');

const rotas = express.Router();

rotas.get('/', async (_req, res) => {
  try {
    const [linhas] = await pool.query(
      `SELECT f.*,
              (SELECT COUNT(*) FROM licitacoes l WHERE l.fonte_id = f.id) AS total_licitacoes
         FROM fontes f
        ORDER BY f.prioridade ASC, f.nome ASC`
    );
    res.json({
      dados: linhas.map((f) => ({ ...f, adaptador_disponivel: adaptadores.existe(f.adaptador) })),
      adaptadores: adaptadores.listar(),
    });
  } catch (erro) {
    res.status(500).json({ erro: 'Não foi possível carregar as fontes.', detalhe: erro.message });
  }
});

// POST /api/fontes/:id/testar — roda a coleta só dela e devolve o que veio, SEM gravar.
rotas.post('/:id/testar', async (req, res) => {
  try {
    const resultado = await coletarFonte({
      fonteId: Number(req.params.id),
      termo: req.body && req.body.termo ? String(req.body.termo) : null,
      simular: true,
      limitePaginas: 1,
    });
    res.json(resultado);
  } catch (erro) {
    res.status(400).json({ erro: `Teste falhou: ${erro.message}` });
  }
});

// POST /api/fontes/:id/coletar — enfileira a coleta de verdade.
rotas.post('/:id/coletar', async (req, res) => {
  try {
    const [linhas] = await pool.query('SELECT id, nome FROM fontes WHERE id = ?', [req.params.id]);
    if (!linhas.length) return res.status(404).json({ erro: 'Fonte não encontrada.' });

    await fila.enfileirar(
      'coletar_fonte',
      { fonteId: Number(req.params.id) },
      { prioridade: 1, chaveUnica: `coletar:${req.params.id}` }
    );
    res.status(202).json({ ok: true, mensagem: `Coleta da fonte ${linhas[0].nome} está na fila.` });
  } catch (erro) {
    res.status(500).json({ erro: 'Não foi possível enfileirar a coleta.', detalhe: erro.message });
  }
});

// POST /api/fontes/coletar-todas — varre todas as fontes ativas vencidas.
rotas.post('/coletar-todas', async (req, res) => {
  try {
    await fila.enfileirar(
      'coletar_fontes',
      { forcar: Boolean(req.body && req.body.forcar) },
      { prioridade: 1, chaveUnica: 'coletar_fontes' }
    );
    res.status(202).json({ ok: true, mensagem: 'Varredura geral está na fila.' });
  } catch (erro) {
    res.status(500).json({ erro: 'Não foi possível enfileirar a varredura.', detalhe: erro.message });
  }
});

rotas.get('/execucoes', async (_req, res) => {
  try {
    const [linhas] = await pool.query(
      `SELECT e.*, f.nome AS fonte_nome
         FROM execucoes_coleta e LEFT JOIN fontes f ON f.id = e.fonte_id
        ORDER BY e.id DESC LIMIT 30`
    );
    res.json({ dados: linhas });
  } catch (erro) {
    res.status(500).json({ erro: 'Não foi possível carregar o histórico de coleta.', detalhe: erro.message });
  }
});

module.exports = rotas;
