// Registro dos adaptadores. Adicionar um portal novo = criar o arquivo aqui
// e cadastrar a fonte na tela (seção 5).
const pncp = require('./pncp');
const comprasgov = require('./comprasgov');
const genericoHtml = require('./generico_html');

const adaptadores = {
  [pncp.chave]: pncp,
  [comprasgov.chave]: comprasgov,
  [genericoHtml.chave]: genericoHtml,
};

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
    // Adaptador de enriquecimento não tem busca própria: a tela de Fontes
    // precisa saber disso para não oferecer o botão "Testar busca".
    somenteEnriquecimento: Boolean(a.somenteEnriquecimento),
  }));
}

module.exports = { obter, existe, listar, adaptadores };
