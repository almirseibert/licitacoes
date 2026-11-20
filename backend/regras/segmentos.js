// Classificação do objeto de uma licitação ou contrato num segmento do catálogo
// (config/dados/catalogo-segmentos.js). Pura: texto entra, {area, segmento} sai.
//
// Escolha deliberada: dicionário de termos, não IA. A classificação roda sobre centenas de
// milhares de contratos já coletados, precisa ser barata e reprodutível, e a IA só roda por
// clique (CLAUDE.md). O custo é cobertura — o que não casa vira "Outros › Sem classificação" e
// aparece na contagem para mostrar o que ainda falta ensinar ao catálogo.
const { CATALOGO } = require('../config/dados/catalogo-segmentos');

const SEM_CLASSIFICACAO = { area: 'Outros', segmento: 'Sem classificação' };

/**
 * Plural vira singular, palavra a palavra, tanto no objeto quanto nos termos do catálogo — assim
 * "materiais de construção" casa com o termo "material de construção" e "cestas básicas" com "cesta básica".
 * Regra simples de propósito (-ões → -ão, -ais → -al, -eis → -el, -s final), igual dos dois lados.
 */
function singular(palavra) {
  if (palavra.length <= 3) return palavra;
  if (palavra.endsWith('oes')) return `${palavra.slice(0, -3)}ao`;
  if (palavra.endsWith('ais')) return `${palavra.slice(0, -3)}al`;
  if (palavra.endsWith('eis')) return `${palavra.slice(0, -3)}el`;
  if (palavra.endsWith('s') && !palavra.endsWith('ss')) return palavra.slice(0, -1);
  return palavra;
}

/** Minúsculas, sem acento, só letras e números separados por espaço único, no singular. */
function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map(singular)
    .join(' ');
}

// Cada termo vira { texto, exato, peso }: "!" no fim = palavra inteira; mais de uma palavra pesa 2
// (é mais específico que uma palavra solta).
function compilarTermo(bruto) {
  const exato = bruto.endsWith('!');
  const texto = normalizar(exato ? bruto.slice(0, -1) : bruto);
  return { texto, exato, peso: texto.includes(' ') ? 2 : 1 };
}

let compilado = null;
function catalogoCompilado() {
  if (compilado) return compilado;
  compilado = [];
  for (const area of CATALOGO) {
    for (const seg of area.segmentos) {
      compilado.push({
        area: area.area,
        segmento: seg.nome,
        termos: seg.termos.map(compilarTermo),
        excluir: (seg.excluir || []).map(compilarTermo),
      });
    }
  }
  return compilado;
}

/** Posição do termo no texto (já com espaços nas pontas) ou -1. */
function posicao(texto, termo) {
  return texto.indexOf(termo.exato ? ` ${termo.texto} ` : ` ${termo.texto}`);
}

/**
 * Devolve { area, segmento, classificado }. Vence o segmento com mais pontos (cada termo distinto
 * que casa vale 1, ou 2 se tiver mais de uma palavra); empate vai para quem casou mais perto do
 * começo do objeto, onde costuma estar o assunto principal.
 */
function classificar(objeto) {
  const texto = ` ${normalizar(objeto)} `;
  if (texto.trim() === '') return { ...SEM_CLASSIFICACAO, classificado: false };

  let melhor = null;
  for (const seg of catalogoCompilado()) {
    if (seg.excluir.some((t) => posicao(texto, t) >= 0)) continue;
    let pontos = 0;
    let primeira = Infinity;
    for (const termo of seg.termos) {
      const onde = posicao(texto, termo);
      if (onde < 0) continue;
      pontos += termo.peso;
      if (onde < primeira) primeira = onde;
    }
    if (!pontos) continue;
    if (!melhor || pontos > melhor.pontos || (pontos === melhor.pontos && primeira < melhor.primeira)) {
      melhor = { area: seg.area, segmento: seg.segmento, pontos, primeira };
    }
  }
  return melhor
    ? { area: melhor.area, segmento: melhor.segmento, classificado: true }
    : { ...SEM_CLASSIFICACAO, classificado: false };
}

/** O catálogo como a tela precisa: áreas e seus segmentos, na ordem em que foi escrito. */
function listarCatalogo() {
  return CATALOGO.map((a) => ({ area: a.area, segmentos: a.segmentos.map((s) => s.nome) }));
}

/** A área de um segmento (ou null se o nome não é do catálogo). */
function areaDoSegmento(segmento) {
  const achada = CATALOGO.find((a) => a.segmentos.some((s) => s.nome === segmento));
  return achada ? achada.area : null;
}

module.exports = { classificar, normalizar, listarCatalogo, areaDoSegmento, SEM_CLASSIFICACAO };
