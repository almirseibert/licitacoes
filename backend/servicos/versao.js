// Versão do código que ESTE processo está rodando: hash do conteúdo dos .js de backend/ e worker/.
// API e worker saem da mesma imagem quando o deploy dos dois é do mesmo commit; se os hashes
// divergem, um dos serviços ficou para trás (EasyPanel implanta cada serviço separado).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');
const PASTAS = ['backend', 'worker'];
let guardada = null;

function listar(dir, achados) {
  let entradas;
  try {
    entradas = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entradas.sort((a, b) => a.name.localeCompare(b.name))) {
    const caminho = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules') listar(caminho, achados);
    } else if (e.name.endsWith('.js')) achados.push(caminho);
  }
}

/** 10 caracteres do SHA-1 do código; calculado uma vez por processo. */
function versaoDoCodigo() {
  if (guardada) return guardada;
  const hash = crypto.createHash('sha1');
  const arquivos = [];
  for (const pasta of PASTAS) listar(path.join(RAIZ, pasta), arquivos);
  for (const arquivo of arquivos) {
    hash.update(path.relative(RAIZ, arquivo));
    hash.update(fs.readFileSync(arquivo));
  }
  guardada = hash.digest('hex').slice(0, 10);
  return guardada;
}

module.exports = { versaoDoCodigo };
