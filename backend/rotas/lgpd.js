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

// GET /api/lgpd/exportar — baixa um JSON com tudo que a organização cadastrou, escrito aos poucos
// (a memória não cresce com o tamanho da organização). A trilha registra o pedido ANTES de sair o
// primeiro byte: cópia parcial de dado pessoal, mesmo interrompida, não pode ficar sem rastro.
rotas.get('/exportar', exigirPapel('admin'), async (req, res) => {
  try {
    await auditoria.registrarDaRequisicao(req, 'exportou_dados', 'lgpd', null, null);
    res.setHeader('Content-Disposition', `attachment; filename="meus-dados-${diaNoFuso()}.json"`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // `write` devolve false com a fila cheia: espera o `drain` — ou o fim da conexão, senão o cliente
    // que fecha a aba deixaria a promessa pendente para sempre (e a conexão do banco presa).
    const escrever = (texto) => {
      if (res.destroyed || res.writableEnded) throw new Error('o cliente encerrou o download');
      if (res.write(texto)) return undefined;
      return new Promise((ok, falha) => {
        const livre = () => { res.off('close', encerrou); ok(); };
        const encerrou = () => { res.off('drain', livre); falha(new Error('o cliente encerrou o download')); };
        res.once('drain', livre);
        res.once('close', encerrou);
      });
    };
    await servico.exportarEmFluxo(req.organizacaoId, escrever);
    res.end();
  } catch (erro) {
    // Já começou a escrever: o cabeçalho de status foi, e o JSON fica incompleto de propósito
    // (inválido), em vez de parecer uma cópia completa.
    if (res.headersSent) {
      console.error('Exportação LGPD interrompida:', erro.message);
      return res.destroy();
    }
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
