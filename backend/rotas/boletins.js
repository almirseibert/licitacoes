// /api/boletins — boletim diário (Seção 4 do PLANO_SAAS_CONLICITACAO.md).
//
// Duas partes:
//   · `rotas` (com token, recurso `boletim`): "Meus filtros" (perfis_busca),
//     calendário do mês com status por pessoa, abrir boletim, marcar lido,
//     receber ou não o e-mail de um filtro.
//   · `publico` (sem token): o link de descadastro do e-mail. O GET só mostra
//     a confirmação — leitor de e-mail que pré-carrega link não descadastra
//     ninguém —; quem descadastra é o POST do botão.
const express = require('express');
const pool = require('../config/db');
const { jwt } = require('../config/ambiente');
const { responderErro } = require('../middlewares/responder-erro');
const { exigirLimite } = require('../servicos/limites');
const regras = require('../regras/boletim');
const { garantirPerfilInicial, agoraNoFuso } = require('../jobs/boletim');

const rotas = express.Router();
const publico = express.Router();

const COLUNAS = ['nome', 'palavras', 'exclusoes', 'ufs', 'municipios', 'modalidades', 'valor_minimo', 'valor_maximo', 'nota_minima', 'horarios', 'ativo', 'enviar_email'];
const JSONS = ['palavras', 'exclusoes', 'ufs', 'municipios', 'modalidades', 'horarios'];

