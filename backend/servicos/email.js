// Envio de alerta por e-mail (seção 10, Fase 6).
//
// Fica DESLIGADO enquanto não houver SMTP no .env — e desligado significa
// desligado: nada de erro na fila, nada de alerta perdido. O aviso no painel é
// a fonte da verdade; o e-mail é só o empurrão para quem não está com a tela
// aberta.
//
// Nenhuma senha fica no código: tudo vem de SMTP_HOST, SMTP_PORTA, SMTP_USUARIO,
// SMTP_SENHA, SMTP_DE e ALERTA_PARA.
const { smtp, urlPublica } = require('../config/ambiente');
const configuracoes = require('./configuracoes');

let transporte;
let avisouDesligado = false;

/**
 * Para quem o aviso vai. A tela manda (seção 11.13); vazia lá, vale o
 * ALERTA_PARA do ambiente.
 */
async function destinatario() {
  return configuracoes.texto('alerta_email_para', smtp.para);
}

async function configurado() {
  return Boolean(smtp.host && smtp.de && (await destinatario()));
}

function obterTransporte() {
  if (transporte) return transporte;
  const nodemailer = require('nodemailer');
  transporte = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.porta,
    secure: smtp.porta === 465,
    auth: smtp.usuario ? { user: smtp.usuario, pass: smtp.senha } : undefined,
  });
  return transporte;
}

function montarCorpo(avisos) {
  const linhas = avisos.map((a) => {
    const quando = a.quando ? new Date(a.quando).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : null;
    return `• ${a.mensagem}${quando ? `\n  Fim das propostas: ${quando}` : ''}`;
  });

  return [
    avisos.length === 1 ? 'Um aviso do painel de licitações:' : `${avisos.length} avisos do painel de licitações:`,
    '',
    linhas.join('\n\n'),
    '',
    // Sem URL_PUBLICA o aviso sai só com o texto: melhor do que um link quebrado.
    ...(urlPublica ? [urlPublica, ''] : []),
    '—',
    'Painel de Licitações — Studio Mythos',
  ].join('\n');
}

function montarAssunto(avisos) {
  if (avisos.length === 1) return `[Licitações] ${String(avisos[0].mensagem).slice(0, 120)}`;
  return `[Licitações] ${avisos.length} avisos de prazo`;
}

/**
 * Envia os avisos em um único e-mail.
 * @returns {{enviado:boolean, motivo?:string, assunto?:string}}
 */
async function enviarAvisos(avisos) {
  if (!avisos || !avisos.length) return { enviado: false, motivo: 'nada a enviar' };

  const para = await destinatario();
  if (!smtp.host || !smtp.de || !para) {
    if (!avisouDesligado) {
      console.log(
        'E-mail de alerta desligado: defina SMTP_HOST e SMTP_DE no .env, e o destinatário em Configurações (ou ALERTA_PARA).'
      );
      avisouDesligado = true;
    }
    return { enviado: false, motivo: 'smtp não configurado' };
  }

  const assunto = montarAssunto(avisos);
  try {
    await obterTransporte().sendMail({
      from: smtp.de,
      to: para,
      subject: assunto,
      text: montarCorpo(avisos),
    });
    return { enviado: true, assunto };
  } catch (erro) {
    // Falha de e-mail nunca derruba o job: o alerta já está no painel.
    console.error('Não foi possível enviar o e-mail de alerta:', erro.message);
    return { enviado: false, motivo: erro.message };
  }
}

/**
 * E-mail transacional (convite de organização, seção 1 do plano de SaaS) —
 * não é alerta, então não depende de `alerta_email_para`: só do SMTP estar
 * configurado. Quem chama decide o que fazer sem SMTP (ex.: devolver o link
 * do convite na resposta da API, para o admin copiar e mandar à mão).
 * @returns {{enviado:boolean, motivo?:string}}
 */
async function enviarTransacional({ para, assunto, texto }) {
  if (!smtp.host || !smtp.de) {
    return { enviado: false, motivo: 'smtp não configurado' };
  }
  try {
    await obterTransporte().sendMail({ from: smtp.de, to: para, subject: assunto, text: texto });
    return { enviado: true };
  } catch (erro) {
    console.error('Não foi possível enviar o e-mail transacional:', erro.message);
    return { enviado: false, motivo: erro.message };
  }
}

module.exports = {
  enviarAvisos,
  enviarTransacional,
  configurado,
  destinatario,
  montarCorpo,
  montarAssunto,
};
