// /api/empresa — perfis da empresa (seção 4.7). Os CNAEs e sua cobertura são o
// que alimenta a checagem de objeto social da seção 6.2.
// Os documentos do cofre (seções 9 e 17) ficam em rotas/cofre.js.
const express = require('express');
const { responderErro } = require('../middlewares/responder-erro');
const pool = require('../config/db');

const rotas = express.Router();

const EDITAVEIS = ['nome', 'razao_social', 'nome_fantasia', 'cnpj', 'natureza', 'regime',
  'capital_social', 'aberta_em', 'insc_estadual', 'insc_municipal', 'endereco',
  'representante', 'cpf_representante', 'cnaes', 'receita_12m', 'padrao'];

const NATUREZAS = ['ME', 'EPP', 'LTDA', 'Outra'];
const REGIMES = ['Simples Nacional', 'Lucro Presumido', 'Lucro Real'];

function limpar(corpo, { exigirTudo }) {
  const campos = {};
  for (const chave of EDITAVEIS) {
    if (chave in corpo) campos[chave] = corpo[chave];
  }

  if (exigirTudo && !campos.nome) throw new Error('Informe o nome do perfil.');
  if (campos.natureza && !NATUREZAS.includes(campos.natureza)) {
    throw new Error(`Natureza inválida. Use: ${NATUREZAS.join(', ')}.`);
  }
  if (campos.regime && !REGIMES.includes(campos.regime)) {
    throw new Error(`Regime inválido. Use: ${REGIMES.join(', ')}.`);
  }

  if ('cnaes' in campos) {
    const lista = Array.isArray(campos.cnaes) ? campos.cnaes : [];
    for (const cnae of lista) {
      if (!cnae || !cnae.codigo) throw new Error('Todo CNAE precisa de código.');
      if (cnae.cobertura && !Array.isArray(cnae.cobertura)) {
        throw new Error(`A cobertura do CNAE ${cnae.codigo} precisa ser uma lista de palavras.`);
      }
    }
    campos.cnaes = JSON.stringify(
      lista.map((c) => ({
        codigo: String(c.codigo).trim(),
        descricao: c.descricao ? String(c.descricao).trim() : null,
        principal: Boolean(c.principal),
        // Sem acento de propósito: a comparação roda sobre o objeto normalizado.
        cobertura: (c.cobertura || []).map((t) => String(t).trim().toLowerCase()).filter(Boolean),
      }))
    );
  }
  if ('padrao' in campos) campos.padrao = campos.padrao ? 1 : 0;

  return campos;
}

rotas.get('/perfis', async (_req, res) => {
  try {
    const [linhas] = await pool.query('SELECT * FROM empresa_perfis ORDER BY padrao DESC, id ASC');
    res.json({
      dados: linhas.map((p) => ({
        ...p,
        cnaes: typeof p.cnaes === 'string' ? JSON.parse(p.cnaes || '[]') : p.cnaes || [],
      })),
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar os perfis da empresa.', erro);
  }
});

rotas.post('/perfis', async (req, res) => {
  try {
    const campos = limpar(req.body || {}, { exigirTudo: true });
    const colunas = Object.keys(campos);
    const [r] = await pool.query(
      `INSERT INTO empresa_perfis (${colunas.join(', ')}) VALUES (${colunas.map(() => '?').join(', ')})`,
      colunas.map((c) => campos[c])
    );
    if (campos.padrao) await pool.query('UPDATE empresa_perfis SET padrao = 0 WHERE id <> ?', [r.insertId]);
    res.status(201).json({ ok: true, id: r.insertId });
  } catch (erro) {
    if (erro.code === 'ER_DUP_ENTRY') return res.status(409).json({ erro: 'Já existe um perfil com esse nome.' });
    res.status(400).json({ erro: erro.message });
  }
});

rotas.patch('/perfis/:id', async (req, res) => {
  try {
    const campos = limpar(req.body || {}, { exigirTudo: false });
    const colunas = Object.keys(campos);
    if (!colunas.length) return res.status(400).json({ erro: 'Nada para alterar.' });

    const [r] = await pool.query(
      `UPDATE empresa_perfis SET ${colunas.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...colunas.map((c) => campos[c]), req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ erro: 'Perfil não encontrado.' });
    // Só um perfil é o padrão — é dele que a coleta lê os CNAEs.
    if (campos.padrao) await pool.query('UPDATE empresa_perfis SET padrao = 0 WHERE id <> ?', [req.params.id]);
    res.json({ ok: true, mensagem: 'Perfil salvo. Repontue para aplicar aos CNAEs do que já está no Radar.' });
  } catch (erro) {
    if (erro.code === 'ER_DUP_ENTRY') return res.status(409).json({ erro: 'Já existe um perfil com esse nome.' });
    res.status(400).json({ erro: erro.message });
  }
});

rotas.use('/documentos', require('./cofre'));

module.exports = rotas;
