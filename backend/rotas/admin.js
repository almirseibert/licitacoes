// Painel do superadmin (Seção 3 do PLANO_SAAS_CONLICITACAO.md): todas as
// organizações, plano, uso real e as ações da cobrança manual. Só quem é
// admin ou dono da organização operadora (Studio Mythos) entra — a permissão
// vem daqui, nunca de um e-mail fixo no frontend (CLAUDE.md).
const express = require('express');
const pool = require('../config/db');
const { NIVEL_PAPEL } = require('../middlewares/autenticar');
const { responderErro } = require('../middlewares/responder-erro');
const escopo = require('../servicos/escopo');
const limites = require('../servicos/limites');
const cobranca = require('../servicos/cobranca');
const email = require('../servicos/email');
const regrasSuporte = require('../regras/suporte');
const regrasNps = require('../regras/onboarding');

const rotas = express.Router();

function exigirSuperadmin(req, res, next) {
  if (escopo.ehOperadora(req.organizacaoId) && NIVEL_PAPEL[req.papel] >= NIVEL_PAPEL.admin) return next();
  return res.status(403).json({ erro: 'Área restrita à administração do serviço.' });
}
rotas.use(exigirSuperadmin);

function idValido(valor) {
  try {
    return escopo.idOrganizacao(valor);
  } catch {
    return null;
  }
}

// GET /api/admin/organizacoes — lista com plano, situação e uso de agora.
rotas.get('/organizacoes', async (_req, res) => {
  try {
    const [orgs] = await pool.query(
      `SELECT o.id, o.nome, o.status, o.teste_ate, o.criado_em,
              (SELECT COUNT(*) FROM org_licitacoes ol WHERE ol.organizacao_id = o.id AND ol.pontuacao > 0) AS licitacoes_pontuadas,
              (SELECT MAX(ae.criado_em) FROM assinatura_eventos ae WHERE ae.organizacao_id = o.id) AS ultimo_evento
         FROM organizacoes o ORDER BY o.id`
    );
    const lista = [];
    for (const o of orgs) {
      const [dados, uso] = await Promise.all([limites.daOrganizacao(o.id), limites.uso(o.id)]);
      lista.push({
        ...o,
        plano: dados.plano && dados.plano.codigo,
        plano_nome: dados.plano && dados.plano.nome,
        ciclo: dados.assinatura.ciclo,
        pago_ate: dados.assinatura.pago_ate,
        pedido: dados.assinatura.pedido,
        situacao: dados.situacao.codigo,
        isenta: dados.isenta,
        uso: { ...uso, cofre_gb: Number((uso.cofre_gb / limites.BYTES_POR_GB).toFixed(3)) },
        limites: (dados.plano && dados.plano.limites) || {},
      });
    }
    res.json({ organizacoes: lista, planos: await limites.listarPlanos() });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível listar as organizações.', erro);
  }
});

// GET /api/admin/organizacoes/:id/eventos — o livro da assinatura.
rotas.get('/organizacoes/:id/eventos', async (req, res) => {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'Organização inválida.' });
  try {
    const [eventos] = await pool.query(
      `SELECT e.id, e.tipo, e.provedor, e.dados, e.criado_em, u.nome AS usuario
         FROM assinatura_eventos e LEFT JOIN usuarios u ON u.id = e.usuario_id
        WHERE e.organizacao_id = ? ORDER BY e.id DESC LIMIT 50`,
      [id]
    );
    res.json(eventos);
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar o histórico.', erro);
  }
});

// POST /api/admin/organizacoes/:id/acao — { acao: ativar|suspender|reativar|estender_teste, ... }
rotas.post('/organizacoes/:id/acao', async (req, res) => {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'Organização inválida.' });
  if (escopo.ehOperadora(id)) return res.status(400).json({ erro: 'A organização operadora não tem cobrança.' });
  const corpo = req.body || {};
  const usuarioId = req.usuario.id;
  try {
    let r;
    if (corpo.acao === 'ativar') {
      r = await cobranca.ativar({ organizacaoId: id, planoCodigo: corpo.plano, ciclo: corpo.ciclo || 'mensal', usuarioId });
    } else if (corpo.acao === 'suspender') {
      r = await cobranca.suspender({ organizacaoId: id, motivo: corpo.motivo ? String(corpo.motivo).slice(0, 255) : null, usuarioId });
    } else if (corpo.acao === 'reativar') {
      r = await cobranca.reativar({ organizacaoId: id, usuarioId });
    } else if (corpo.acao === 'estender_teste') {
      r = await cobranca.estenderTeste({ organizacaoId: id, dias: corpo.dias, usuarioId });
    } else {
      return res.status(400).json({ erro: 'Ação desconhecida.' });
    }
    res.json({ ok: true, ...r });
  } catch (erro) {
    if (erro.status === 400 || erro.status === 404) return res.status(erro.status).json({ erro: erro.message });
    responderErro(res, 500, 'Não foi possível concluir a ação.', erro);
  }
});

