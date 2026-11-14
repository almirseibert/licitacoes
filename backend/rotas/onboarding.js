// /api/onboarding — assistente de primeiro acesso, aceite dos termos e NPS (Seção 17).
// Montada só com `comToken`: o leitor também aceita os termos e responde ao NPS.
// As escritas do assistente exigem papel de admin e assinatura em dia.
const express = require('express');
const { exigirPapel, NIVEL_PAPEL } = require('../middlewares/autenticar');
const { responderErro } = require('../middlewares/responder-erro');
const { assinaturaValida } = require('../servicos/limites');
const servico = require('../servicos/onboarding');
const auditoria = require('../servicos/auditoria');
const regras = require('../regras/onboarding');

const rotas = express.Router();

// GET /api/onboarding — passos, o que já está preenchido, termos e NPS.
rotas.get('/', async (req, res) => {
  try {
    const estado = await servico.estado({ organizacaoId: req.organizacaoId, usuarioId: req.usuario.id });
    if (!estado) return res.status(404).json({ erro: 'Organização não encontrada.' });
    res.json({ ...estado, papel: req.papel, pode_administrar: NIVEL_PAPEL[req.papel] >= NIVEL_PAPEL.admin, ufs: regras.UFS });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar o assistente.', erro);
  }
});

// POST /api/onboarding/concluir — { empresa: { razao_social, cnpj, cnaes[] }, palavras, exclusoes, ufs }
rotas.post('/concluir', assinaturaValida, exigirPapel('admin'), async (req, res) => {
  const v = regras.validarAssistente(req.body);
  if (v.erro) return res.status(400).json({ erro: v.erro });
  try {
    const r = await servico.concluir({ organizacaoId: req.organizacaoId, dados: v.dados });
    if (r.limite) return res.status(402).json(r.limite);
    await auditoria.registrarDaRequisicao(req, 'concluiu_assistente', 'conta', null, { palavras: v.dados.palavras.length });
    res.json({ ok: true, palavras_novas: r.palavras_novas, descartadas: v.dados.descartadas });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível salvar os dados do assistente.', erro);
  }
});

// POST /api/onboarding/boletim — gera já o primeiro boletim (e manda por e-mail, se houver SMTP).
rotas.post('/boletim', assinaturaValida, exigirPapel('admin'), async (req, res) => {
  try {
    const r = await servico.primeiroBoletim({ organizacaoId: req.organizacaoId });
    if (r.erro) return res.status(r.status || 400).json({ erro: r.erro });
    res.json(r);
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível gerar o primeiro boletim agora.', erro);
  }
});

// POST /api/onboarding/termos/aceitar — registra o aceite da versão vigente.
rotas.post('/termos/aceitar', async (req, res) => {
  try {
    await servico.aceitarTermos({ usuarioId: req.usuario.id, organizacaoId: req.organizacaoId, ip: req.ip });
    await auditoria.registrarDaRequisicao(req, 'aceitou_termos', 'conta', null, null);
    res.json({ ok: true });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível registrar o aceite.', erro);
  }
});

// POST /api/onboarding/nps — { nota 0..10, comentario? }
rotas.post('/nps', async (req, res) => {
  const v = regras.validarNps(req.body);
  if (v.erro) return res.status(400).json({ erro: v.erro });
  try {
    await servico.registrarNps({ organizacaoId: req.organizacaoId, usuarioId: req.usuario.id, ...v.dados });
    res.status(201).json({ ok: true });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível registrar a sua nota.', erro);
  }
});

// POST /api/onboarding/nps/dispensar — "agora não": volta a perguntar em 30 dias.
rotas.post('/nps/dispensar', async (req, res) => {
  try {
    await servico.registrarNps({ organizacaoId: req.organizacaoId, usuarioId: req.usuario.id, nota: null, comentario: null });
    res.json({ ok: true });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível registrar.', erro);
  }
});

module.exports = rotas;
