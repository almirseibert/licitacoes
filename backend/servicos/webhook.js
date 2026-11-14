// Entrega de webhook (Seção 14 do PLANO_SAAS_CONLICITACAO.md): um POST assinado
// para a URL que o CLIENTE cadastrou. É a única saída do painel para um endereço
// que não é de portal público, então tem as defesas de quem chama endereço de
// terceiro: só https, nenhum IP da nossa rede (o nome é resolvido AQUI e cada
// endereço conferido na hora de conectar, o que fecha o truque de um nome que
// responde público no cadastro e interno na entrega), nenhum redirecionamento,
// 10 s de limite e corpo da resposta descartado.
const https = require('https');
const http = require('http');
const dns = require('dns');
const crypto = require('crypto');
const { http: cfgHttp, webhookPermitirLocal } = require('../config/ambiente');
const regras = require('../regras/api');

const TIMEOUT_MS = 10000;
const MAX_RESPOSTA = 64 * 1024;

function lookupSeguro(permitirLocal) {
  return (hostname, opcoes, retorno) => {
    dns.lookup(hostname, { ...opcoes, all: true }, (erro, enderecos) => {
      if (erro) return retorno(erro);
      const liberados = enderecos.filter((e) => permitirLocal || !regras.ipPrivado(e.address));
      if (!liberados.length) return retorno(new Error('destino em rede interna'));
      if (opcoes && opcoes.all) return retorno(null, liberados);
      return retorno(null, liberados[0].address, liberados[0].family);
    });
  };
}

/**
 * Um POST. Nunca lança: o resultado diz se a entrega valeu.
 * @returns {Promise<{ ok: boolean, status: number|null, detalhe: string }>}
 */
function postar({ url, corpo, cabecalhos = {}, permitirLocal = webhookPermitirLocal, timeoutMs = TIMEOUT_MS }) {
  return new Promise((resolver) => {
    let alvo;
    try {
      // Revalida na hora de entregar: a regra pode ter mudado depois do cadastro.
      alvo = new URL(regras.validarUrlWebhook(url, { permitirHttp: permitirLocal }));
    } catch (erro) {
      return resolver({ ok: false, status: null, detalhe: erro.message.slice(0, 255) });
    }
    const modulo = alvo.protocol === 'http:' ? http : https;
    let encerrado = false;
    const estado = { prazo: null };
    const terminar = (r) => {
      if (encerrado) return;
      encerrado = true;
      clearTimeout(estado.prazo);
      resolver(r);
    };
    const req = modulo.request(
      alvo,
      {
        method: 'POST',
        lookup: lookupSeguro(permitirLocal),
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': Buffer.byteLength(corpo),
          'User-Agent': cfgHttp.userAgent,
          ...cabecalhos,
        },
      },
      (resposta) => {
        let lidos = 0;
        resposta.on('data', (pedaco) => {
          lidos += pedaco.length;
          if (lidos > MAX_RESPOSTA) resposta.destroy();
        });
        const fim = () => {
          const status = resposta.statusCode;
          const ok = status >= 200 && status < 300;
          terminar({ ok, status, detalhe: ok ? 'entregue' : `o destino respondeu HTTP ${status}` });
        };
        resposta.on('end', fim);
        resposta.on('close', fim);
        resposta.on('error', fim);
      }
    );
    // Prazo TOTAL: o `timeout` do socket é de inatividade e uma resposta
    // pingando um byte por vez o driblaria.
    estado.prazo = setTimeout(() => {
      terminar({ ok: false, status: null, detalhe: `sem resposta completa em ${Math.round(timeoutMs / 1000)} s` });
      req.destroy();
    }, timeoutMs);
    req.on('timeout', () => {
      terminar({ ok: false, status: null, detalhe: `sem resposta em ${Math.round(timeoutMs / 1000)} s` });
      req.destroy();
    });
    req.on('error', (erro) => terminar({ ok: false, status: null, detalhe: `falha de conexão: ${String(erro.message).slice(0, 200)}` }));
    req.end(corpo);
    return undefined;
  });
}

/** Assina e envia o payload de um webhook. `segredo` já derivado (regras.segredoDoWebhook). */
async function entregar({ webhook, segredo, payload, evento = 'oportunidades.novas', permitirLocal }) {
  const corpo = JSON.stringify(payload);
  return postar({
    url: webhook.url,
    corpo,
    permitirLocal,
    cabecalhos: {
      'X-Painel-Evento': evento,
      'X-Painel-Entrega': payload.entrega_id,
      'X-Painel-Assinatura': regras.cabecalhoAssinatura(segredo, corpo),
    },
  });
}

function novaEntregaId() {
  return crypto.randomUUID();
}

module.exports = { postar, entregar, novaEntregaId, TIMEOUT_MS };
