// Cliente HTTP único para todos os adaptadores. Implementa as regras de boa
// conduta da seção 5.4 e os cuidados do PNCP (5.1):
//   · User-Agent fixo e honesto
//   · no máximo HTTP_CONCORRENCIA requisições simultâneas
//   · intervalo mínimo de 1,5 s por domínio
//   · AbortController com timeout de 30 s em TODA requisição
//   · 3 tentativas com espera progressiva (2 s, 8 s, 30 s) em 5xx/429/timeout
//   · respeita Retry-After
const { http: cfg } = require('../config/ambiente');

const ESPERAS_MS = [2000, 8000, 30000];
const ultimoAcesso = new Map(); // dominio -> timestamp
let emVoo = 0;
const aguardando = [];

function dormir(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function obterVaga() {
  if (emVoo < cfg.concorrencia) {
    emVoo += 1;
    return;
  }
  await new Promise((resolver) => aguardando.push(resolver));
  emVoo += 1;
}

function liberarVaga() {
  emVoo -= 1;
  const proximo = aguardando.shift();
  if (proximo) proximo();
}

async function respeitarIntervalo(dominio) {
  const anterior = ultimoAcesso.get(dominio) || 0;
  const espera = cfg.intervaloDominioMs - (Date.now() - anterior);
  if (espera > 0) await dormir(espera);
  ultimoAcesso.set(dominio, Date.now());
}

class ErroHttp extends Error {
  constructor(mensagem, status, corpo) {
    super(mensagem);
    this.status = status;
    this.corpo = corpo;
  }
}

/**
 * Busca com retentativa. Devolve a Response (corpo ainda não lido).
 * @param {string} url
 * @param {{ metodo?: string, cabecalhos?: object, corpo?: any, timeoutMs?: number, tentativas?: number, aceitar?: string }} opcoes
 */
async function buscar(url, opcoes = {}) {
  const {
    metodo = 'GET',
    cabecalhos = {},
    corpo,
    timeoutMs = cfg.timeoutMs,
    tentativas = 3,
    aceitar = 'application/json, text/plain, */*',
  } = opcoes;

  const dominio = new URL(url).host;
  let ultimoErro;
  let esperaAntes = 0;

  for (let tentativa = 0; tentativa < tentativas; tentativa += 1) {
    if (esperaAntes) {
      await dormir(esperaAntes);
      esperaAntes = 0;
    }

    await obterVaga();
    const controlador = new AbortController();
    const corte = setTimeout(() => controlador.abort(), timeoutMs);
    try {
      await respeitarIntervalo(dominio);
      const resposta = await fetch(url, {
        method: metodo,
        headers: { 'User-Agent': cfg.userAgent, Accept: aceitar, ...cabecalhos },
        body: corpo,
        signal: controlador.signal,
        redirect: 'follow',
      });

      // 429 e 5xx: retentativa com espera progressiva, respeitando Retry-After.
      if (resposta.status === 429 || resposta.status >= 500) {
        const retryAfter = Number(resposta.headers.get('retry-after'));
        const texto = await resposta.text().catch(() => '');
        ultimoErro = new ErroHttp(`HTTP ${resposta.status} em ${url}`, resposta.status, texto.slice(0, 300));
        if (tentativa < tentativas - 1) {
          esperaAntes = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : ESPERAS_MS[tentativa];
          continue;
        }
        throw ultimoErro;
      }

      if (!resposta.ok) {
        const texto = await resposta.text().catch(() => '');
        throw new ErroHttp(`HTTP ${resposta.status} em ${url}`, resposta.status, texto.slice(0, 300));
      }

      return resposta;
    } catch (erro) {
      const abortou = erro.name === 'AbortError';
      ultimoErro = abortou ? new ErroHttp(`Tempo esgotado (${timeoutMs} ms) em ${url}`, 408) : erro;
      const recuperavel = abortou || !(erro instanceof ErroHttp) || erro.status >= 500 || erro.status === 429;
      if (tentativa < tentativas - 1 && recuperavel) {
        esperaAntes = ESPERAS_MS[tentativa];
        continue;
      }
      throw ultimoErro;
    } finally {
      clearTimeout(corte);
      liberarVaga();
    }
  }

  throw ultimoErro;
}

async function buscarJson(url, opcoes = {}) {
  const resposta = await buscar(url, opcoes);
  const texto = await resposta.text();
  if (!texto.trim()) return null;
  try {
    return JSON.parse(texto);
  } catch {
    throw new ErroHttp(`Resposta não é JSON válido em ${url}`, resposta.status, texto.slice(0, 300));
  }
}

async function buscarTexto(url, opcoes = {}) {
  const resposta = await buscar(url, { aceitar: 'text/html,*/*', ...opcoes });
  return resposta.text();
}

module.exports = { buscar, buscarJson, buscarTexto, ErroHttp, dormir };
