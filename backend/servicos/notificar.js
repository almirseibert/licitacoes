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
  // Cinco leituras independentes: em paralelo.
  const [[membros], [prefs], [inscricoes], caixaEmail, caixaWhats] = await Promise.all([
    pool.query(
    `SELECT u.id AS usuario_id, COALESCE(d.email, u.email) AS email, d.whatsapp
       FROM organizacao_membros m
       JOIN usuarios u ON u.id = m.usuario_id AND u.ativo = 1
       LEFT JOIN notificacoes_destinos d ON d.organizacao_id = m.organizacao_id AND d.usuario_id = m.usuario_id
      WHERE m.organizacao_id = ?`,
    [organizacaoId]
    ),
    pool.query('SELECT usuario_id, canal, tipo, ativo FROM notificacoes_config WHERE organizacao_id = ?', [organizacaoId]),
    pool.query('SELECT id, usuario_id, endpoint, p256dh, auth FROM notificacoes_push WHERE organizacao_id = ?', [
      organizacaoId,
    ]),
    email.destinatario(organizacaoId),
    whatsapp.destinatario(organizacaoId),
  ]);

  // Agrupa uma vez por pessoa (0 = caixa da organização), em vez de filtrar por membro.
  const agrupar = (linhas) => {
    const mapa = new Map();
    for (const l of linhas) {
      const chave = l.usuario_id || 0;
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave).push(l);
    }
    return mapa;
  };
  const prefsPorPessoa = agrupar(prefs);
  const pushPorPessoa = agrupar(inscricoes);
  const prefsDe = (usuarioId) => regras.prefsDeLinhas(prefsPorPessoa.get(usuarioId || 0) || []);
  const lista = membros.map((m) => ({ ...m, prefs: prefsDe(m.usuario_id), push: pushPorPessoa.get(m.usuario_id) || [] }));

  // A caixa da organização: sem push (push é de navegador, e navegador é de alguém).
  if (caixaEmail || caixaWhats) {
    lista.push({ usuario_id: null, email: caixaEmail || null, whatsapp: caixaWhats || null, push: [], prefs: prefsDe(null) });
  }
  return lista;
}

/**
 * Uma rodada do despacho.
 * @returns {{alertas:number, envios:number, enviados:number, porCanal:object}}
 *          `envios` e `enviados` são somas de `porCanal`.
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
    if (!porOrganizacao.has(a.organizacao_id)) porOrganizacao.set(a.organizacao_id, []);
    porOrganizacao.get(a.organizacao_id).push(a);
  }

  for (const [organizacaoId, lista] of porOrganizacao) {
    const envios = regras.planejarEnvios(lista, await destinatarios(organizacaoId));
    for (const envio of envios) {
      const r = await ENVIAR[envio.canal](envio.destino, envio.avisos);
      const canal = (resumo.porCanal[envio.canal] = resumo.porCanal[envio.canal] || { enviados: 0, falhas: 0 });
      canal[r.enviado ? 'enviados' : 'falhas'] += 1;
    }
  }
  for (const c of Object.values(resumo.porCanal)) {
    resumo.enviados += c.enviados;
    resumo.envios += c.enviados + c.falhas;
  }
  return resumo;
}

/** O que está de fato ligado nesta organização (a tela de Configurações mostra). */
async function canais(organizacaoId) {
  const [porEmail, porWhatsapp] = await Promise.all([email.configurado(organizacaoId), whatsapp.configurado(organizacaoId)]);
  return { email: porEmail, whatsapp: porWhatsapp };
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

/**
 * A rodada inteira (worker a cada 30 min e `npm run notificar`): cria os avisos
 * de tarefa atrasada e despacha. Cada passo com seu try: falha de um não segura
 * o outro.
 */
async function rodadaDeAvisos() {
  const resumo = { tarefas: null, despacho: null, erros: [] };
  try {
    resumo.tarefas = await require('../jobs/prazos').avisarTarefasAtrasadas({});
  } catch (erro) {
    resumo.erros.push(`tarefas atrasadas: ${erro.message}`);
  }
  try {
    resumo.despacho = await despachar({});
  } catch (erro) {
    resumo.erros.push(`despacho: ${erro.message}`);
  }
  return resumo;
}

/** Uma linha de log da rodada. */
function descrever({ tarefas, despacho }) {
  const partes = [];
  if (tarefas) partes.push(`${tarefas.criados} aviso(s) de tarefa atrasada`);
  if (despacho) {
    const canais = Object.entries(despacho.porCanal)
      .map(([c, n]) => `${c} ${n.enviados} ok/${n.falhas} falha(s)`)
      .join(', ');
    partes.push(
      `${despacho.alertas} alerta(s) em ${despacho.envios} envio(s), ${despacho.enviados} entregues${canais ? ` (${canais})` : ''}`
    );
  }
  return `Avisos: ${partes.join('; ')}.`;
}

module.exports = { despachar, destinatarios, canais, servico, enviarTeste, rodadaDeAvisos, descrever };
