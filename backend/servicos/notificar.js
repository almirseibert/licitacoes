// Um só lugar de onde o aviso sai do painel para fora (seção 14).
//
// O alerta já está gravado em `alertas` quando isto roda: aqui só se empurra
// por e-mail e por WhatsApp, os dois opcionais e os dois tolerantes a falha.
// Canal desligado ou fora do ar não derruba o job nem apaga o aviso — o sino do
// painel continua sendo a fonte da verdade.
const email = require('./email');
const whatsapp = require('./whatsapp');

/**
 * @param {number} organizacaoId - de quem é o aviso; o destino é dela (Seção 1b).
 * @param {Array<{mensagem:string, quando?:Date|string}>} avisos
 * @returns {{email:object, whatsapp:object}}
 */
async function avisar(organizacaoId, avisos) {
  if (!avisos || !avisos.length) {
    const nada = { enviado: false, motivo: 'nada a enviar' };
    return { email: nada, whatsapp: nada };
  }
  // Em sequência, não em paralelo: são dois serviços de terceiro e a ordem do
  // log fica legível. São duas requisições por rodada, não vale paralelizar.
  const porEmail = await email.enviarAvisos(organizacaoId, avisos);
  const porWhatsapp = await whatsapp.enviarAvisos(organizacaoId, avisos);
  return { email: porEmail, whatsapp: porWhatsapp };
}

async function canais(organizacaoId) {
  return { email: await email.configurado(organizacaoId), whatsapp: await whatsapp.configurado(organizacaoId) };
}

module.exports = { avisar, canais };
