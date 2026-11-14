// /api/lgpd — cópia dos dados e pedido de exclusão da organização (Seção 17).
// Montada só com `comToken`: o direito do titular não pode depender de a assinatura
// estar em dia. A exportação é do admin; o pedido de exclusão, só do dono, que
// confirma com o nome da organização e a própria senha.
const bcrypt = require('bcrypt');
const express = require('express');
const pool = require('../config/db');
const { exigirPapel } = require('../middlewares/autenticar');
const { responderErro } = require('../middlewares/responder-erro');
const auditoria = require('../servicos/auditoria');
const servico = require('../servicos/lgpd');
const regras = require('../regras/lgpd');
const { diaNoFuso } = require('../regras/gestao');

const rotas = express.Router();

const podePedir = (req, org) =>
  regras.podePedirExclusao({
    papel: req.papel,
    organizacaoId: req.organizacaoId,
    cobrancaRecorrente: servico.temCobrancaRecorrente(org),
  });

// GET /api/lgpd — a situação do pedido de exclusão.
rotas.get('/', async (req, res) => {
  try {
    const org = await servico.situacaoDaExclusao(req.organizacaoId);
    if (!org) return res.status(404).json({ erro: 'Organização não encontrada.' });
    res.json({
      organizacao: org.nome,
      exclusao_agendada_em: org.exclusao_agendada_em,
      exclusao_pedida_por: org.pedida_por_nome,
      dias_de_carencia: regras.DIAS_DE_CARENCIA,
      pode_pedir: podePedir(req, org),
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar a situação dos seus dados.', erro);
  }
});

// GET /api/lgpd/exportar — baixa um JSON com tudo que a organização cadastrou.
rotas.get('/exportar', exigirPapel('admin'), async (req, res) => {
  try {
    const dados = await servico.exportar(req.organizacaoId);
    await auditoria.registrarDaRequisicao(req, 'exportou_dados', 'lgpd', null, null);
    const dia = diaNoFuso();
    res.setHeader('Content-Disposition', `attachment; filename="meus-dados-${dia}.json"`);
    res.json(dados);
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível montar a cópia dos dados.', erro);
  }
});

// POST /api/lgpd/exclusao — { confirmacao: "<nome da organização>", senha }
rotas.post('/exclusao', exigirPapel('dono'), async (req, res) => {
  const { confirmacao, senha } = req.body || {};
  try {
    const org = await servico.situacaoDaExclusao(req.organizacaoId);
    if (!org) return res.status(404).json({ erro: 'Organização não encontrada.' });
    const pode = podePedir(req, org);
    if (!pode.ok) return res.status(403).json({ erro: pode.motivo });
    if (org.exclusao_agendada_em) return res.status(409).json({ erro: 'A exclusão já está agendada. Cancele o pedido para mudar a data.' });
    if (!regras.confirmacaoConfere(org.nome, confirmacao)) {
      return res.status(400).json({ erro: 'Para confirmar, digite o nome da organização exatamente como aparece.' });
    }

    const [[usuario]] = await pool.query('SELECT senha_hash FROM usuarios WHERE id = ?', [req.usuario.id]);
    if (!senha || !usuario || !(await bcrypt.compare(String(senha), usuario.senha_hash))) {
      return res.status(403).json({ erro: 'Senha incorreta.' });
    }

    const quando = await servico.agendar(req.organizacaoId, req.usuario.id);
    await auditoria.registrarDaRequisicao(req, 'pediu_exclusao', 'lgpd', null, null);
    res.json({ ok: true, exclusao_agendada_em: quando });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível agendar a exclusão.', erro);
  }
});

// DELETE /api/lgpd/exclusao — o dono desiste durante a carência.
rotas.delete('/exclusao', exigirPapel('dono'), async (req, res) => {
  try {
    const cancelou = await servico.cancelar(req.organizacaoId);
    if (!cancelou) return res.status(404).json({ erro: 'Não há exclusão agendada.' });
    await auditoria.registrarDaRequisicao(req, 'cancelou_exclusao', 'lgpd', null, null);
    res.json({ ok: true });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível cancelar o pedido.', erro);
  }
});

module.exports = rotas;
