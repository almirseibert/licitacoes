// /api/notificacoes — avisos por tipo e por canal (Seção 9 do PLANO_SAAS_CONLICITACAO.md).
//
//   GET    /api/notificacoes                 matriz da pessoa e da organização, destinos, o que está ligado
//   PUT    /api/notificacoes/preferencias    { escopo: 'eu'|'organizacao', preferencias: [{canal, tipo, ativo}] }
//   PATCH  /api/notificacoes/destinos        { email, whatsapp } — os da própria pessoa
//   POST   /api/notificacoes/push            inscrição do navegador (PushSubscription.toJSON())
//   DELETE /api/notificacoes/push            { endpoint }
//   POST   /api/notificacoes/teste           { canal } — manda um aviso de teste para si
//
// Fica fora do `leitorSoLe`: quem só lê a organização ainda escolhe como quer
// ser avisado. A matriz da organização (a caixa `alerta_*`) é só de admin.
const express = require('express');
const { responderErro } = require('../middlewares/responder-erro');
const pool = require('../config/db');
const regras = require('../regras/notificacoes');
const notificar = require('../servicos/notificar');
const push = require('../servicos/push');
const { push: cfgPush } = require('../config/ambiente');

const rotas = express.Router();
const MOTIVOS_DA_TELA = new Set([
  'sem destino cadastrado',
  'nenhum navegador inscrito',
  'smtp não configurado',
  'whatsapp não configurado',
  'push não configurado',
  'sem cadastro nesta organização',
]);
const quem = (req) => req.usuario.id;
const ehAdmin = (req) => ['dono', 'admin'].includes(req.papel);

async function prefsDe(organizacaoId, usuarioId) {
  const [linhas] = await pool.query(
    `SELECT canal, tipo, ativo FROM notificacoes_config
      WHERE organizacao_id = ? AND usuario_chave = ?`,
    [organizacaoId, usuarioId || 0]
  );
  return regras.prefsDeLinhas(linhas);
}

rotas.get('/', async (req, res) => {
  try {
    const org = req.organizacaoId;
    const [[destino]] = await pool.query(
      `SELECT u.email AS email_login, d.email, d.whatsapp
         FROM usuarios u
         LEFT JOIN notificacoes_destinos d ON d.usuario_id = u.id AND d.organizacao_id = ?
        WHERE u.id = ?`,
      [org, quem(req)]
    );
    const [[{ navegadores }]] = await pool.query(
      'SELECT COUNT(*) AS navegadores FROM notificacoes_push WHERE organizacao_id = ? AND usuario_id = ?',
      [org, quem(req)]
    );
    const [minhas, daOrganizacao, canais] = await Promise.all([
      prefsDe(org, quem(req)),
      prefsDe(org, null),
      notificar.canais(org),
    ]);
    res.json({
      tipos: regras.TIPOS,
      canais: regras.CANAIS,
      minhas: regras.matriz(minhas),
      destinos: {
        email: (destino && destino.email) || null,
        email_login: destino ? destino.email_login : null,
        whatsapp: (destino && destino.whatsapp) || null,
        navegadores,
      },
      organizacao: { matriz: regras.matriz(daOrganizacao), editavel: ehAdmin(req), canais },
      // O que o servidor tem: sem SMTP, por exemplo, ligar "e-mail" não faz chegar nada.
      servico: notificar.servico(),
      push_chave_publica: cfgPush.chavePublica || null,
    });
  } catch (e) {
    responderErro(res, 500, 'Não foi possível carregar as preferências de aviso.', e);
  }
});

rotas.put('/preferencias', async (req, res) => {
  const corpo = req.body || {};
  const escopo = corpo.escopo || 'eu';
  if (!['eu', 'organizacao'].includes(escopo)) return res.status(400).json({ erro: 'Escopo deve ser "eu" ou "organizacao".' });
  if (escopo === 'organizacao' && !ehAdmin(req)) {
    return res.status(403).json({ erro: 'Só um administrador muda os avisos da caixa da organização.' });
  }
  const { itens, erro } = regras.lerPreferencias(corpo.preferencias);
  if (erro) return res.status(400).json({ erro });
  try {
    const usuarioId = escopo === 'eu' ? quem(req) : null;
    for (const p of itens) {
      await pool.query(
        `INSERT INTO notificacoes_config (organizacao_id, usuario_id, canal, tipo, ativo) VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE ativo = VALUES(ativo)`,
        [req.organizacaoId, usuarioId, p.canal, p.tipo, p.ativo ? 1 : 0]
      );
    }
    res.json({ ok: true, matriz: regras.matriz(await prefsDe(req.organizacaoId, usuarioId)) });
  } catch (e) {
    responderErro(res, 500, 'Não foi possível salvar as preferências de aviso.', e);
  }
});

