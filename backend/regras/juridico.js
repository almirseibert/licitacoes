// Consultor jurídico (Seção 16 do PLANO_SAAS_CONLICITACAO.md) — as regras que erram
// calado, sem banco e sem rede: achar na base os artigos que tratam da pergunta, dizer se
// a base está revisada por advogado e preparar o pedido.
//
// A resposta do modelo só vale se cita um artigo DA NOSSA BASE: o modelo recebe os
// artigos achados como trechos rotulados (T1…Tn) e a validação é a mesma do Pergunte ao
// Edital (`ia-schema.validarResposta`) — a frase citada tem de estar, letra a letra, no
// texto do artigo enviado. Pergunta que a base não cobre não gasta modelo.
const base = require('../config/dados/juridico');
const busca = require('./busca-edital');
const { normalizarPalavras } = require('./texto');
const { revisao: revisaoDe } = require('./revisao');

const MINIMO = 8;
const MAXIMO = 500;
const MAX_ARTIGOS = 6;

/** O texto que se indexa de um artigo: título, resumo e os termos do cliente. */
const textoDe = (a) => `${a.titulo}. ${a.texto} ${(a.termos || []).join(' ')}`;

// A base é fixa: as palavras normalizadas de cada artigo saem uma vez, no carregamento.
const PALAVRAS = base.ARTIGOS.map((a) => [...new Set(normalizarPalavras(textoDe(a)).split(' '))]);
// Título e termos do cliente valem mais que o corpo: dizem do que o artigo trata.
const PALAVRAS_CHAVE = base.ARTIGOS.map((a) => [...new Set(normalizarPalavras(`${a.titulo} ${(a.termos || []).join(' ')}`).split(' '))]);

/**
 * O termo (raiz de até 5 letras, ver `termosDe`) casa com a palavra? Termo curto casa a
 * palavra inteira e flexão de até 2 letras ("multa", "multas"); raiz de 5 letras casa
 * qualquer palavra que comece por ela ("impug" → impugnação, impugnar).
 */
function casa(termo, palavra) {
  if (palavra === termo) return true;
  return palavra.startsWith(termo) && (termo.length >= 5 || palavra.length <= termo.length + 2);
}

/**
 * Pontua a base contra a pergunta: cada termo vale pela raridade na base (termo em todo
 * artigo não diferencia nada) e o artigo só entra se casar pelo menos dois termos distintos
 * (um só, quando a pergunta tem menos de três) — uma palavra solta ("quem", "ganhar")
 * não pode trazer artigo e custar uma chamada ao modelo.
 * @returns {Array<{ordem:number, pontos:number}>} do melhor para o pior
 */
function pontuar(pergunta) {
  const termos = busca.termosDe(pergunta);
  if (!termos.length) return [];
  const casados = PALAVRAS.map((palavras) => termos.filter((t) => palavras.some((p) => casa(t, p))));
  const df = new Map(termos.map((t) => [t, casados.filter((c) => c.includes(t)).length]));
  const minimo = termos.length >= 3 ? 2 : 1;
  return casados
    .map((c, ordem) => {
      const peso = (t) => Math.log(1 + PALAVRAS.length / df.get(t)) * (PALAVRAS_CHAVE[ordem].some((p) => casa(t, p)) ? 2 : 1);
      return { ordem, pontos: c.reduce((s, t) => s + peso(t), 0) * (1 + 0.5 * (c.length - 1)), n: c.length };
    })
    .filter((x) => x.n >= minimo)
    .sort((a, b) => b.pontos - a.pontos || a.ordem - b.ordem);
}

/**
 * Números de artigo que a pergunta cita ("art. 75", "artigo 164", "arts. 96 e 102"):
 * quem pergunta pelo número quer aquele artigo.
 */
function numerosCitados(pergunta) {
  const achados = new Set();
  for (const m of String(pergunta || '').matchAll(/\bart(?:igos?|s?\.?)\s*((?:\d{1,3}\s*(?:º|o|°)?\s*(?:,|e|a|ao)?\s*)+)/gi)) {
    for (const n of m[1].match(/\d{1,3}/g) || []) achados.add(n);
  }
  return [...achados];
}

/** Artigos da base cujo rótulo tem esse número (art. 75 casa "art. 75" e "arts. 124 e 125"). */
function artigosDoNumero(numero) {
  return base.ARTIGOS.filter((a) => (a.artigo.match(/\d{1,3}/g) || []).includes(numero) || faixaTem(a.artigo, numero));
}

/** "arts. 96 a 102" tem o 98? Só a faixa escrita com "a": "124 e 125" não é faixa. */
function faixaTem(rotuloArtigo, numero) {
  const m = rotuloArtigo.match(/(\d{1,3})\D+a\D+(\d{1,3})/);
  return Boolean(m) && Number(numero) >= Number(m[1]) && Number(numero) <= Number(m[2]);
}

