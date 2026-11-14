// Push do navegador (Web Push + service worker, Seção 9). Opcional por pessoa.
//
// Mesma postura do e-mail e do WhatsApp: sem as chaves VAPID no ambiente fica
// DESLIGADO, sem erro na fila. A inscrição que o serviço de push diz que morreu
// (404/410: a pessoa limpou o navegador ou revogou a permissão) é apagada aqui,
// para não tentar de novo a cada rodada.
const crypto = require('crypto');
const pool = require('../config/db');
const { push: cfg, urlPublica } = require('../config/ambiente');

let configurado = false;

function servicoLigado() {
  return Boolean(cfg.chavePublica && cfg.chavePrivada && cfg.assunto);
}

function webPush() {
  const wp = require('web-push');
  if (!configurado) {
    wp.setVapidDetails(cfg.assunto, cfg.chavePublica, cfg.chavePrivada);
    configurado = true;
  }
  return wp;
}

const hashDo = (endpoint) => crypto.createHash('sha256').update(String(endpoint)).digest('hex');

// Os serviços de push dos navegadores. Qualquer outro host seria o servidor
// fazendo POST para onde um usuário mandou (SSRF): rede interna, metadados da nuvem.
const HOSTS_PUSH = [
  'fcm.googleapis.com', // Chrome, Edge (Chromium), Opera
  'push.services.mozilla.com', // Firefox
  'push.apple.com', // Safari
  'notify.windows.com', // Edge antigo
];
const hostDePush = (host) => HOSTS_PUSH.some((h) => host === h || host.endsWith(`.${h}`));

/** Só aceita endpoint https de serviço de push conhecido; o resto é lixo ou tentativa de SSRF. */
function lerInscricao(corpo = {}) {
  const endpoint = String(corpo.endpoint || '');
  const chaves = corpo.keys || {};
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    return { erro: 'Inscrição de push inválida.' };
  }
  if (url.protocol !== 'https:' || url.port || !hostDePush(url.hostname) || endpoint.length > 1000) {
    return { erro: 'Inscrição de push inválida.' };
  }
  const p256dh = String(chaves.p256dh || '');
  const auth = String(chaves.auth || '');
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(p256dh) || !/^[A-Za-z0-9_-]{8,100}$/.test(auth)) {
    return { erro: 'Inscrição de push sem as chaves do navegador.' };
  }
  return { inscricao: { endpoint, p256dh, auth } };
}

function montarCarga(avisos) {
  const titulo = avisos.length === 1 ? 'Painel de Licitações' : `Painel de Licitações — ${avisos.length} avisos`;
  const corpo = avisos
    .slice(0, 5)
    .map((a) => `• ${a.mensagem}`)
    .join('\n');
  return JSON.stringify({ titulo, corpo: corpo.slice(0, 1000), url: urlPublica || '/' });
}

/**
 * @param {{id:number, endpoint:string, p256dh:string, auth:string}} inscricao
 */
async function enviarAvisos(inscricao, avisos) {
  if (!avisos || !avisos.length) return { enviado: false, motivo: 'nada a enviar' };
  if (!servicoLigado()) return { enviado: false, motivo: 'push não configurado' };
  try {
    await webPush().sendNotification(
      { endpoint: inscricao.endpoint, keys: { p256dh: inscricao.p256dh, auth: inscricao.auth } },
      montarCarga(avisos),
      { TTL: 24 * 3600 }
    );
    return { enviado: true };
  } catch (erro) {
    if (erro.statusCode === 404 || erro.statusCode === 410) {
      await pool.query('DELETE FROM notificacoes_push WHERE id = ?', [inscricao.id]);
      return { enviado: false, motivo: 'inscrição expirada (apagada)' };
    }
    console.error('Não foi possível enviar o push:', erro.message);
    return { enviado: false, motivo: erro.message };
  }
}

module.exports = { servicoLigado, lerInscricao, hashDo, montarCarga, enviarAvisos };
