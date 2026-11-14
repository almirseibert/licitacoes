// Assinatura e uso do plano (Seção 3 do PLANO_SAAS_CONLICITACAO.md) — o que
// a organização do token assina, quanto usa e o pedido de troca de plano.
// Fica FORA de `assinaturaValida` (app.js): quem venceu precisa chegar aqui.
const express = require('express');
const { exigirPapel, NIVEL_PAPEL } = require('../middlewares/autenticar');
const { ehOperadora } = require('../servicos/escopo');
const { responderErro } = require('../middlewares/responder-erro');
const limites = require('../servicos/limites');
const cobranca = require('../servicos/cobranca');

const rotas = express.Router();

// GET /api/assinatura — plano, situação, recursos e o catálogo para comparar.
rotas.get('/', async (req, res) => {
  try {
    const dados = await limites.daOrganizacao(req.organizacaoId);
    if (!dados) return res.status(404).json({ erro: 'Organização não encontrada.' });
    res.json({
      organizacao: dados.organizacao,
      assinatura: dados.assinatura,
      plano: dados.plano,
      situacao: dados.situacao,
      isenta: dados.isenta,
      planos: dados.planos,
      nomes_recurso: limites.NOMES_RECURSO,
      papel: req.papel,
      // O menu do superadmin aparece pelo que o backend diz, nunca por e-mail no front.
      superadmin: ehOperadora(req.organizacaoId) && NIVEL_PAPEL[req.papel] >= NIVEL_PAPEL.admin,
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar a assinatura.', erro);
  }
});

// GET /api/assinatura/uso — cada limite: usado × permitido.
rotas.get('/uso', async (req, res) => {
  try {
    const [dados, usado] = await Promise.all([limites.daOrganizacao(req.organizacaoId), limites.uso(req.organizacaoId)]);
    const teto = (dados.plano && dados.plano.limites) || {};
    const itens = Object.keys(limites.NOMES_LIMITE).map((chave) => {
      const bruto = teto[chave];
      const emBytes = chave === 'cofre_gb';
      return {
        chave,
        nome: limites.NOMES_LIMITE[chave],
        mensal: limites.MENSAIS.includes(chave),
        usado: emBytes ? Number((usado[chave] / limites.BYTES_POR_GB).toFixed(3)) : usado[chave],
        limite: dados.isenta || bruto === null || bruto === undefined ? null : Number(bruto),
      };
    });
    res.json({ mes: limites.mesDe(), isenta: dados.isenta, itens });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar o uso do plano.', erro);
  }
});

// POST /api/assinatura/pedido — o dono pede um plano; o administrador ativa.
rotas.post('/pedido', exigirPapel('dono'), async (req, res) => {
  const { plano, ciclo } = req.body || {};
  try {
    const r = await cobranca.pedirPlano({ organizacaoId: req.organizacaoId, planoCodigo: plano, ciclo: ciclo || 'mensal', usuarioId: req.usuario.id });
    res.status(201).json({
      ok: true,
      ...r,
      mensagem: 'Pedido registrado. A Studio Mythos envia a cobrança e ativa o plano assim que o pagamento cair.',
    });
  } catch (erro) {
    if (erro.status === 400) return res.status(400).json({ erro: erro.message });
    responderErro(res, 500, 'Não foi possível registrar o pedido.', erro);
  }
});

module.exports = rotas;
