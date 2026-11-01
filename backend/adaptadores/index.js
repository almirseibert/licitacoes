// Registro dos adaptadores. Adicionar um portal novo = criar o arquivo aqui
// e cadastrar a fonte na tela (seção 5).
const pncp = require('./pncp');

const adaptadores = { [pncp.chave]: pncp };

function obter(chave) {
  const adaptador = adaptadores[chave];
  if (!adaptador) {
    throw new Error(`Adaptador "${chave}" ainda não implementado neste painel.`);
  }
  return adaptador;
}

function existe(chave) {
  return Boolean(adaptadores[chave]);
}

function listar() {
  return Object.values(adaptadores).map((a) => ({
    chave: a.chave,
    nome: a.nome,
    camposConfig: a.camposConfig || [],
  }));
}

module.exports = { obter, existe, listar, adaptadores };
