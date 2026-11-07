// Assinatura de objeto e comparação entre objetos (seção 24.3).
//
// O problema que isto resolve: "Contratação de empresa especializada para
// prestação de serviços de hospedagem do site institucional da Prefeitura de
// Lajeado" e "Registro de preços para hospedagem de sítio institucional" são o
// mesmo objeto, e nenhuma comparação de texto cru diz isso. O que sobra depois
// de tirar o vocabulário de formulário é `hospedagem institucional site` —
// curto, estável e comparável.
//
// Serve à Fase 10 (reconhecer que o órgão reabriu a deserta) e, depois, às
// recorrências da seção 24.

// O vocabulário de formulário da seção 24.3, mais o que apareceu na base real:
// termo que está em quase todo objeto não distingue objeto nenhum.
const VAZIAS = new Set([
  'contratacao', 'contratacoes', 'empresa', 'empresas', 'especializada', 'especializado',
  'prestacao', 'servico', 'servicos', 'eventual', 'eventuais', 'futura', 'futuras',
  'aquisicao', 'aquisicoes', 'registro', 'precos', 'preco', 'objeto', 'presente',
  'menor', 'fornecimento', 'para', 'pela', 'pelo', 'com', 'sem', 'das', 'dos', 'da',
  'de', 'do', 'na', 'no', 'nas', 'nos', 'em', 'por', 'que', 'uma', 'um', 'as', 'os',
  'ao', 'aos', 'sob', 'demanda', 'conforme', 'atender', 'atendimento', 'necessidades',
  'secretaria', 'secretarias', 'municipal', 'municipio', 'prefeitura', 'camara',
  'visando', 'destinado', 'destinada', 'referente', 'referentes', 'mediante',
  'sistema', 'termo', 'referencia', 'anexo', 'edital', 'lote', 'item', 'itens',
  'exclusiva', 'exclusivo', 'participacao', 'ampla', 'concorrencia', 'tipo',
  'forma', 'modo', 'nos', 'termos', 'lei', 'art', 'artigo', 'inciso',
]);

const QUANTOS_TERMOS = 8;

function semAcento(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * A assinatura da seção 24.3: minúsculas sem acento, sem pontuação, sem
 * números, sem o vocabulário de formulário e sem o nome do próprio órgão —
 * os 8 termos mais significativos, em ordem alfabética.
 *
 * Ordem alfabética, e não a de aparição, porque a assinatura é um conjunto: o
 * mesmo objeto escrito em outra ordem tem de dar a mesma string.
 *
 * "Mais significativo" aqui é o termo mais longo. Numa base de objetos de
 * licitação, comprimento aproxima especificidade melhor do que frequência:
 * `videomonitoramento` distingue, `obra` não — e não exige varrer a base
 * inteira para calcular peso.
 */
function assinaturaObjeto(texto, { orgaoNome } = {}) {
  const doOrgao = new Set(
    semAcento(orgaoNome || '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );

  const termos = semAcento(texto)
    .replace(/[^a-z\s]/g, ' ') // tira pontuação e números de uma vez
    .split(/\s+/)
    .filter((t) => t.length > 2 && !VAZIAS.has(t) && !doOrgao.has(t));

  // Únicos, preservando a primeira aparição, antes de escolher os mais longos.
  const unicos = [...new Set(termos)];
  return unicos
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
    .slice(0, QUANTOS_TERMOS)
    .sort()
    .join(' ');
}

/** Trigramas de uma string, com as bordas marcadas para valorizar início e fim. */
function trigramas(texto) {
  const base = `  ${String(texto || '').trim()} `;
  const conjunto = new Set();
  for (let i = 0; i < base.length - 2; i += 1) conjunto.add(base.slice(i, i + 3));
  return conjunto;
}

/**
 * Coeficiente de Dice entre duas assinaturas: 2×|A∩B| / (|A|+|B|).
 * Vai de 0 a 1. A seção 24.3 fixa 0,70 como o ponto em que dois objetos são
 * "o mesmo".
 */
function dice(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = trigramas(a);
  const tb = trigramas(b);
  if (!ta.size || !tb.size) return 0;

  let comuns = 0;
  for (const t of ta) if (tb.has(t)) comuns += 1;
  return (2 * comuns) / (ta.size + tb.size);
}

const LIMIAR = 0.7;

function mesmoObjeto(a, b, limiar = LIMIAR) {
  return dice(a, b) >= limiar;
}

/**
 * A melhor correspondência de uma assinatura dentro de uma lista de
 * candidatos, ou null se nenhuma alcançar o limiar. Devolve o candidato
 * inteiro e a semelhança, porque quem chama precisa dos dois: um para ligar as
 * licitações, outro para escrever na tela quanto o painel confia nisso.
 */
function melhorCorrespondencia(assinatura, candidatos, { limiar = LIMIAR, campo = 'assinatura_objeto' } = {}) {
  let melhor = null;
  for (const candidato of candidatos) {
    const semelhanca = dice(assinatura, candidato[campo]);
    if (semelhanca >= limiar && (!melhor || semelhanca > melhor.semelhanca)) {
      melhor = { candidato, semelhanca: Math.round(semelhanca * 100) / 100 };
    }
  }
  return melhor;
}

module.exports = { assinaturaObjeto, dice, mesmoObjeto, melhorCorrespondencia, LIMIAR, VAZIAS };
