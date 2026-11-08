// /api/fontes — CRUD, "Testar agora" e disparo de coleta (seções 4.1 e 13).
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

// Campos que a tela pode mexer. Qualquer outro é ignorado de propósito —
// `ultima_coleta` e `ultimo_status` são escritos só pela coleta.
const EDITAVEIS = ['nome', 'adaptador', 'url_base', 'config', 'ativa', 'intervalo_horas', 'prioridade', 'observacao'];

function limpar(corpo, { exigirTudo }) {
  const campos = {};
  for (const chave of EDITAVEIS) {
    if (!(chave in corpo)) continue;
    campos[chave] = corpo[chave];
  }

  if (exigirTudo) {
    for (const obrigatorio of ['nome', 'adaptador', 'url_base']) {
      if (!campos[obrigatorio]) throw new Error(`Informe ${obrigatorio.replace('_', ' ')}.`);
    }
  }

  if (campos.adaptador && !adaptadores.existe(campos.adaptador)) {
    throw new Error(`Não existe adaptador "${campos.adaptador}". Disponíveis: ${adaptadores.listar().map((a) => a.chave).join(', ')}.`);
  }
  if ('config' in campos) {
    if (typeof campos.config === 'string') {
      try {
        campos.config = JSON.parse(campos.config || '{}');
      } catch {
        throw new Error('A configuração precisa ser um JSON válido.');
      }
    }
    campos.config = JSON.stringify(campos.config || {});
  }
  if ('ativa' in campos) campos.ativa = campos.ativa ? 1 : 0;
  if ('intervalo_horas' in campos) {
    const horas = Number(campos.intervalo_horas);
    if (!Number.isFinite(horas) || horas < 1 || horas > 168) {
      throw new Error('O intervalo precisa ficar entre 1 e 168 horas.');
    }
    campos.intervalo_horas = Math.round(horas);
  }
  if ('prioridade' in campos) campos.prioridade = Number(campos.prioridade) || 10;

  return campos;
}

rotas.post('/', async (req, res) => {
  try {
    const campos = limpar(req.body || {}, { exigirTudo: true });
    const colunas = Object.keys(campos);
    const [r] = await pool.query(
      `INSERT INTO fontes (${colunas.join(', ')}) VALUES (${colunas.map(() => '?').join(', ')})`,
      colunas.map((c) => campos[c])
    );
    res.status(201).json({ ok: true, id: r.insertId, mensagem: `Fonte ${campos.nome} cadastrada.` });
  } catch (erro) {
    if (erro.code === 'ER_DUP_ENTRY') return res.status(409).json({ erro: 'Já existe uma fonte com esse nome.' });
    res.status(400).json({ erro: erro.message });
  }
});

rotas.patch('/:id', async (req, res) => {
  try {
    const campos = limpar(req.body || {}, { exigirTudo: false });
    const colunas = Object.keys(campos);
    if (!colunas.length) return res.status(400).json({ erro: 'Nada para alterar.' });

    const [r] = await pool.query(
      `UPDATE fontes SET ${colunas.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...colunas.map((c) => campos[c]), req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ erro: 'Fonte não encontrada.' });
    res.json({ ok: true });
  } catch (erro) {
    if (erro.code === 'ER_DUP_ENTRY') return res.status(409).json({ erro: 'Já existe uma fonte com esse nome.' });
    res.status(400).json({ erro: erro.message });
  }
});

// Apagar uma fonte leva junto as licitações dela (FK em cascata). Por isso só
// apagamos quando não há nada gravado; do contrário, o caminho é desativar.
rotas.delete('/:id', async (req, res) => {
  try {
    const [[contagem]] = await pool.query('SELECT COUNT(*) AS total FROM licitacoes WHERE fonte_id = ?', [req.params.id]);
    if (contagem.total) {
      return res.status(409).json({
        erro: `Esta fonte tem ${contagem.total} licitações gravadas. Desative-a em vez de apagar — apagar levaria o histórico junto.`,
      });
    }
    const [r] = await pool.query('DELETE FROM fontes WHERE id = ?', [req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ erro: 'Fonte não encontrada.' });
    res.json({ ok: true });
  } catch (erro) {
    res.status(500).json({ erro: 'Não foi possível apagar a fonte.', detalhe: erro.message });
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
