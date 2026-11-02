// /api/kits — conjuntos salvos de documentos (seção 17.3).
const express = require('express');
const pool = require('../config/db');
const { PORCODIGO } = require('../regras/exigencias');
const { tituloPadrao } = require('../regras/validades');

const rotas = express.Router();

function rotuloDe(codigo) {
  const item = PORCODIGO.get(codigo);
  return (item && item.rotulo) || tituloPadrao(codigo);
}

rotas.get('/', async (req, res) => {
  try {
    const [perfis] = req.query.perfil_id
      ? await pool.query('SELECT id FROM empresa_perfis WHERE id = ?', [req.query.perfil_id])
      : await pool.query('SELECT id FROM empresa_perfis ORDER BY padrao DESC, id ASC LIMIT 1');
    if (!perfis.length) return res.json({ dados: [] });

    const [kits] = await pool.query(
      'SELECT * FROM documento_kits WHERE perfil_id = ? ORDER BY padrao DESC, nome ASC',
      [perfis[0].id]
    );
    const [itens] = await pool.query(
      `SELECT i.* FROM documento_kit_itens i
         JOIN documento_kits k ON k.id = i.kit_id
        WHERE k.perfil_id = ? ORDER BY i.ordem ASC`,
      [perfis[0].id]
    );

    res.json({
      dados: kits.map((kit) => ({
        ...kit,
        itens: itens
          .filter((i) => i.kit_id === kit.id)
          .map((i) => ({ ...i, rotulo: rotuloDe(i.codigo) })),
      })),
    });
  } catch (erro) {
    res.status(500).json({ erro: 'Não foi possível carregar os kits.', detalhe: erro.message });
  }
});

rotas.post('/', async (req, res) => {
  try {
    const corpo = req.body || {};
    const nome = String(corpo.nome || '').trim().slice(0, 120);
    if (!nome) return res.status(400).json({ erro: 'Dê um nome ao kit.' });

    const [perfis] = await pool.query('SELECT id FROM empresa_perfis ORDER BY padrao DESC, id ASC LIMIT 1');
    if (!perfis.length) return res.status(400).json({ erro: 'Cadastre o perfil da empresa antes.' });

    const [r] = await pool.query(
      'INSERT INTO documento_kits (perfil_id, nome, descricao, padrao) VALUES (?, ?, ?, ?)',
      [perfis[0].id, nome, corpo.descricao ? String(corpo.descricao).slice(0, 255) : null, corpo.padrao ? 1 : 0]
    );
    if (corpo.padrao) {
      await pool.query('UPDATE documento_kits SET padrao = 0 WHERE perfil_id = ? AND id <> ?', [perfis[0].id, r.insertId]);
    }
    res.status(201).json({ ok: true, id: r.insertId });
  } catch (erro) {
    if (erro.code === 'ER_DUP_ENTRY') return res.status(409).json({ erro: 'Já existe um kit com esse nome.' });
    res.status(400).json({ erro: erro.message });
  }
});

rotas.patch('/:id', async (req, res) => {
  try {
    const campos = {};
    const corpo = req.body || {};
    if ('nome' in corpo) campos.nome = String(corpo.nome).trim().slice(0, 120);
    if ('descricao' in corpo) campos.descricao = String(corpo.descricao || '').slice(0, 255) || null;
    if ('padrao' in corpo) campos.padrao = corpo.padrao ? 1 : 0;
    if ('ativo' in corpo) campos.ativo = corpo.ativo ? 1 : 0;

    const colunas = Object.keys(campos);
    if (!colunas.length) return res.status(400).json({ erro: 'Nada para alterar.' });

    const [r] = await pool.query(
      `UPDATE documento_kits SET ${colunas.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...colunas.map((c) => campos[c]), req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ erro: 'Kit não encontrado.' });

    if (campos.padrao) {
      const [[kit]] = await pool.query('SELECT perfil_id FROM documento_kits WHERE id = ?', [req.params.id]);
      await pool.query('UPDATE documento_kits SET padrao = 0 WHERE perfil_id = ? AND id <> ?', [kit.perfil_id, req.params.id]);
    }
    res.json({ ok: true });
  } catch (erro) {
    if (erro.code === 'ER_DUP_ENTRY') return res.status(409).json({ erro: 'Já existe um kit com esse nome.' });
    res.status(400).json({ erro: erro.message });
  }
});

rotas.delete('/:id', async (req, res) => {
  try {
    const [[kit]] = await pool.query('SELECT padrao FROM documento_kits WHERE id = ?', [req.params.id]);
    if (!kit) return res.status(404).json({ erro: 'Kit não encontrado.' });
    if (kit.padrao) return res.status(409).json({ erro: 'Este é o kit padrão. Escolha outro como padrão antes de apagar.' });

    await pool.query('DELETE FROM documento_kits WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (erro) {
    res.status(500).json({ erro: 'Não foi possível apagar o kit.', detalhe: erro.message });
  }
});

// Itens do kit: a tela manda a lista inteira, na ordem.
rotas.put('/:id/itens', async (req, res) => {
  const conexao = await pool.getConnection();
  try {
    const itens = Array.isArray(req.body && req.body.itens) ? req.body.itens : null;
    if (!itens) return res.status(400).json({ erro: 'Mande a lista de itens.' });

    for (const item of itens) {
      if (!item || !item.codigo) throw new Error('Todo item precisa de um código do catálogo.');
      if (!PORCODIGO.has(item.codigo)) throw new Error(`Código desconhecido: "${item.codigo}".`);
    }

    await conexao.beginTransaction();
    await conexao.query('DELETE FROM documento_kit_itens WHERE kit_id = ?', [req.params.id]);
    let ordem = 1;
    for (const item of itens) {
      await conexao.query(
        `INSERT INTO documento_kit_itens (kit_id, codigo, ordem, obrigatorio, so_se_exigido, documento_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          req.params.id, item.codigo, ordem,
          item.obrigatorio === false ? 0 : 1,
          item.so_se_exigido ? 1 : 0,
          item.documento_id || null,
        ]
      );
      ordem += 1;
    }
    await conexao.commit();
    res.json({ ok: true, itens: itens.length });
  } catch (erro) {
    await conexao.rollback().catch(() => {});
    res.status(400).json({ erro: erro.message });
  } finally {
    conexao.release();
  }
});

module.exports = rotas;
