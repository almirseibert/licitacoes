// Normalização de texto usada pela aderência e pela detecção de palavras.
// Tira acento, baixa para minúsculo e colapsa espaço — para que "Inteligência
// Artificial" case com "inteligencia artificial".
function normalizar(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function contem(texto, termo) {
  const t = normalizar(texto);
  const p = normalizar(termo);
  if (!t || !p) return false;
  return t.includes(p);
}

module.exports = { normalizar, contem };
