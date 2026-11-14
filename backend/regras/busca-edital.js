// Busca por trecho no texto já extraído do edital (Seção 5 do plano SaaS).
//
// Sem banco vetorial, de propósito: o edital de uma licitação cabe na memória,
// e o que a pergunta precisa é achar os 4–6 parágrafos que falam do assunto —
// palavra da pergunta pesada pela raridade no próprio edital (quem aparece em
// toda página, como "licitação", não decide nada). Função pura, testada sem
// banco em testes/perguntas-edital.test.js.
//
// A página vem daqui, nunca do modelo: o job de leitura grava o texto de cada
// arquivo com as páginas separadas por \f (form feed). Texto antigo, sem \f,
// de arquivo com mais de uma página fica com `pagina: null` — a tela diz
// "página não identificada" em vez de inventar uma.

const SEPARADOR_PAGINA = '\f';
const TAMANHO_TRECHO = 900;
const MAX_TRECHOS = 6;

const PALAVRAS_VAZIAS = new Set(
  (
    'a o as os um uma uns umas de da do das dos em na no nas nos por pela pelo pelas pelos para com sem ' +
    'que qual quais quando onde como quanto quantos quantas e ou se ha ser sao esta este isso isto essa esse ' +
    'edital licitacao licitante empresa orgao preciso posso pode devo deve existe existem tem algum alguma ' +
    'sobre qualquer seu sua seus suas meu minha mais menos ja nao sim lei'
  ).split(' ')
);

const { normalizarPalavras: normalizar } = require('./texto');

/**
 * Raiz curta para casar flexão ("garantia", "garantias", "garantir"): a palavra
 * longa vira o prefixo de 5 letras; a curta fica inteira.
 */
function raiz(palavra) {
  return palavra.length >= 6 ? palavra.slice(0, 5) : palavra;
}

/** Termos de busca de uma pergunta (+ dicas da biblioteca), sem repetição. */
function termosDe(pergunta, dicas = []) {
  const vistos = new Set();
  for (const fonte of [pergunta, ...dicas]) {
    for (const palavra of normalizar(fonte).split(' ')) {
      if (palavra.length < 3 || PALAVRAS_VAZIAS.has(palavra)) continue;
      vistos.add(raiz(palavra));
    }
  }
  return [...vistos];
}

/**
 * Páginas de um arquivo a partir do texto guardado. Só PDF tem página de
 * verdade: .docx e .txt são lidos como "1 página" (servicos/texto-documento.js),
 * e citar "página 1" de um Word de 40 páginas seria inventar.
 * @param {{id:number, nome?:string, extensao?:string, texto:string, paginas?:number}} arquivo
 * @returns {Array<{arquivoId, arquivo, pagina:number|null, texto}>}
 */
function paginasDoArquivo(arquivo) {
  const texto = String(arquivo.texto || '');
  const partes = texto.split(SEPARADOR_PAGINA);
  const comMarca = partes.length > 1;
  const ehPdf = String(arquivo.extensao || '').replace('.', '').toLowerCase() === 'pdf';
  return partes.map((parte, i) => ({
    arquivoId: arquivo.id,
    arquivo: arquivo.nome || null,
    pagina: comMarca ? i + 1 : Number(arquivo.paginas) === 1 && ehPdf ? 1 : null,
    texto: parte,
  }));
}

/** Corta uma página em blocos de linhas inteiras de até `tamanho` caracteres. */
function blocosDaPagina(pagina, tamanho = TAMANHO_TRECHO) {
  const blocos = [];
  let atual = '';
  for (const linha of pagina.texto.split(/\n/)) {
    const limpa = linha.replace(/\s+/g, ' ').trim();
    if (!limpa) continue;
    if (atual && atual.length + limpa.length + 1 > tamanho) {
      blocos.push(atual);
      atual = '';
    }
    // Linha maior que o bloco (PDF sem quebra): corta no tamanho.
    for (let i = 0; i < limpa.length; i += tamanho) {
      const pedaco = limpa.slice(i, i + tamanho);
      if (pedaco.length === tamanho) blocos.push(pedaco);
      else atual = atual ? `${atual} ${pedaco}` : pedaco;
    }
  }
  if (atual) blocos.push(atual);
  return blocos.map((texto) => ({ arquivoId: pagina.arquivoId, arquivo: pagina.arquivo, pagina: pagina.pagina, texto }));
}

