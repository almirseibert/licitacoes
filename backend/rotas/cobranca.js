// Webhook do gateway de cobrança (Seção 3 do PLANO_SAAS_CONLICITACAO.md).
// Rota pública — quem chama é o gateway, não um usuário. Só abre quando o
// provedor configurado não é 'manual' E há segredo; o corpo precisa vir
// assinado (HMAC-SHA256 em `X-Assinatura`). O payload já chega normalizado
// (ver servicos/cobranca.js); a tradução do formato do Asaas ou do Stripe
// entra quando o gateway for escolhido.
const express = require('express');
const { cobranca: cfg } = require('../config/ambiente');
const { responderErro } = require('../middlewares/responder-erro');
const cobranca = require('../servicos/cobranca');

const rotas = express.Router();

rotas.post('/webhook/:provedor', express.raw({ type: '*/*', limit: '256kb' }), async (req, res) => {
  const provedor = req.params.provedor;
  if (cfg.provedor === 'manual' || provedor !== cfg.provedor || !cfg.segredoWebhook) {
    return res.status(404).json({ erro: 'Webhook de cobrança não configurado.' });
  }
  const bruto = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  if (!cobranca.assinaturaValida(bruto, req.get('x-assinatura'), cfg.segredoWebhook)) {
    console.warn(`Webhook de cobrança (${provedor}) com assinatura inválida, recusado.`);
    return res.status(401).json({ erro: 'Assinatura inválida.' });
  }
  let evento;
  try {
    evento = JSON.parse(bruto.toString('utf8'));
  } catch {
    return res.status(400).json({ erro: 'Corpo não é JSON.' });
  }
  try {
    const r = await cobranca.processarEventoGateway(provedor, evento);
    res.json({ ok: true, ...r });
  } catch (erro) {
    if (erro.code === 'ER_DUP_ENTRY') return res.json({ ok: true, repetido: true });
    if (erro.status === 400) return res.status(400).json({ erro: erro.message });
    responderErro(res, 500, 'Não foi possível processar o evento de cobrança.', erro);
  }
});

module.exports = rotas;
