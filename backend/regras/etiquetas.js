// Etiquetas de situação do cartão do Radar (Seção 7 do plano SaaS).
//
// Calculadas na leitura, nunca gravadas: "nova", "urgente" e "vence hoje"
// dependem da hora em que se olha, e gravar isso seria guardar um dado que
// fica errado sozinho.

const HORA = 3600 * 1000;
const FUSO = 'America/Sao_Paulo';

function comoData(valor) {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "2026-11-13" no fuso de São Paulo — o dia que quem usa o painel vê. */
function diaLocal(data) {
  return data.toLocaleDateString('en-CA', { timeZone: FUSO });
}

const ROTULOS = {
  nova: 'nova',
  vence_hoje: 'vence hoje',
  urgente: 'urgente',
  recebendo: 'recebendo propostas',
  srp: 'SRP',
  prorrogada: 'prorrogada',
  adiada: 'adiada',
  suspensa: 'suspensa',
  revogada: 'revogada',
  homologada: 'homologada',
};

/**
 * @param {object} l — a licitação (criado_em, abertura_propostas, fim_propostas,
 *   abertura_original, fim_propostas_original, situacao, srp, valor_homologado)
 * @param {Date} agora
 * @returns {{ chave: string, rotulo: string }[]}
 */
function calcular(l, agora = new Date()) {
  const chaves = [];
  const criado = comoData(l.criado_em);
  const abertura = comoData(l.abertura_propostas);
  const fim = comoData(l.fim_propostas);
  const fimOriginal = comoData(l.fim_propostas_original);
  const aberturaOriginal = comoData(l.abertura_original);
  const situacao = String(l.situacao || '').toLowerCase();

  const suspensa = situacao.includes('suspens');
  const revogada = situacao.includes('revogad') || situacao.includes('anulad');
  const homologada = situacao.includes('homologad') || (l.valor_homologado !== null && l.valor_homologado !== undefined);

  if (criado && agora - criado >= 0 && agora - criado < 24 * HORA) chaves.push('nova');

  if (fim && fim > agora && !suspensa && !revogada) {
    if (diaLocal(fim) === diaLocal(agora)) chaves.push('vence_hoje');
    else if (fim - agora <= 48 * HORA) chaves.push('urgente');
    if (!abertura || abertura <= agora) chaves.push('recebendo');
  }

  if (Number(l.srp) === 1) chaves.push('srp');
  if (fim && fimOriginal && fim > fimOriginal) chaves.push('prorrogada');
  if (abertura && aberturaOriginal && abertura > aberturaOriginal) chaves.push('adiada');
  if (suspensa) chaves.push('suspensa');
  if (revogada) chaves.push('revogada');
  if (homologada) chaves.push('homologada');

  return chaves.map((chave) => ({ chave, rotulo: ROTULOS[chave] }));
}

module.exports = { calcular, ROTULOS };