// ------------------------------------------------------- suporte (Seção 17)
// GET /api/admin/solicitacoes?status=aberta|em_andamento|respondida|encerrada
rotas.get('/solicitacoes', async (req, res) => {
  const status = req.query.status;
  if (status && !regrasSuporte.STATUS[status]) return res.status(400).json({ erro: 'Status inválido.' });
  try {
    const [linhas] = await pool.query(
      `SELECT s.id, s.organizacao_id, o.nome AS organizacao, s.assunto, s.categoria, s.status, s.criada_em, s.atualizada_em, u.nome AS aberta_por
         FROM solicitacoes s
         JOIN organizacoes o ON o.id = s.organizacao_id
         LEFT JOIN usuarios u ON u.id = s.usuario_id
        ${status ? 'WHERE s.status = ?' : ''}
        ORDER BY FIELD(s.status, 'aberta', 'em_andamento', 'respondida', 'encerrada'), s.atualizada_em DESC LIMIT 200`,
      status ? [status] : []
    );
    res.json({
      solicitacoes: linhas.map(regrasSuporte.comProtocolo),
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível listar as solicitações.', erro);
  }
});

// GET /api/admin/solicitacoes/:id
rotas.get('/solicitacoes/:id', async (req, res) => {
  try {
    const [[s]] = await pool.query(
      `SELECT s.id, s.organizacao_id, o.nome AS organizacao, s.assunto, s.categoria, s.status, s.criada_em, s.atualizada_em,
              u.nome AS aberta_por, u.email AS aberta_por_email
         FROM solicitacoes s JOIN organizacoes o ON o.id = s.organizacao_id LEFT JOIN usuarios u ON u.id = s.usuario_id
        WHERE s.id = ?`,
      [Number(req.params.id) || 0]
    );
    if (!s) return res.status(404).json({ erro: 'Solicitação não encontrada.' });
    const [mensagens] = await pool.query(
      `SELECT m.id, m.autor, m.texto, m.criada_em, u.nome FROM solicitacao_mensagens m
         LEFT JOIN usuarios u ON u.id = m.usuario_id WHERE m.solicitacao_id = ? ORDER BY m.id`,
      [s.id]
    );
    res.json({ ...regrasSuporte.comProtocolo(s), mensagens });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar a solicitação.', erro);
  }
});

// POST /api/admin/solicitacoes/:id/responder — { texto, status? }
rotas.post('/solicitacoes/:id/responder', async (req, res) => {
  const v = regrasSuporte.validarMensagem(req.body);
  if (v.erro) return res.status(400).json({ erro: v.erro });
  const pedido = req.body && req.body.status;
  if (pedido && !regrasSuporte.STATUS[pedido]) return res.status(400).json({ erro: 'Status inválido.' });
  try {
    const [[s]] = await pool.query(
      `SELECT s.id, s.assunto, s.status, s.criada_em, u.email, u.nome FROM solicitacoes s
         LEFT JOIN usuarios u ON u.id = s.usuario_id WHERE s.id = ?`,
      [Number(req.params.id) || 0]
    );
    if (!s) return res.status(404).json({ erro: 'Solicitação não encontrada.' });
    await pool.query("INSERT INTO solicitacao_mensagens (solicitacao_id, autor, usuario_id, texto) VALUES (?, 'suporte', ?, ?)", [
      s.id, req.usuario.id, v.dados.texto,
    ]);
    const novo = regrasSuporte.statusAposMensagem(s.status, 'suporte', pedido);
    await pool.query('UPDATE solicitacoes SET status = ?, atualizada_em = NOW() WHERE id = ?', [novo, s.id]);

    // Avisa quem abriu. Sem SMTP ou com erro, a resposta continua visível no painel.
    let avisoEmail = 'sem_destinatario';
    if (s.email) {
      const protocolo = regrasSuporte.protocolo(s.id, s.criada_em);
      const r = await email.enviarTransacional({
        para: s.email,
        assunto: `[Painel de Licitações] Resposta à solicitação ${protocolo}`,
        texto: `Olá, ${s.nome}.\n\n${v.dados.texto}\n\n— Solicitação ${protocolo}: ${s.assunto}\nResponda pelo painel, em Ajuda › Solicitações.`,
      }).catch((erro) => ({ enviado: false, motivo: erro.message }));
      avisoEmail = r.enviado ? 'enviado' : 'nao_enviado';
    }
    res.json({ ok: true, status: novo, email: avisoEmail });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível responder agora.', erro);
  }
});

// GET /api/admin/nps — a nota média de todas as organizações e os últimos comentários.
rotas.get('/nps', async (_req, res) => {
  try {
    const [notas] = await pool.query('SELECT nota FROM nps_respostas WHERE nota IS NOT NULL');
    const [comentarios] = await pool.query(
      `SELECT n.nota, n.comentario, n.criada_em, o.nome AS organizacao FROM nps_respostas n
         JOIN organizacoes o ON o.id = n.organizacao_id
        WHERE n.nota IS NOT NULL AND n.comentario IS NOT NULL ORDER BY n.id DESC LIMIT 30`
    );
    res.json({ ...regrasNps.resumirNps(notas.map((n) => n.nota)), comentarios });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar o NPS.', erro);
  }
});

module.exports = rotas;
