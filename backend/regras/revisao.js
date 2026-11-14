// Revisão por advogado dos textos jurídicos do painel (Seções 16, 17b e 18b).
//
// Há um advogado revisor (nome e OAB, em `ADVOGADO_REVISOR_NOME` e `ADVOGADO_REVISOR_OAB`) e
// uma data e uma flag por texto: `JURIDICO_*` (base do Consultor), `LEGAL_*` (termos, política
// e aviso da IA) e `PARCEIROS_*` (termo de vínculo dos serviços). Um texto só conta como
// revisado com os QUATRO dados (nome, OAB, data AAAA-MM-DD e a flag `true`) — faltou um, é
// minuta e a tela avisa. Assim, completar os dados do advogado depois é só preencher o
// ambiente: nenhuma linha de código muda.
//
// Quem revisar também sobe a versão do texto (VERSAO_TERMOS, VERSAO_TERMO_PARCEIRO,
// VERSAO_BASE): o aceite é por versão, e texto mudado pede novo aceite.

const PREFIXOS = ['JURIDICO', 'LEGAL', 'PARCEIROS'];

/**
 * @param {object} env  `process.env` (o teste passa um objeto)
 * @param {'JURIDICO'|'LEGAL'|'PARCEIROS'} prefixo  qual texto
 * @returns {{revisado_por_advogado:boolean, revisor:{nome,oab,revisado_em}|null}}
 */
function revisao(env, prefixo) {
  if (!PREFIXOS.includes(prefixo)) throw new Error(`texto desconhecido: ${prefixo}`);
  const nome = String(env.ADVOGADO_REVISOR_NOME || '').trim();
  const oab = String(env.ADVOGADO_REVISOR_OAB || '').trim();
  const em = String(env[`${prefixo}_REVISADO_EM`] || '').trim();
  const d = new Date(`${em}T00:00:00Z`);
  const dataValida = /^\d{4}-\d{2}-\d{2}$/.test(em) && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === em;
  const revisado = String(env[`${prefixo}_REVISADO`] || '').trim().toLowerCase() === 'true' && Boolean(nome && oab && dataValida);
  return { revisado_por_advogado: revisado, revisor: revisado ? { nome, oab, revisado_em: em } : null };
}

module.exports = { revisao, PREFIXOS };
