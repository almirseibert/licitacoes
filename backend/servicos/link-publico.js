// Link público de leitura do Radar (Seção 7 do plano SaaS).
//
// O token tem 256 bits aleatórios e só aparece uma vez, na resposta de quem
// criou. O banco guarda o SHA-256: quem lê o banco (ou um backup) não abre link
// nenhum. Hash sem sal basta aqui porque o token já é aleatório e longo — não
// há dicionário a atacar.
const crypto = require('crypto');

const FORMATO = /^[A-Za-z0-9_-]{43}$/;

function novoToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hash(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/** Formato de token válido? Recusa antes de ir ao banco. */
function formatoValido(token) {
  return FORMATO.test(String(token || ''));
}

module.exports = { novoToken, hash, formatoValido };