function id(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function paraBanco(campos) {
  const saida = {};
  for (const c of COLUNAS) {
    if (c in campos) saida[c] = JSONS.includes(c) ? JSON.stringify(campos[c]) : campos[c];
  }
  return saida;
}

function erroDeDuplicado(erro) {
  return erro && erro.code === 'ER_DUP_ENTRY';
}

// ------------------------------------------------------------ meus filtros

rotas.get('/perfis', async (req, res) => {
  try {
    const org = req.organizacaoId;
    await garantirPerfilInicial(org);
    const [linhas] = await pool.query(
      `SELECT p.*,
              EXISTS (SELECT 1 FROM boletim_descadastros d WHERE d.perfil_id = p.id AND d.usuario_id = ?) AS descadastrado,
              (SELECT COUNT(*) FROM boletins b WHERE b.perfil_id = p.id AND b.total_itens > 0) AS boletins
         FROM perfis_busca p
        WHERE p.organizacao_id = ?
        ORDER BY p.id`,
      [req.usuario.id, org]
    );
    const [modalidades] = await pool.query(
      'SELECT DISTINCT modalidade FROM licitacoes WHERE modalidade IS NOT NULL ORDER BY modalidade'
    );
    res.json({
      dados: linhas.map((l) => ({ ...regras.lerPerfil(l), descadastrado: Boolean(l.descadastrado), boletins: Number(l.boletins) })),
      modalidades: modalidades.map((m) => m.modalidade),
      horarios_padrao: regras.HORARIOS_PADRAO,
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar os filtros do boletim.', erro);
  }
});

rotas.post('/perfis', exigirLimite('perfis_busca'), async (req, res) => {
  let campos;
  try {
    campos = regras.validarPerfil(req.body || {});
  } catch (erro) {
    return res.status(400).json({ erro: erro.message });
  }
  try {
    const dados = paraBanco(campos);
    const nomes = Object.keys(dados);
    const [r] = await pool.query(
      `INSERT INTO perfis_busca (organizacao_id, ${nomes.join(', ')}) VALUES (?, ${nomes.map(() => '?').join(', ')})`,
      [req.organizacaoId, ...nomes.map((n) => dados[n])]
    );
    res.status(201).json({ id: r.insertId });
  } catch (erro) {
    if (erroDeDuplicado(erro)) return res.status(409).json({ erro: 'Já existe um filtro com esse nome.' });
    responderErro(res, 500, 'Não foi possível criar o filtro.', erro);
  }
});

rotas.put('/perfis/:id', async (req, res) => {
  const perfilId = id(req.params.id);
  if (!perfilId) return res.status(404).json({ erro: 'Filtro não encontrado.' });
  let campos;
  try {
    campos = regras.validarPerfil(req.body || {}, { parcial: true });
  } catch (erro) {
    return res.status(400).json({ erro: erro.message });
  }
  try {
    // Faixa de valor conferida contra o que já está gravado, quando só um lado veio.
    if (('valor_minimo' in campos) !== ('valor_maximo' in campos)) {
      const [[atual]] = await pool.query(
        'SELECT valor_minimo, valor_maximo FROM perfis_busca WHERE id = ? AND organizacao_id = ?',
        [perfilId, req.organizacaoId]
      );
      if (!atual) return res.status(404).json({ erro: 'Filtro não encontrado.' });
      const min = 'valor_minimo' in campos ? campos.valor_minimo : atual.valor_minimo;
      const max = 'valor_maximo' in campos ? campos.valor_maximo : atual.valor_maximo;
      if (min != null && max != null && Number(min) > Number(max)) {
        return res.status(400).json({ erro: 'O valor mínimo está maior que o máximo.' });
      }
    }
    const dados = paraBanco(campos);
    const nomes = Object.keys(dados);
    if (!nomes.length) return res.status(400).json({ erro: 'Nada para alterar.' });
    const [r] = await pool.query(
      `UPDATE perfis_busca SET ${nomes.map((n) => `${n} = ?`).join(', ')} WHERE id = ? AND organizacao_id = ?`,
      [...nomes.map((n) => dados[n]), perfilId, req.organizacaoId]
    );
    if (!r.affectedRows) return res.status(404).json({ erro: 'Filtro não encontrado.' });
    res.json({ ok: true });
  } catch (erro) {
    if (erroDeDuplicado(erro)) return res.status(409).json({ erro: 'Já existe um filtro com esse nome.' });
    responderErro(res, 500, 'Não foi possível salvar o filtro.', erro);
  }
});

rotas.delete('/perfis/:id', async (req, res) => {
  const perfilId = id(req.params.id);
  if (!perfilId) return res.status(404).json({ erro: 'Filtro não encontrado.' });
  try {
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM perfis_busca WHERE organizacao_id = ?', [req.organizacaoId]);
    const [[existe]] = await pool.query('SELECT id FROM perfis_busca WHERE id = ? AND organizacao_id = ?', [perfilId, req.organizacaoId]);
    if (!existe) return res.status(404).json({ erro: 'Filtro não encontrado.' });
    if (total <= 1) {
      return res.status(409).json({ erro: 'Mantenha ao menos um filtro. Para parar o boletim, desative-o.' });
    }
    await pool.query('DELETE FROM perfis_busca WHERE id = ? AND organizacao_id = ?', [perfilId, req.organizacaoId]);
    res.json({ ok: true });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível apagar o filtro.', erro);
  }
});

// Receber (ou não) o e-mail de um filtro — vale só para quem está logado.
rotas.put('/perfis/:id/email', async (req, res) => {
  const perfilId = id(req.params.id);
  if (!perfilId) return res.status(404).json({ erro: 'Filtro não encontrado.' });
  try {
    const [[existe]] = await pool.query('SELECT id FROM perfis_busca WHERE id = ? AND organizacao_id = ?', [perfilId, req.organizacaoId]);
    if (!existe) return res.status(404).json({ erro: 'Filtro não encontrado.' });
    if (req.body && req.body.receber) {
      await pool.query('DELETE FROM boletim_descadastros WHERE perfil_id = ? AND usuario_id = ?', [perfilId, req.usuario.id]);
    } else {
      await pool.query('INSERT IGNORE INTO boletim_descadastros (perfil_id, usuario_id) VALUES (?, ?)', [perfilId, req.usuario.id]);
    }
    res.json({ ok: true, receber: Boolean(req.body && req.body.receber) });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível mudar o recebimento do e-mail.', erro);
  }
});

// --------------------------------------------------------------- boletins

const STATUS = ['nao_lido', 'lido', 'lido_outro'];

/** Filtro comum da lista e do "marcar como lido": mês, filtro, status, UF. */
function filtroDaLista(req, fonte) {
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(fonte.mes || '')) ? fonte.mes : agoraNoFuso().data.slice(0, 7);
  // Faixa de datas (usa o índice organizacao_id, data), não DATE_FORMAT.
  const onde = ['b.organizacao_id = ?', 'b.data >= ?', 'b.data < ? + INTERVAL 1 MONTH', 'b.total_itens > 0'];
  const valores = [req.organizacaoId, `${mes}-01`, `${mes}-01`];
  if (id(fonte.perfil_id)) {
    onde.push('b.perfil_id = ?');
    valores.push(id(fonte.perfil_id));
  }
  if (/^[A-Za-z]{2}$/.test(String(fonte.uf || ''))) {
    onde.push(`EXISTS (SELECT 1 FROM boletim_itens i JOIN licitacoes l ON l.id = i.licitacao_id
                        WHERE i.boletim_id = b.id AND l.uf = ?)`);
    valores.push(String(fonte.uf).toUpperCase());
  }
  const status = STATUS.includes(fonte.status) ? fonte.status : null;
  if (status === 'lido') onde.push('EXISTS (SELECT 1 FROM boletim_leituras r WHERE r.boletim_id = b.id AND r.usuario_id = ?)');
  if (status === 'lido_outro') {
    onde.push(`NOT EXISTS (SELECT 1 FROM boletim_leituras r WHERE r.boletim_id = b.id AND r.usuario_id = ?)
               AND EXISTS (SELECT 1 FROM boletim_leituras r WHERE r.boletim_id = b.id)`);
  }
  if (status === 'nao_lido') onde.push('NOT EXISTS (SELECT 1 FROM boletim_leituras r WHERE r.boletim_id = b.id)');
  if (status === 'lido' || status === 'lido_outro') valores.push(req.usuario.id);
  return { mes, onde: onde.join(' AND '), valores };
}

rotas.get('/', async (req, res) => {
  try {
    const { mes, onde, valores } = filtroDaLista(req, req.query);
    const [linhas] = await pool.query(
      `SELECT b.id, b.perfil_id, p.nome AS perfil, DATE_FORMAT(b.data, '%Y-%m-%d') AS data, b.horario, b.numero,
              b.total_itens, b.email_status, b.enviado_em,
              EXISTS (SELECT 1 FROM boletim_leituras r WHERE r.boletim_id = b.id AND r.usuario_id = ?) AS lido_por_mim,
              (SELECT GROUP_CONCAT(u.nome ORDER BY r.lido_em SEPARATOR ', ')
                 FROM boletim_leituras r JOIN usuarios u ON u.id = r.usuario_id
                WHERE r.boletim_id = b.id AND r.usuario_id <> ?) AS lido_por
         FROM boletins b JOIN perfis_busca p ON p.id = b.perfil_id
        WHERE ${onde}
        ORDER BY b.data DESC, b.numero ASC`,
      [req.usuario.id, req.usuario.id, ...valores]
    );
    res.json({
      mes,
      dados: linhas.map((l) => ({
        ...l,
        lido_por_mim: Boolean(l.lido_por_mim),
        status: l.lido_por_mim ? 'lido' : l.lido_por ? 'lido_outro' : 'nao_lido',
      })),
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar os boletins.', erro);
  }
});

rotas.post('/marcar-lidos', async (req, res) => {
  try {
    const { onde, valores } = filtroDaLista(req, req.body || {});
    const [r] = await pool.query(
      `INSERT IGNORE INTO boletim_leituras (boletim_id, usuario_id)
       SELECT b.id, ? FROM boletins b WHERE ${onde}`,
      [req.usuario.id, ...valores]
    );
    res.json({ ok: true, marcados: r.affectedRows });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível marcar os boletins como lidos.', erro);
  }
});

rotas.get('/:id', async (req, res) => {
  const boletimId = id(req.params.id);
  if (!boletimId) return res.status(404).json({ erro: 'Boletim não encontrado.' });
  try {
    const [[boletim]] = await pool.query(
      `SELECT b.id, b.perfil_id, p.nome AS perfil, DATE_FORMAT(b.data, '%Y-%m-%d') AS data, b.horario, b.numero,
              b.total_itens, b.email_status, b.email_detalhe, b.enviado_em
         FROM boletins b JOIN perfis_busca p ON p.id = b.perfil_id
        WHERE b.id = ? AND b.organizacao_id = ?`,
      [boletimId, req.organizacaoId]
    );
    if (!boletim) return res.status(404).json({ erro: 'Boletim não encontrado.' });
    const [itens] = await pool.query(
      `SELECT l.id, l.objeto, l.orgao_nome, l.uf, l.municipio, l.modalidade, l.valor_estimado, l.orcamento_sigiloso,
              l.fim_propostas, l.link_portal, i.palavra, i.onde
         FROM boletim_itens i JOIN licitacoes l ON l.id = i.licitacao_id
        WHERE i.boletim_id = ? AND i.organizacao_id = ?
        ORDER BY l.fim_propostas IS NULL, l.fim_propostas`,
      [boletimId, req.organizacaoId]
    );
    const [leituras] = await pool.query(
      `SELECT u.nome, r.lido_em FROM boletim_leituras r JOIN usuarios u ON u.id = r.usuario_id
        WHERE r.boletim_id = ? ORDER BY r.lido_em`,
      [boletimId]
    );
    res.json({ ...boletim, itens, leituras });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível abrir o boletim.', erro);
  }
});

rotas.post('/:id/lido', async (req, res) => {
  const boletimId = id(req.params.id);
  if (!boletimId) return res.status(404).json({ erro: 'Boletim não encontrado.' });
  try {
    const [[existe]] = await pool.query('SELECT id FROM boletins WHERE id = ? AND organizacao_id = ?', [boletimId, req.organizacaoId]);
    if (!existe) return res.status(404).json({ erro: 'Boletim não encontrado.' });
    if (req.body && req.body.lido === false) {
      await pool.query('DELETE FROM boletim_leituras WHERE boletim_id = ? AND usuario_id = ?', [boletimId, req.usuario.id]);
    } else {
      await pool.query('INSERT IGNORE INTO boletim_leituras (boletim_id, usuario_id) VALUES (?, ?)', [boletimId, req.usuario.id]);
    }
    res.json({ ok: true });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível marcar o boletim.', erro);
  }
});

// ------------------------------------------------------- descadastro público

function pagina(titulo, corpo) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo}</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5;color:#1f2937;background:#fff}
@media (prefers-color-scheme:dark){body{color:#e5e7eb;background:#111827}}button{font:inherit;padding:.5rem 1rem;cursor:pointer}</style></head>
<body><h1>${titulo}</h1>${corpo}</body></html>`;
}

function escaparHtml(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

async function lerDescadastro(token) {
  const dados = regras.lerTokenDescadastro(jwt.segredo, token);
  if (!dados) return null;
  const [[perfil]] = await pool.query(
    `SELECT p.id, p.nome FROM perfis_busca p
       JOIN organizacao_membros m ON m.organizacao_id = p.organizacao_id AND m.usuario_id = ?
      WHERE p.id = ?`,
    [dados.usuarioId, dados.perfilId]
  );
  return perfil ? { ...dados, nome: perfil.nome } : null;
}

publico.get('/:token', async (req, res) => {
  try {
    const d = await lerDescadastro(req.params.token);
    if (!d) return res.status(404).type('html').send(pagina('Link inválido', '<p>Este link de descadastro não vale mais.</p>'));
    res.type('html').send(
      pagina(
        'Parar de receber o boletim',
        `<p>Você deixará de receber por e-mail o boletim do filtro <strong>${escaparHtml(d.nome)}</strong>. O boletim continua no painel.</p>
<form method="post"><button type="submit">Confirmar descadastro</button></form>`
      )
    );
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível abrir o descadastro.', erro);
  }
});

publico.post('/:token', async (req, res) => {
  try {
    const d = await lerDescadastro(req.params.token);
    if (!d) return res.status(404).type('html').send(pagina('Link inválido', '<p>Este link de descadastro não vale mais.</p>'));
    await pool.query('INSERT IGNORE INTO boletim_descadastros (perfil_id, usuario_id) VALUES (?, ?)', [d.perfilId, d.usuarioId]);
    res.type('html').send(
      pagina('Pronto', `<p>Você não recebe mais o boletim do filtro <strong>${escaparHtml(d.nome)}</strong> por e-mail. Para voltar, use a tela Boletins do painel.</p>`)
    );
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível concluir o descadastro.', erro);
  }
});

module.exports = { rotas, publico };
