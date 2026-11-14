// Busca da central de ajuda (Seção 17) — sem banco, sem acento, sem caixa.
// Um guia entra no resultado se TODAS as palavras da busca aparecem nele; a ordem
// vem de onde apareceram (título e ferramenta valem mais que o texto dos passos).

const sem = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const PESOS = [
  ['titulo', 5],
  ['ferramenta', 4],
  ['palavras', 4],
  ['resumo', 2],
  ['passos', 1],
  ['dica', 1],
];

function campo(guia, chave) {
  const v = guia[chave];
  return sem(Array.isArray(v) ? v.join(' ') : v);
}

/** Guias que casam com a busca, do mais ao menos relevante. Busca vazia devolve todos, na ordem do arquivo. */
function buscar(guias, busca) {
  const termos = sem(busca).split(/\s+/).filter((t) => t.length >= 2);
  if (!termos.length) return [...guias];
  const pontuados = [];
  for (const guia of guias) {
    let total = 0;
    let todos = true;
    for (const termo of termos) {
      let ponto = 0;
      for (const [chave, peso] of PESOS) if (campo(guia, chave).includes(termo)) ponto += peso;
      if (!ponto) {
        todos = false;
        break;
      }
      total += ponto;
    }
    if (todos) pontuados.push({ guia, total });
  }
  return pontuados.sort((a, b) => b.total - a.total).map((p) => p.guia);
}

module.exports = { buscar };
