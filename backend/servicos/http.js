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

// Quem chega só pega vaga se não houver ninguém na fila. Deixar o recém-chegado
// passar na frente parecia inofensivo e não era: entre o `liberarVaga` e o
// instante em que o da fila acordava, os dois contavam como um só e o total em
// voo passava de HTTP_CONCORRENCIA. A vaga agora é entregue direto ao próximo,
// sem voltar ao balcão — `emVoo` é o número de vagas concedidas e não passa do
// teto da seção 5.4.
async function obterVaga() {
  if (emVoo < cfg.concorrencia && aguardando.length === 0) {
    emVoo += 1;
    return;
  }
  await new Promise((resolver) => aguardando.push(resolver));
}

function liberarVaga() {
  const proximo = aguardando.shift();
  if (proximo) {
    proximo(); // a vaga troca de mão: `emVoo` continua igual
    return;
  }
  emVoo -= 1;
}

// A janela de cada domínio é RESERVADA antes de dormir. Gravar `ultimoAcesso`
// só depois do sono deixava duas chamadas concorrentes lerem o mesmo instante
// anterior, dormirem o mesmo tanto e baterem no portal juntas — com quatro
// requisições simultâneas quase todas no mesmo domínio, o intervalo de 1,5 s da
// seção 5.4 virava decoração. Reservando antes, quatro chamadas ao mesmo
// domínio saem em 0 s, 1,5 s, 3 s e 4,5 s, em fila.
async function respeitarIntervalo(dominio) {
  const agora = Date.now();
  const anterior = ultimoAcesso.get(dominio) || 0;
  const quando = Math.max(agora, anterior + cfg.intervaloDominioMs);
  ultimoAcesso.set(dominio, quando);
  if (quando > agora) await dormir(quando - agora);
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
 * @param {{ metodo?: string, cabecalhos?: object, corpo?: any, timeoutMs?: number,
 *            tentativas?: number, aceitar?: string, repetirEm?: number[] }} opcoes
 *   `repetirEm` acrescenta status que, naquela chamada, são sabidamente
 *   intermitentes do lado do portal — ver o 422 do PNCP em adaptadores/pncp.js.
 */
async function buscar(url, opcoes = {}) {
  const {
    metodo = 'GET',
    cabecalhos = {},
    corpo,
    timeoutMs = cfg.timeoutMs,
    tentativas = 3,
    aceitar = 'application/json, text/plain, */*',
    repetirEm = [],
  } = opcoes;

  const vaiRepetir = (status) => status === 429 || status >= 500 || repetirEm.includes(status);

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
      if (vaiRepetir(resposta.status)) {
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
      const recuperavel = abortou || !(erro instanceof ErroHttp) || vaiRepetir(erro.status);
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

// `internos` existe para os testes: o semáforo e o intervalo por domínio são
// invisíveis de fora e foram justamente onde moraram dois defeitos.
module.exports = {
  buscar,
  buscarJson,
  buscarTexto,
  ErroHttp,
  dormir,
  internos: { obterVaga, liberarVaga, respeitarIntervalo, emVoo: () => emVoo, ultimoAcesso },
};
