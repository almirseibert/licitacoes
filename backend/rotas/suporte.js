// /api/suporte — central de ajuda e "Solicitações" do cliente (Seção 17).
// O lado do suporte (responder, NPS agregado) fica em rotas/admin.js.
// Montada só com `comToken`: uma organização com teste vencido precisa poder pedir ajuda.
const express = require('express');
const pool = require('../config/db');
const { NIVEL_PAPEL, exigirPapel } = require('../middlewares/autenticar');
const { responderErro } = require('../middlewares/responder-erro');
const email = require('../servicos/email');
const auditoria = require('../servicos/auditoria');
const { GUIAS } = require('../config/dados/ajuda');
const ajuda = require('../regras/ajuda');
const regras = require('../regras/suporte');
const { suporteEmail } = require('../config/ambiente');

const rotas = express.Router();

const COLUNAS = 's.id, s.assunto, s.categoria, s.status, s.criada_em, s.atualizada_em, s.usuario_id, u.nome AS aberta_por';

const comProtocolo = (s) => ({ ...s, protocolo: regras.protocolo(s.id, s.criada_em), categoria_rotulo: regras.CATEGORIAS[s.categoria], status_rotulo: regras.STATUS[s.status] });

/** Admin e dono veem todas da organização; os demais, só as que abriram. */
const veTodas = (papel) => NIVEL_PAPEL[papel] >= NIVEL_PAPEL.admin;

async function carregar(req, id) {
  const [[s]] = await pool.query(
    `SELECT ${COLUNAS} FROM solicitacoes s LEFT JOIN usuarios u ON u.id = s.usuario_id WHERE s.id = ? AND s.organizacao_id = ?`,
    [id, req.organizacaoId]
  );
  if (!s) return null;
  if (!veTodas(req.papel) && s.usuario_id !== req.usuario.id) return null;
  return s;
}

// GET /api/suporte/ajuda?q= — guias da central, com busca.
rotas.get('/ajuda', (req, res) => {
  res.json({ guias: ajuda.buscar(GUIAS, req.query.q), total: GUIAS.length });
});

// GET /api/suporte/solicitacoes
rotas.get('/solicitacoes', async (req, res) => {
  try {
    const parametros = [req.organizacaoId];
    let filtro = '';
    if (!veTodas(req.papel)) {
      filtro = ' AND s.usuario_id = ?';
      parametros.push(req.usuario.id);
    }
    const [linhas] = await pool.query(
      `SELECT ${COLUNAS} FROM solicitacoes s LEFT JOIN usuarios u ON u.id = s.usuario_id
        WHERE s.organizacao_id = ?${filtro} ORDER BY s.atualizada_em DESC, s.id DESC LIMIT 200`,
      parametros
    );
    res.json({ solicitacoes: linhas.map(comProtocolo), categorias: regras.CATEGORIAS, status: regras.STATUS });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar as solicitações.', erro);
  }
});

// POST /api/suporte/solicitacoes — { assunto, categoria, texto }
rotas.post('/solicitacoes', exigirPapel('membro'), async (req, res) => {
  const v = regras.validarNova(req.body);
  if (v.erro) return res.status(400).json({ erro: v.erro });
  const conexao = await pool.getConnection();
  try {
    await conexao.beginTransaction();
    const [r] = await conexao.query(
      'INSERT INTO solicitacoes (organizacao_id, usuario_id, assunto, categoria) VALUES (?, ?, ?, ?)',
      [req.organizacaoId, req.usuario.id, v.dados.assunto, v.dados.categoria]
    );
    await conexao.query(
      "INSERT INTO solicitacao_mensagens (solicitacao_id, autor, usuario_id, texto) VALUES (?, 'cliente', ?, ?)",
      [r.insertId, req.usuario.id, v.dados.texto]
    );
    await conexao.commit();

    const protocolo = regras.protocolo(r.insertId, new Date());
    await auditoria.registrarDaRequisicao(req, 'abriu_solicitacao', 'suporte', r.insertId, { categoria: v.dados.categoria });
    avisarSuporte({ protocolo, assunto: v.dados.assunto, texto: v.dados.texto, de: req.usuario, organizacaoId: req.organizacaoId });
    res.status(201).json({ id: r.insertId, protocolo });
  } catch (erro) {
    await conexao.rollback().catch(() => {});
    responderErro(res, 500, 'Não foi possível abrir a solicitação agora.', erro);
  } finally {
    conexao.release();
  }
});

/** Aviso ao suporte por e-mail, se houver caixa configurada. Falhar não desfaz a solicitação. */
function avisarSuporte({ protocolo, assunto, texto, de, organizacaoId }) {
  if (!suporteEmail) return;
  email
    .enviarTransacional({
      para: suporteEmail,
      assunto: `[Suporte] ${protocolo} — ${assunto}`,
      texto: `${de.nome} (${de.email}), organização ${organizacaoId}:\n\n${texto}`,
      responderPara: de.email,
    })
    .catch((erro) => console.error('Aviso de solicitação ao suporte falhou:', erro.message));
}

// GET /api/suporte/solicitacoes/:id — a conversa inteira.
rotas.get('/solicitacoes/:id', async (req, res) => {
  try {
    const s = await carregar(req, Number(req.params.id) || 0);
    if (!s) return res.status(404).json({ erro: 'Solicitação não encontrada.' });
    const [mensagens] = await pool.query(
      `SELECT m.id, m.autor, m.texto, m.criada_em, u.nome AS nome
         FROM solicitacao_mensagens m LEFT JOIN usuarios u ON u.id = m.usuario_id
        WHERE m.solicitacao_id = ? ORDER BY m.id`,
      [s.id]
    );
    res.json({ ...comProtocolo(s), mensagens });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar a solicitação.', erro);
  }
});

// POST /api/suporte/solicitacoes/:id/mensagens — { texto }
rotas.post('/solicitacoes/:id/mensagens', exigirPapel('membro'), async (req, res) => {
  const v = regras.validarMensagem(req.body);
  if (v.erro) return res.status(400).json({ erro: v.erro });
  try {
    const s = await carregar(req, Number(req.params.id) || 0);
    if (!s) return res.status(404).json({ erro: 'Solicitação não encontrada.' });
    await pool.query("INSERT INTO solicitacao_mensagens (solicitacao_id, autor, usuario_id, texto) VALUES (?, 'cliente', ?, ?)", [
      s.id, req.usuario.id, v.dados.texto,
    ]);
    const novo = regras.statusAposMensagem(s.status, 'cliente');
    await pool.query('UPDATE solicitacoes SET status = ?, atualizada_em = NOW() WHERE id = ? AND organizacao_id = ?', [novo, s.id, req.organizacaoId]);
    avisarSuporte({ protocolo: regras.protocolo(s.id, s.criada_em), assunto: s.assunto, texto: v.dados.texto, de: req.usuario, organizacaoId: req.organizacaoId });
    res.status(201).json({ ok: true, status: novo });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível enviar a mensagem.', erro);
  }
});

// POST /api/suporte/solicitacoes/:id/encerrar — o cliente dá o assunto por resolvido.
rotas.post('/solicitacoes/:id/encerrar', exigirPapel('membro'), async (req, res) => {
  try {
    const s = await carregar(req, Number(req.params.id) || 0);
    if (!s) return res.status(404).json({ erro: 'Solicitação não encontrada.' });
    await pool.query("UPDATE solicitacoes SET status = 'encerrada' WHERE id = ? AND organizacao_id = ?", [s.id, req.organizacaoId]);
    res.json({ ok: true });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível encerrar a solicitação.', erro);
  }
});

module.exports = rotas;
