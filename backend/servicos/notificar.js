// Um só lugar de onde o aviso sai do painel para fora (seção 14; Seção 9 do
// PLANO_SAAS_CONLICITACAO.md — por tipo e por canal).
//
// O alerta já está gravado em `alertas` quando isto roda: o despacho pega os
// que ainda não passaram por aqui (`notificado_em IS NULL`), decide quem quer
// recebê-los por qual canal (regras/notificacoes.js) e manda um envio por
// destino. Canal desligado ou fora do ar não derruba o job nem apaga o aviso —
// o sino do painel continua sendo a fonte da verdade.
const pool = require('../config/db');
const email = require('./email');
const whatsapp = require('./whatsapp');
const push = require('./push');
const regras = require('../regras/notificacoes');

const ENVIAR = { email: email.enviarAvisos, whatsapp: whatsapp.enviarAvisos, push: push.enviarAvisos };

/**
 * Quem pode receber aviso desta organização: cada membro ativo (com o e-mail
 * de login como padrão) e a caixa da organização (org_configuracoes `alerta_*`).
 */
async function destinatarios(organizacaoId) {
  const [membros] = await pool.query(
    `SELECT u.id AS usuario_id, COALESCE(d.email, u.email) AS email, d.whatsapp
       FROM organizacao_membros m
       JOIN usuarios u ON u.id = m.usuario_id AND u.ativo = 1
       LEFT JOIN notificacoes_destinos d ON d.organizacao_id = m.organizacao_id AND d.usuario_id = m.usuario_id
      WHERE m.organizacao_id = ?`,
    [organizacaoId]
  );
  const [prefs] = await pool.query(
    'SELECT usuario_id, canal, tipo, ativo FROM notificacoes_config WHERE organizacao_id = ?',
    [organizacaoId]
  );
  const [inscricoes] = await pool.query(
    'SELECT id, usuario_id, endpoint, p256dh, auth FROM notificacoes_push WHERE organizacao_id = ?',
    [organizacaoId]
  );

  const prefsDe = (usuarioId) => regras.prefsDeLinhas(prefs.filter((p) => (p.usuario_id || null) === usuarioId));
  const lista = membros.map((m) => ({
    ...m,
    prefs: prefsDe(m.usuario_id),
    push: inscricoes.filter((i) => i.usuario_id === m.usuario_id),
  }));

  // A caixa da organização: sem push (push é de navegador, e navegador é de alguém).
  const [caixaEmail, caixaWhats] = await Promise.all([email.destinatario(organizacaoId), whatsapp.destinatario(organizacaoId)]);
  if (caixaEmail || caixaWhats) {
    lista.push({ usuario_id: null, email: caixaEmail || null, whatsapp: caixaWhats || null, push: [], prefs: prefsDe(null) });
  }
  return lista;
}

/**
 * Uma rodada do despacho.
 * @returns {{alertas:number, envios:number, enviados:number, porCanal:object}}
 */
async function despachar({ limite = 500 } = {}) {
  // Reserva e marca na mesma transação: dois workers no ar não pegam o mesmo
  // alerta (SKIP LOCKED), e marcar antes de mandar faz uma falha de SMTP não
  // virar repetição a cada 30 min.
  const conexao = await pool.getConnection();
  let meus;
  try {
    await conexao.beginTransaction();
    [meus] = await conexao.query(
      `SELECT id, organizacao_id, usuario_id, autor_id, tipo, mensagem, quando
         FROM alertas WHERE notificado_em IS NULL ORDER BY id LIMIT ? FOR UPDATE SKIP LOCKED`,
      [limite]
    );
    if (meus.length) {
      await conexao.query('UPDATE alertas SET notificado_em = NOW() WHERE id IN (?)', [meus.map((a) => a.id)]);
    }
    await conexao.commit();
  } catch (erro) {
    await conexao.rollback();
    throw erro;
  } finally {
    conexao.release();
  }
  const resumo = { alertas: meus.length, envios: 0, enviados: 0, porCanal: {} };
  if (!meus.length) return resumo;

  const porOrganizacao = new Map();
  for (const a of meus) {
    // "Fim das propostas" no texto só faz sentido no aviso de prazo.
    const alerta = regras.tipoDoAlerta(a.tipo) === 'prazo' ? a : { ...a, quando: null };
    if (!porOrganizacao.has(a.organizacao_id)) porOrganizacao.set(a.organizacao_id, []);
    porOrganizacao.get(a.organizacao_id).push(alerta);
  }

  for (const [organizacaoId, lista] of porOrganizacao) {
    const envios = regras.planejarEnvios(lista, await destinatarios(organizacaoId));
    for (const envio of envios) {
      resumo.envios += 1;
      const r = await ENVIAR[envio.canal](envio.destino, envio.avisos);
      const canal = (resumo.porCanal[envio.canal] = resumo.porCanal[envio.canal] || { enviados: 0, falhas: 0 });
      if (r.enviado) {
        resumo.enviados += 1;
        canal.enviados += 1;
      } else {
        canal.falhas += 1;
      }
    }
  }
  return resumo;
}

/** O que está de fato ligado nesta organização (a tela de Configurações mostra). */
async function canais(organizacaoId) {
  return {
    email: await email.configurado(organizacaoId),
    whatsapp: await whatsapp.configurado(organizacaoId),
    push: push.servicoLigado(),
  };
}

/** O que o servidor tem (independe de destino): sem SMTP, nenhum e-mail sai. */
function servico() {
  return { email: email.servicoLigado(), whatsapp: whatsapp.servicoLigado(), push: push.servicoLigado() };
}

/** Aviso de teste para a própria pessoa, num canal, agora — sem passar pelo sino. */
async function enviarTeste(organizacaoId, usuarioId, canal) {
  const lista = await destinatarios(organizacaoId);
  const eu = lista.find((d) => d.usuario_id === usuarioId);
  const aviso = [{ id: 0, mensagem: 'Teste do Painel de Licitações: se você leu isto, este canal está chegando.' }];
  if (!eu) return { enviado: false, motivo: 'sem cadastro nesta organização' };
  if (canal === 'push') {
    if (!eu.push.length) return { enviado: false, motivo: 'nenhum navegador inscrito' };
    const rs = await Promise.all(eu.push.map((i) => push.enviarAvisos(i, aviso)));
    return rs.find((r) => r.enviado) || rs[0];
  }
  if (!eu[canal]) return { enviado: false, motivo: 'sem destino cadastrado' };
  return ENVIAR[canal](eu[canal], aviso);
}

module.exports = { despachar, destinatarios, canais, servico, enviarTeste };