/**
 * Os artigos da base que mais falam da pergunta: os citados pelo número primeiro,
 * depois os de maior pontuação.
 * @returns {Array<{id:string, arquivoId, arquivo, pagina:null, texto, artigo:object}>}
 *   com id T1..Tn (é o rótulo que o modelo cita).
 */
function buscarArtigos(pergunta, { max = MAX_ARTIGOS } = {}) {
  const porNumero = numerosCitados(pergunta).flatMap(artigosDoNumero);
  const achados = pontuar(pergunta).slice(0, max).map(({ ordem }) => base.ARTIGOS[ordem]);
  const vistos = new Set();
  const lista = [];
  for (const a of [...porNumero, ...achados]) {
    if (!a || vistos.has(a.id)) continue;
    vistos.add(a.id);
    lista.push(a);
    if (lista.length >= max) break;
  }
  return lista.map((a, i) => ({ id: `T${i + 1}`, arquivoId: a.id, arquivo: base.rotulo(a), pagina: null, texto: textoDe(a), artigo: a }));
}

/**
 * Pesquisa simples da biblioteca (sem IA): cada palavra da busca tem de aparecer em algum
 * lugar do item; o título pesa mais que o corpo. Sem busca, devolve tudo na ordem da base.
 */
function filtrar(itens, textoDeItem, tituloDeItem, { q = '', tema = '' } = {}) {
  const palavras = normalizarPalavras(q).split(' ').filter((p) => p.length >= 2);
  const doTema = tema ? itens.filter((i) => i.tema === tema) : itens;
  if (!palavras.length) return doTema;
  return doTema
    .map((item) => {
      const corpo = normalizarPalavras(textoDeItem(item));
      const titulo = normalizarPalavras(tituloDeItem(item));
      let pontos = 0;
      for (const p of palavras) {
        if (!corpo.includes(p) && !titulo.includes(p)) return null;
        pontos += (titulo.includes(p) ? 3 : 0) + 1;
      }
      return { item, pontos };
    })
    .filter(Boolean)
    .sort((a, b) => b.pontos - a.pontos)
    .map((x) => x.item);
}

const buscarNaBiblioteca = (q, tema) => filtrar(base.GUIAS, (g) => `${g.resumo} ${g.corpo.join(' ')} ${g.termos.join(' ')}`, (g) => g.titulo, { q, tema });
const pesquisarArtigos = (q, tema) => filtrar(base.ARTIGOS, textoDe, (a) => `${a.titulo} ${a.artigo}`, { q, tema });

/** O que a tela mostra de um artigo achado (sem o texto indexado). */
function resumoDoArtigo(a) {
  return { id: a.id, lei: a.lei, artigo: a.artigo, rotulo: base.rotulo(a), titulo: a.titulo, tema: a.tema, texto: a.texto };
}

/** O conteúdo enviado ao modelo: cada artigo com o rótulo que ele cita. */
function rotularArtigos(trechos) {
  return trechos.map((t) => `[${t.id}] (${t.arquivo})\n${t.texto}`).join('\n\n');
}

/**
 * Valida o pedido. @returns {{ erro } | { pergunta }}
 */
function lerPedido(corpo = {}) {
  const pergunta = typeof corpo.pergunta === 'string' ? corpo.pergunta.replace(/\s+/g, ' ').trim() : '';
  if (pergunta.length < MINIMO) return { erro: `Escreva a pergunta (pelo menos ${MINIMO} letras).` };
  if (pergunta.length > MAXIMO) return { erro: `A pergunta passa de ${MAXIMO} caracteres — resuma.` };
  return { pergunta };
}

/** Título da conversa: o começo da primeira pergunta. */
function tituloDaConversa(pergunta) {
  const limpo = String(pergunta || '').replace(/\s+/g, ' ').trim();
  return limpo.length > 60 ? `${limpo.slice(0, 57).trim()}…` : limpo;
}

/** Estado da revisão da base (ver `regras/revisao.js`): sem o aval completo do advogado, é minuta. */
function revisao(env = process.env) {
  return { ...revisaoDe(env, 'JURIDICO'), versao_base: base.VERSAO_BASE };
}

const AVISO =
  'O Consultor jurídico é um apoio de leitura da Lei 14.133/2021 e da Lei Complementar 123/2006. Não substitui advogado: ' +
  'a resposta é uma sugestão, pode estar incompleta ou desatualizada, e a decisão sobre o seu caso é sua e do seu advogado.';

const AVISO_MINUTA =
  'A base jurídica ainda não foi revisada por advogado. Confira cada artigo citado no texto da lei antes de agir.';

module.exports = {
  MINIMO,
  MAXIMO,
  MAX_ARTIGOS,
  AVISO,
  AVISO_MINUTA,
  numerosCitados,
  buscarArtigos,
  buscarNaBiblioteca,
  pesquisarArtigos,
  resumoDoArtigo,
  rotularArtigos,
  lerPedido,
  tituloDaConversa,
  revisao,
};