/**
 * Os trechos do edital que mais falam da pergunta.
 *
 * @param {Array} paginas  saída de `paginasDoArquivo`, de todos os arquivos
 * @param {string} pergunta
 * @param {{dicas?:string[], max?:number}} [opcoes]
 * @returns {Array<{id:string, arquivoId, arquivo, pagina, texto, pontos:number}>}
 *   na ordem do documento, com id T1..Tn (é o id que o modelo cita).
 */
function buscarTrechos(paginas, pergunta, { dicas = [], max = MAX_TRECHOS } = {}) {
  const termos = new Set(termosDe(pergunta, dicas));
  if (!termos.size) return [];

  // Uma passada por palavra: o termo é a palavra inteira (até 5 letras) ou o
  // prefixo de 5 — basta olhar os prefixos de 3, 4 e 5 letras no Set.
  const df = new Map();
  const blocos = [];
  let total = 0;
  for (const bloco of paginas.flatMap((p) => blocosDaPagina(p))) {
    const ordem = total++;
    const contagem = new Map();
    for (const palavra of normalizar(bloco.texto).split(' ')) {
      for (let n = 3; n <= Math.min(5, palavra.length); n += 1) {
        const prefixo = palavra.slice(0, n);
        // Termo curto (< 5) só casa a palavra inteira ou o começo dela, como antes.
        if (termos.has(prefixo)) contagem.set(prefixo, (contagem.get(prefixo) || 0) + 1);
      }
    }
    if (!contagem.size) continue;
    for (const termo of contagem.keys()) df.set(termo, (df.get(termo) || 0) + 1);
    blocos.push({ bloco, ordem, contagem });
  }

  // Peso pela raridade no próprio edital (idf): termo que aparece em todo
  // bloco não diferencia nada. Bloco que junta mais termos diferentes da
  // pergunta vale mais que um que repete o mesmo dez vezes.
  for (const b of blocos) {
    let pontos = 0;
    for (const [termo, n] of b.contagem) pontos += Math.log(1 + total / df.get(termo)) * (1 + Math.log(n));
    b.pontos = pontos * (1 + 0.5 * (b.contagem.size - 1));
  }

  return blocos
    .sort((a, b) => b.pontos - a.pontos || a.ordem - b.ordem)
    .slice(0, max)
    .sort((a, b) => a.ordem - b.ordem)
    .map(({ bloco }, i) => ({ id: `T${i + 1}`, ...bloco }));
}

/**
 * Trecho com texto dirigido a um modelo de IA ("ignore as instruções…").
 * Não bloqueia nada — o schema é a defesa —, mas a tela avisa: edital que tenta
 * instruir a IA é, por si, informação para quem vai licitar.
 */
const PADROES_INSTRUCAO = [
  /ignor\w*\s+(?:\w+\s+){0,3}instru/,
  /desconsider\w*\s+(?:\w+\s+){0,3}(?:instru|regras|anteriores)/,
  /ignore\s+(?:all\s+|the\s+)?previous/,
  /(?:voce|you)\s+(?:e|agora e|are|are now)\s+(?:um|uma|an?)\s+(?:assistente|ia|modelo|assistant|ai)/,
  /(?:responda|responder|answer)\s+(?:sempre|apenas|only|always)\s+(?:que|with|sim)/,
  /system\s+prompt|prompt\s+do\s+sistema/,
];

function pareceInstrucao(texto) {
  const n = normalizar(texto);
  return PADROES_INSTRUCAO.some((p) => p.test(n));
}

module.exports = {
  TAMANHO_TRECHO,
  MAX_TRECHOS,
  paginasDoArquivo,
  blocosDaPagina,
  buscarTrechos,
  pareceInstrucao,
};
