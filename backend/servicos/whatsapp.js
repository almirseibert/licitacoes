// Envio de alerta por WhatsApp pela Meta Cloud API (seção 14; opcional).
//
// Mesma postura do e-mail: fica DESLIGADO enquanto não houver WHATSAPP_TOKEN,
// WHATSAPP_PHONE_ID e WHATSAPP_DESTINO no .env, e desligado significa
// desligado — nada de erro na fila, nada de alerta perdido. O aviso no painel é
// a fonte da verdade; o WhatsApp é o empurrão para quem está na rua.
//
// Uma limitação da Meta que vale escrever: mensagem de texto livre só sai
// dentro da janela de 24 h depois da última mensagem do destinatário. Fora
// dela, a API recusa com 470/131047 e só um template aprovado passa. Como o
// destino aqui é o próprio dono do painel, basta ele responder qualquer coisa
// ao número para reabrir a janela — e, recusado, o alerta continua no painel e
// no e-mail. Por isso a falha é registrada e nunca derruba o job.
const { whatsapp: cfg, urlPublica } = require('../config/ambiente');
const { buscar } = require('./http');
const configuracoes = require('./configuracoes');

const VERSAO_API = 'v21.0';
let avisouDesligado = false;

/**
 * Para qual número vai. A tela manda (seção 11.13); vazia lá, vale o
 * WHATSAPP_DESTINO do ambiente.
 */
async function destinatario() {
  return configuracoes.texto('alerta_whatsapp_destino', cfg.destino);
}

async function configurado() {
  return Boolean(cfg.token && cfg.telefoneId && (await destinatario()));
}

/** Só dígitos: a API recusa número com +, espaço ou parêntese. */
function numeroLimpo(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function montarTexto(avisos) {
  const linhas = avisos.map((a) => {
    const quando = a.quando
      ? new Date(a.quando).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      : null;
    return `• ${a.mensagem}${quando ? `\n  Fim das propostas: ${quando}` : ''}`;
  });

  const cabecalho =
    avisos.length === 1
      ? '*Painel de Licitações* — um aviso:'
      : `*Painel de Licitações* — ${avisos.length} avisos:`;

  const partes = [cabecalho, '', linhas.join('\n\n')];
  if (urlPublica) partes.push('', urlPublica);
  return partes.join('\n');
}

/**
 * Envia os avisos em uma única mensagem.
 * @returns {{enviado:boolean, motivo?:string}}
 */
async function enviarAvisos(avisos) {
  if (!avisos || !avisos.length) return { enviado: false, motivo: 'nada a enviar' };

  const destino = numeroLimpo(await destinatario());
  if (!cfg.token || !cfg.telefoneId || !destino) {
    if (!avisouDesligado) {
      console.log(
        'WhatsApp de alerta desligado: defina WHATSAPP_TOKEN e WHATSAPP_PHONE_ID no .env, e o número em Configurações (ou WHATSAPP_DESTINO).'
      );
      avisouDesligado = true;
    }
    return { enviado: false, motivo: 'whatsapp não configurado' };
  }

  try {
    await buscar(`https://graph.facebook.com/${VERSAO_API}/${cfg.telefoneId}/messages`, {
      metodo: 'POST',
      cabecalhos: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
      },
      corpo: JSON.stringify({
        messaging_product: 'whatsapp',
        to: destino,
        type: 'text',
        text: { preview_url: false, body: montarTexto(avisos).slice(0, 4000) },
      }),
      // Recusa da Meta não é intermitência: repetir três vezes só gasta tempo.
      tentativas: 1,
    });
    return { enviado: true };
  } catch (erro) {
    console.error('Não foi possível enviar o WhatsApp de alerta:', erro.message);
    return { enviado: false, motivo: erro.message };
  }
}

module.exports = { enviarAvisos, configurado, destinatario, montarTexto, numeroLimpo };
