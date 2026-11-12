// Helpers pequenos e sem estado para o mundo multiempresa (seção 1 do
// PLANO_SAAS_CONLICITACAO.md), usados por backend/rotas/auth.js e, na Seção 3
// (planos e cobrança), pela tela de "Equipe" e pelo painel do superadmin.
const crypto = require('crypto');

// Mesma ordem de backend/middlewares/autenticar.js — 'dono' é o único papel
// que convida gente nova e decide o plano; os outros três usam o painel.
const PAPEIS = ['dono', 'admin', 'membro', 'leitor'];

const DIAS_TESTE_PADRAO = 15; // seção 3 do plano: teste grátis de 15 dias.
const HORAS_VALIDADE_CONVITE = 72;

function papelValido(papel) {
  return PAPEIS.includes(papel);
}

// Token de convite: 32 bytes aleatórios em hex (64 caracteres), o bastante
// para não ser adivinhado e curto o suficiente para caber numa URL de e-mail.
function gerarTokenConvite() {
  return crypto.randomBytes(32).toString('hex');
}

function dataFimTeste(aPartirDe = new Date()) {
  const data = new Date(aPartirDe);
  data.setDate(data.getDate() + DIAS_TESTE_PADRAO);
  return data.toISOString().slice(0, 10); // DATE, sem hora
}

function expiraConvite(aPartirDe = new Date()) {
  const data = new Date(aPartirDe);
  data.setHours(data.getHours() + HORAS_VALIDADE_CONVITE);
  return data;
}

module.exports = {
  PAPEIS,
  DIAS_TESTE_PADRAO,
  HORAS_VALIDADE_CONVITE,
  papelValido,
  gerarTokenConvite,
  dataFimTeste,
  expiraConvite,
};