rotas.patch('/destinos', async (req, res) => {
  const { campos, erro } = regras.lerDestinos(req.body || {});
  if (erro) return res.status(400).json({ erro });
  try {
    const colunas = Object.keys(campos);
    await pool.query(
      `INSERT INTO notificacoes_destinos (organizacao_id, usuario_id, ${colunas.join(', ')})
       VALUES (?, ?, ${colunas.map(() => '?').join(', ')})
       ON DUPLICATE KEY UPDATE ${colunas.map((c) => `${c} = VALUES(${c})`).join(', ')}`,
      [req.organizacaoId, quem(req), ...colunas.map((c) => campos[c])]
    );
    res.json({ ok: true, ...campos });
  } catch (e) {
    responderErro(res, 500, 'Não foi possível salvar para onde vão os seus avisos.', e);
  }
});

rotas.post('/push', async (req, res) => {
  if (!push.servicoLigado()) {
    // Faltam VAPID_* no ambiente: a tela já esconde o botão; isto é para quem chamar a API direto.
    return res.status(503).json({ erro: 'O aviso no navegador não está ligado neste servidor.' });
  }
  const { inscricao, erro } = push.lerInscricao(req.body || {});
  if (erro) return res.status(400).json({ erro });
  try {
    await pool.query(
      `INSERT INTO notificacoes_push (organizacao_id, usuario_id, endpoint, endpoint_hash, p256dh, auth, navegador)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE usuario_id = VALUES(usuario_id), p256dh = VALUES(p256dh), auth = VALUES(auth)`,
      [
        req.organizacaoId,
        quem(req),
        inscricao.endpoint,
        push.hashDo(inscricao.endpoint),
        inscricao.p256dh,
        inscricao.auth,
        String(req.get('user-agent') || '').slice(0, 160),
      ]
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    responderErro(res, 500, 'Não foi possível ligar o aviso neste navegador.', e);
  }
});

rotas.delete('/push', async (req, res) => {
  const endpoint = String((req.body && req.body.endpoint) || '');
  if (!endpoint) return res.status(400).json({ erro: 'Diga qual navegador desligar.' });
  try {
    const [r] = await pool.query(
      'DELETE FROM notificacoes_push WHERE organizacao_id = ? AND usuario_id = ? AND endpoint_hash = ?',
      [req.organizacaoId, quem(req), push.hashDo(endpoint)]
    );
    res.json({ ok: true, removidas: r.affectedRows });
  } catch (e) {
    responderErro(res, 500, 'Não foi possível desligar o aviso neste navegador.', e);
  }
});

rotas.post('/teste', async (req, res) => {
  const canal = req.body && req.body.canal;
  if (!regras.CANAIS.some((c) => c.chave === canal)) return res.status(400).json({ erro: 'Canal desconhecido.' });
  try {
    const r = await notificar.enviarTeste(req.organizacaoId, quem(req), canal);
    if (!r.enviado) {
      // Motivo nosso ("sem destino cadastrado") vai para a tela; erro do SMTP ou da Meta, só para o log.
      const nosso = MOTIVOS_DA_TELA.has(r.motivo);
      if (!nosso) console.error(`Teste de aviso por ${canal} falhou:`, r.motivo);
      return res.status(422).json({
        erro: nosso ? `O teste não saiu: ${r.motivo}.` : 'O teste não saiu: o serviço do canal recusou o envio. Veja o log do servidor.',
      });
    }
    res.json({ ok: true, mensagem: 'Teste enviado. Confira se chegou.' });
  } catch (e) {
    responderErro(res, 500, 'Não foi possível mandar o teste.', e);
  }
});

module.exports = rotas;
