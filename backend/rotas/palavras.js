// /api/palavras — CRUD das palavras-chave e das excluídas (seções 4.2 e 11.4),
// mais o "Simular", que testa um termo antes de ativá-lo.
const express = require('express');
const { responderErro } = require('../middlewares/responder-erro');
const pool = require('../config/db');
const { coletarFonte } = require('../jobs/coletar');

const rotas = express.Router();

const GRUPOS_SUGERIDOS = ['Serviços digitais', 'Frota e rastreamento', 'Informática e itens'];

rotas.get('/', async (req, res) => {
  try {
    const org = req.organizacaoId;
    const [palavras] = await pool.query(
      `SELECT p.*,
              (SELECT COUNT(*) FROM licitacoes l WHERE l.palavra_casada = p.termo AND l.descartada = 0) AS licitacoes
         FROM palavras_chave p
        WHERE p.organizacao_id = ?
        ORDER BY p.grupo ASC, p.peso DESC, p.termo ASC`,
      [org]
    );
    const [excluidas] = await pool.query(
      'SELECT * FROM palavras_excluidas WHERE organizacao_id = ? ORDER BY termo',
      [org]
    );
    const [grupos] = await pool.query(
      'SELECT DISTINCT grupo FROM palavras_chave WHERE organizacao_id = ? ORDER BY grupo',
      [org]
    );

    res.json({
      dados: palavras.map((p) => ({
        ...p,
        fontes_ids: typeof p.fontes_ids === 'string' ? JSON.parse(p.fontes_ids) : p.fontes_ids,
      })),
      excluidas,
      grupos: [...new Set([...grupos.map((g) => g.grupo), ...GRUPOS_SUGERIDOS])],
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar as palavras-chave.', erro);
  }
});

// ------------------------------------------------------------- palavras-chave
function limpar(corpo, { exigirTudo }) {
  const campos = {};
  for (const chave of ['termo', 'grupo', 'usar_aspas', 'peso', 'ativa', 'fontes_ids', 'observacao']) {
    if (chave in corpo) campos[chave] = corpo[chave];
  }

  if (exigirTudo) {
    if (!campos.termo || !String(campos.termo).trim()) throw new Error('Informe o termo.');
    if (!campos.grupo || !String(campos.grupo).trim()) throw new Error('Informe o grupo.');
  }

  if ('termo' in campos) {
    campos.termo = String(campos.termo).trim().slice(0, 160);
    if (!campos.termo) throw new Error('O termo não pode ficar vazio.');
  }
  if ('grupo' in campos) campos.grupo = String(campos.grupo).trim().slice(0, 60);
  if ('peso' in campos) {
    const peso = Number(campos.peso);
    if (!Number.isFinite(peso) || peso < 1 || peso > 40) throw new Error('O peso precisa ficar entre 1 e 40.');
    campos.peso = Math.round(peso);
  }
  if ('usar_aspas' in campos) campos.usar_aspas = campos.usar_aspas ? 1 : 0;
  if ('ativa' in campos) campos.ativa = campos.ativa ? 1 : 0;
  if ('fontes_ids' in campos) {
    const lista = campos.fontes_ids;
    campos.fontes_ids = Array.isArray(lista) && lista.length ? JSON.stringify(lista.map(Number)) : null;
  }

  return campos;
}

rotas.post('/', async (req, res) => {
  try {
    const campos = limpar(req.body || {}, { exigirTudo: true });
    campos.organizacao_id = req.organizacaoId;
    const colunas = Object.keys(campos);
    const [r] = await pool.query(
      `INSERT INTO palavras_chave (${colunas.join(', ')}) VALUES (${colunas.map(() => '?').join(', ')})`,
      colunas.map((c) => campos[c])
    );
    res.status(201).json({ ok: true, id: r.insertId, mensagem: `"${campos.termo}" entra na próxima coleta.` });
  } catch (erro) {
    if (erro.code === 'ER_DUP_ENTRY') return res.status(409).json({ erro: 'Esse termo já está cadastrado.' });
    res.status(400).json({ erro: erro.message });
  }
});

rotas.patch('/:id', async (req, res) => {
  try {
    const campos = limpar(req.body || {}, { exigirTudo: false });
    const colunas = Object.keys(campos);
    if (!colunas.length) return res.status(400).json({ erro: 'Nada para alterar.' });

    // organizacao_id entra sempre no WHERE, nunca no SET: ninguém altera uma
    // palavra de outra organização, mesmo sabendo o id da linha.
    const [r] = await pool.query(
      `UPDATE palavras_chave SET ${colunas.map((c) => `${c} = ?`).join(', ')} WHERE id = ? AND organizacao_id = ?`,
      [...colunas.map((c) => campos[c]), req.params.id, req.organizacaoId]
    );
    if (!r.affectedRows) return res.status(404).json({ erro: 'Palavra-chave não encontrada.' });
    res.json({ ok: true });
  } catch (erro) {
    if (erro.code === 'ER_DUP_ENTRY') return res.status(409).json({ erro: 'Esse termo já está cadastrado.' });
    res.status(400).json({ erro: erro.message });
  }
});

rotas.delete('/:id', async (req, res) => {
  try {
    const [r] = await pool.query(
      'DELETE FROM palavras_chave WHERE id = ? AND organizacao_id = ?',
      [req.params.id, req.organizacaoId]
    );
    if (!r.affectedRows) return res.status(404).json({ erro: 'Palavra-chave não encontrada.' });
    // As licitações que ela trouxe continuam no Radar: quem decide o que sai é
    // a palavra excluída, não a remoção do termo de busca.
    res.json({ ok: true });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível apagar a palavra-chave.', erro);
  }
});

// ---------------------------------------------------------- palavras excluídas
rotas.post('/excluidas', async (req, res) => {
  try {
    const termo = String((req.body && req.body.termo) || '').trim().slice(0, 160);
    if (!termo) return res.status(400).json({ erro: 'Informe o termo a ignorar.' });

    const [r] = await pool.query(
      'INSERT INTO palavras_excluidas (organizacao_id, termo, ativa) VALUES (?, ?, 1)',
      [req.organizacaoId, termo]
    );
    res.status(201).json({
      ok: true,
      id: r.insertId,
      mensagem: `"${termo}" passa a cortar resultados. Repontue para aplicar ao que já está no Radar.`,
    });
  } catch (erro) {
    if (erro.code === 'ER_DUP_ENTRY') return res.status(409).json({ erro: 'Esse termo já está na lista.' });
    res.status(400).json({ erro: erro.message });
  }
});

rotas.patch('/excluidas/:id', async (req, res) => {
  try {
    const campos = {};
    if (req.body && 'termo' in req.body) campos.termo = String(req.body.termo).trim().slice(0, 160);
    if (req.body && 'ativa' in req.body) campos.ativa = req.body.ativa ? 1 : 0;
    const colunas = Object.keys(campos);
    if (!colunas.length) return res.status(400).json({ erro: 'Nada para alterar.' });

    const [r] = await pool.query(
      `UPDATE palavras_excluidas SET ${colunas.map((c) => `${c} = ?`).join(', ')} WHERE id = ? AND organizacao_id = ?`,
      [...colunas.map((c) => campos[c]), req.params.id, req.organizacaoId]
    );
    if (!r.affectedRows) return res.status(404).json({ erro: 'Palavra não encontrada.' });
    res.json({ ok: true });
  } catch (erro) {
    if (erro.code === 'ER_DUP_ENTRY') return res.status(409).json({ erro: 'Esse termo já está na lista.' });
    res.status(400).json({ erro: erro.message });
  }
});

rotas.delete('/excluidas/:id', async (req, res) => {
  try {
    const [r] = await pool.query(
      'DELETE FROM palavras_excluidas WHERE id = ? AND organizacao_id = ?',
      [req.params.id, req.organizacaoId]
    );
    if (!r.affectedRows) return res.status(404).json({ erro: 'Palavra não encontrada.' });
    res.json({ ok: true });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível apagar a palavra.', erro);
  }
});

// ------------------------------------------------------------------- simular
/**
 * POST /api/palavras/simular — testar antes de ativar (seção 11.4).
 *
 * Devolve dois números que respondem perguntas diferentes:
 *   `no_portal`  quanto o termo traria agora, buscando de verdade (sem gravar);
 *   `ja_no_radar` quanto do que já está gravado casaria com ele.
 */
rotas.post('/simular', async (req, res) => {
  try {
    const termo = String((req.body && req.body.termo) || '').trim();
    if (!termo) return res.status(400).json({ erro: 'Informe o termo a simular.' });

    let fonteId = Number(req.body.fonte_id) || null;
    if (!fonteId) {
      const [fontes] = await pool.query(
        'SELECT id FROM fontes WHERE ativa = 1 ORDER BY prioridade ASC, id ASC LIMIT 1'
      );
      if (!fontes.length) return res.status(400).json({ erro: 'Nenhuma fonte ativa para simular.' });
      fonteId = fontes[0].id;
    }

    const [[jaNoRadar]] = await pool.query(
      `SELECT COUNT(*) AS total FROM licitacoes
        WHERE objeto LIKE ? AND criado_em >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      [`%${termo}%`]
    );

    const simulacao = await coletarFonte({
      fonteId,
      termo,
      usarAspas: req.body.usar_aspas === undefined ? true : Boolean(req.body.usar_aspas),
      peso: Number(req.body.peso) || 10,
      simular: true,
      limitePaginas: 1,
    });

    res.json({
      termo,
      fonte: simulacao.fonte,
      no_portal: simulacao.encontradas,
      descartadas_na_hora: simulacao.ignoradas,
      ja_no_radar: jaNoRadar.total,
      amostra: simulacao.amostra,
      erros: simulacao.erros,
    });
  } catch (erro) {
    res.status(400).json({ erro: `A simulação falhou: ${erro.message}` });
  }
});

module.exports = rotas;
