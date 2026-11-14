// Regras puras da API por token e do webhook (Seção 14 do PLANO_SAAS_CONLICITACAO.md).
// Sem banco e sem rede: é o que erra calado — formato e hash do token, lista de
// IPs, assinatura HMAC do webhook, URL de webhook que aponta para dentro da
// nossa rede (SSRF) e o limite por minuto. Testado em testes/api.test.js.
const crypto = require('crypto');
const net = require('net');

const PREFIXO_TOKEN = 'lic_';
const MAX_IPS = 20;
const MAX_ITENS_POR_ENTREGA = 50;
const TOLERANCIA_ASSINATURA_S = 300;

// --------------------------------------------------------------------- token

const FORMATO_TOKEN = /^lic_[A-Za-z0-9_-]{43}$/;

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/** Token novo: 256 bits aleatórios. O texto puro só existe aqui e na resposta da criação. */
function gerarToken() {
  const token = `${PREFIXO_TOKEN}${crypto.randomBytes(32).toString('base64url')}`;
  return { token, prefixo: token.slice(PREFIXO_TOKEN.length, PREFIXO_TOKEN.length + 8), hash: hashToken(token) };
}

/** O token do cabeçalho `Authorization: Bearer lic_…`, ou null se não tem o formato. */
function lerBearer(cabecalho) {
  const texto = String(cabecalho || '');
  if (!texto.startsWith('Bearer ')) return null;
  const token = texto.slice(7).trim();
  return FORMATO_TOKEN.test(token) ? token : null;
}

// ------------------------------------------------------------------------ IP

/** IP em forma única: sem espaço e com o IPv4 embutido em IPv6 (::ffff:1.2.3.4) reduzido a IPv4. */
function normalizarIp(ip) {
  let texto = String(ip || '').trim();
  const mapeado = texto.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapeado) texto = mapeado[1];
  return net.isIP(texto) ? texto.toLowerCase() : null;
}

function familia(ip) {
  return net.isIP(ip) === 6 ? 'ipv6' : 'ipv4';
}

/** Uma entrada da lista: "203.0.113.7" ou "203.0.113.0/24" (e o equivalente IPv6). */
function lerEntrada(entrada) {
  const texto = String(entrada || '').trim();
  const [endereco, prefixoTexto, ...sobra] = texto.split('/');
  if (sobra.length) return null;
  const ip = normalizarIp(endereco);
  if (!ip) return null;
  if (prefixoTexto === undefined) return { ip, texto: ip };
  if (!/^\d{1,3}$/.test(prefixoTexto)) return null;
  const prefixo = Number(prefixoTexto);
  if (prefixo > (familia(ip) === 'ipv6' ? 128 : 32)) return null;
  return { ip, prefixo, texto: `${ip}/${prefixo}` };
}

/** Valida a lista digitada na tela. Devolve a lista normalizada; lança `Error` em português. */
function validarIps(lista) {
  if (lista === undefined || lista === null || lista === '') return [];
  if (!Array.isArray(lista)) throw new Error('A lista de IPs liberados precisa ser uma lista.');
  if (lista.length > MAX_IPS) throw new Error(`No máximo ${MAX_IPS} IPs liberados por token.`);
  const saida = [];
  for (const bruto of lista) {
    const entrada = lerEntrada(bruto);
    if (!entrada) throw new Error(`"${String(bruto).slice(0, 60)}" não é um IP válido. Use 203.0.113.7 ou 203.0.113.0/24.`);
    if (!saida.includes(entrada.texto)) saida.push(entrada.texto);
  }
  return saida;
}

/** A lista vazia libera qualquer IP; com entradas, só quem está nela. */
function ipLiberado(lista, ip) {
  if (!Array.isArray(lista) || lista.length === 0) return true;
  const alvo = normalizarIp(ip);
  if (!alvo) return false;
  const bloco = new net.BlockList();
  for (const bruto of lista) {
    const e = lerEntrada(bruto);
    if (!e) continue;
    if (e.prefixo === undefined) bloco.addAddress(e.ip, familia(e.ip));
    else bloco.addSubnet(e.ip, e.prefixo, familia(e.ip));
  }
  return bloco.check(alvo, familia(alvo));
}

// IPs que um webhook nunca pode alcançar: a nossa própria rede e o que não é internet pública.
const PRIVADOS = new net.BlockList();
for (const [rede, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) PRIVADOS.addSubnet(rede, bits, 'ipv4');
for (const [rede, bits] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32]]) {
  PRIVADOS.addSubnet(rede, bits, 'ipv6');
}

function ipPrivado(ip) {
  const alvo = normalizarIp(ip);
  if (!alvo) return true; // não sei o que é: não alcança
  return PRIVADOS.check(alvo, familia(alvo));
}

// ------------------------------------------------------------------- webhook

/**
 * URL de destino do webhook. Só https, sem usuário e senha na URL, e nunca um IP
 * da nossa rede escrito direto — o nome também é conferido na hora da entrega
 * (servicos/webhook.js), porque um nome pode apontar para dentro.
 * `permitirHttp` existe para teste local; em produção fica desligado.
 */
