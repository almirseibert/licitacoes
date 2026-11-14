// "Solicitações" — o canal com o suporte (Seção 17 do PLANO_SAAS_CONLICITACAO.md).
// Protocolo, categorias e a regra de status, sem banco.

const CATEGORIAS = {
  duvida: 'Dúvida de uso',
  problema: 'Algo não funciona',
  sugestao: 'Sugestão',
  cobranca: 'Plano e cobrança',
  lgpd: 'Privacidade e dados (LGPD)',
};

const STATUS = {
  aberta: 'Aberta',
  em_andamento: 'Em andamento',
  respondida: 'Respondida',
  encerrada: 'Encerrada',
};

const MAX_ASSUNTO = 160;
const MAX_TEXTO = 5000;

/** SOL-2026-000123: o ano é o da abertura, o número é o id (nunca repete). */
function protocolo(id, criadaEm) {
  const ano = new Date(criadaEm || Date.now()).getFullYear();
  return `SOL-${ano}-${String(id).padStart(6, '0')}`;
}

/** A solicitação como a tela a mostra: com protocolo e os rótulos de categoria e status. */
const comProtocolo = (s) => ({
  ...s,
  protocolo: protocolo(s.id, s.criada_em),
  categoria_rotulo: CATEGORIAS[s.categoria],
  status_rotulo: STATUS[s.status],
});

function validarNova(corpo) {
  const c = corpo || {};
  const assunto = String(c.assunto || '').replace(/\s+/g, ' ').trim();
  const texto = String(c.texto || '').trim();
  const categoria = c.categoria || 'duvida';
  if (!assunto) return { erro: 'Diga o assunto da solicitação.' };
  if (assunto.length > MAX_ASSUNTO) return { erro: `O assunto passou de ${MAX_ASSUNTO} letras.` };
  if (!texto) return { erro: 'Descreva o que você precisa.' };
  if (texto.length > MAX_TEXTO) return { erro: `O texto passou de ${MAX_TEXTO} letras.` };
  if (!CATEGORIAS[categoria]) return { erro: `Categoria inválida. Use: ${Object.keys(CATEGORIAS).join(', ')}.` };
  return { dados: { assunto, texto, categoria } };
}

function validarMensagem(corpo) {
  const texto = String((corpo && corpo.texto) || '').trim();
  if (!texto) return { erro: 'Escreva a mensagem.' };
  if (texto.length > MAX_TEXTO) return { erro: `A mensagem passou de ${MAX_TEXTO} letras.` };
  return { dados: { texto } };
}

/**
 * Status depois de uma mensagem. A resposta do suporte vira "respondida"; a do
 * cliente reabre ("aberta") — inclusive numa solicitação encerrada, porque quem
 * volta a escrever ainda precisa de ajuda. Quem muda para "encerrada" é o
 * suporte (ou o cliente, pelo botão), nunca uma mensagem.
 */
function statusAposMensagem(statusAtual, autor, statusPedido) {
  if (autor === 'suporte') {
    if (statusPedido && STATUS[statusPedido]) return statusPedido;
    return 'respondida';
  }
  return statusAtual === 'em_andamento' ? 'em_andamento' : 'aberta';
}

module.exports = { CATEGORIAS, STATUS, protocolo, comProtocolo, validarNova, validarMensagem, statusAposMensagem };