function validarUrlWebhook(texto, { permitirHttp = false } = {}) {
  let url;
  try {
    url = new URL(String(texto || '').trim());
  } catch {
    throw new Error('Endereço do webhook inválido. Use algo como https://seu-sistema.com.br/recebe.');
  }
  const protocolos = permitirHttp ? ['https:', 'http:'] : ['https:'];
  if (!protocolos.includes(url.protocol)) throw new Error('O endereço do webhook precisa começar com https://.');
  if (url.username || url.password) throw new Error('O endereço do webhook não pode ter usuário e senha.');
  if (String(texto).length > 500) throw new Error('Endereço do webhook longo demais (máximo 500 caracteres).');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host) && ipPrivado(host) && !permitirHttp) {
    throw new Error('O endereço do webhook aponta para uma rede interna, que não é alcançável pela internet.');
  }
  if (!host.includes('.') && !net.isIP(host) && !permitirHttp) {
    throw new Error('O endereço do webhook precisa ter um nome público (com ponto).');
  }
  return url.toString();
}

/** Segredo do webhook: derivado do segredo da aplicação + o sal gravado; só o sal vai ao banco. */
function segredoDoWebhook(segredoApp, sal) {
  const bruto = crypto.createHmac('sha256', String(segredoApp)).update(`webhook|${sal}`).digest('hex');
  return `whsec_${bruto}`;
}

function novoSal() {
  return crypto.randomBytes(16).toString('hex');
}

/** HMAC-SHA256 de `<t>.<corpo>`: o tempo vai dentro da assinatura, então repetir uma entrega velha não vale. */
function assinarEntrega(segredo, timestamp, corpo) {
  return crypto.createHmac('sha256', segredo).update(`${timestamp}.${corpo}`).digest('hex');
}

function cabecalhoAssinatura(segredo, corpo, agora = new Date()) {
  const t = Math.floor(agora.getTime() / 1000);
  return `t=${t},v1=${assinarEntrega(segredo, t, corpo)}`;
}

/** Lado de quem recebe (documentado em docs/API.md e usado nos testes). */
function conferirAssinatura(segredo, cabecalho, corpo, agora = new Date()) {
  const partes = Object.fromEntries(
    String(cabecalho || '').split(',').map((p) => p.trim().split('=')).filter((p) => p.length === 2)
  );
  const t = Number(partes.t);
  if (!Number.isInteger(t) || !partes.v1) return false;
  if (Math.abs(Math.floor(agora.getTime() / 1000) - t) > TOLERANCIA_ASSINATURA_S) return false;
  const esperado = Buffer.from(assinarEntrega(segredo, t, corpo));
  const recebido = Buffer.from(String(partes.v1));
  return esperado.length === recebido.length && crypto.timingSafeEqual(esperado, recebido);
}

/** O corpo que o cliente recebe. Valor sigiloso ou ausente vai como null, nunca como zero. */
function montarPayload({ webhook, perfil, itens, urlPublica = '', entregaId, agora = new Date() }) {
  return {
    evento: 'oportunidades.novas',
    entrega_id: entregaId,
    gerado_em: agora.toISOString(),
    filtro: { id: perfil.id, nome: perfil.nome },
    webhook: { id: webhook.id, nome: webhook.nome },
    total: itens.length,
    itens: itens.map((i) => ({
      id: i.id,
      objeto: i.objeto,
      orgao: i.orgao_nome,
      uf: i.uf,
      municipio: i.municipio,
      modalidade: i.modalidade,
      valor_estimado: i.orcamento_sigiloso || i.valor_estimado == null ? null : Number(i.valor_estimado),
      orcamento_sigiloso: Boolean(i.orcamento_sigiloso),
      fim_propostas: i.fim_propostas ? new Date(i.fim_propostas).toISOString() : null,
      link_portal: i.link_portal || null,
      link_painel: urlPublica ? `${urlPublica}/?licitacao=${i.id}` : null,
      palavra: i.palavra || null,
    })),
  };
}

// ----------------------------------------------------------------- limitador

/**
 * Janela fixa por chave, em memória. Por processo: com mais de uma instância o
 * teto real é o múltiplo (a cota mensal, essa sim, vive no banco). `agora` entra
 * por parâmetro para o teste não depender do relógio.
 */
function criarLimitador({ maximo, janelaMs }) {
  const janelas = new Map(); // chave -> { inicio, usados }
  return {
    tentar(chave, agora = Date.now()) {
      let j = janelas.get(chave);
      if (!j || agora - j.inicio >= janelaMs) {
        j = { inicio: agora, usados: 0 };
        janelas.set(chave, j);
        // Poda barata: o mapa não cresce sem fim com chaves de uma vez só.
        if (janelas.size > 5000) {
          for (const [k, v] of janelas) if (agora - v.inicio >= janelaMs) janelas.delete(k);
        }
      }
      if (j.usados >= maximo) {
        return { ok: false, restante: 0, esperarS: Math.max(1, Math.ceil((j.inicio + janelaMs - agora) / 1000)) };
      }
      j.usados += 1;
      return { ok: true, restante: maximo - j.usados, esperarS: 0 };
    },
  };
}

module.exports = {
  PREFIXO_TOKEN,
  MAX_IPS,
  MAX_ITENS_POR_ENTREGA,
  TOLERANCIA_ASSINATURA_S,
  hashToken,
  gerarToken,
  lerBearer,
  normalizarIp,
  validarIps,
  ipLiberado,
  ipPrivado,
  validarUrlWebhook,
  segredoDoWebhook,
  novoSal,
  assinarEntrega,
  cabecalhoAssinatura,
  conferirAssinatura,
  montarPayload,
  criarLimitador,
};
