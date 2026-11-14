// /api/chat — monitor de chat do pregão (Seção 6 do plano SaaS).
//
// Tudo é da organização do token: o id da licitação ou da mensagem que vier na
// URL só vale se o monitoramento (ou a mensagem) for desta organização.
const express = require('express');
const { responderErro } = require('../middlewares/responder-erro');
const limites = require('../servicos/limites');
const servico = require('../servicos/chat');
const chatJob = require('../jobs/chat');
const regras = require('../regras/chat');
const pool = require('../config/db');
const escopo = require('../servicos/escopo');

const rotas = express.Router();

const idValido = (valor) => (/^\d+$/.test(String(valor)) ? Number(valor) : null);

// GET /api/chat/monitores?aba=todos|nao_lidos|importantes|arquivados
rotas.get('/monitores', async (req, res) => {
  const aba = regras.abaValida(req.query.aba);
  try {
    const [dados, abas, uso] = await Promise.all([
      servico.listarMonitores(req.organizacaoId, aba),
      servico.contarAbas(req.organizacaoId),
      limites.uso(req.organizacaoId),
    ]);
    const plano = await limites.daOrganizacao(req.organizacaoId);
    // Mesma regra de `limites.cabe`: chave que o plano não lista vale zero; só o
    // `null` explícito (e a operadora) é "sem teto".
    const limitesDoPlano = (plano && plano.plano && plano.plano.limites) || {};
    const limite = plano && plano.isenta ? null : 'monitores_chat' in limitesDoPlano ? limitesDoPlano.monitores_chat : 0;
    res.json({ aba, dados, abas, vagas: { usados: uso.monitores_chat || 0, limite } });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar o monitor de chat.', erro);
  }
});

// GET /api/chat/portais — o que se sabe de cada portal + o que o painel mediu.
rotas.get('/portais', async (req, res) => {
  try {
    res.json({
      catalogo: regras.catalogoDePortais(),
      medido: await servico.portaisMedidos(req.organizacaoId),
      situacoes: regras.SITUACOES_DO_PORTAL,
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar os portais compatíveis.', erro);
  }
});

// GET /api/chat/licitacoes/:id — mensagens de uma licitação e o estado do monitor.
rotas.get('/licitacoes/:id', async (req, res) => {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'Licitação inválida.' });
  try {
    const monitoramento = await servico.obterMonitor(req.organizacaoId, id);
    if (!monitoramento) return res.status(404).json({ erro: 'Esta licitação não está no monitor de chat.' });
    const [[licitacao]] = await pool.query(
      `SELECT id, objeto, orgao_nome, uf, fim_propostas, link_disputa, link_portal
         FROM ${escopo.daOrganizacao(req.organizacaoId, { todas: true })} l WHERE id = ?`,
      [id]
    );
    res.json({ licitacao: licitacao || null, monitoramento, mensagens: await servico.listarMensagens(req.organizacaoId, id) });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar as mensagens.', erro);
  }
});

// POST /api/chat/licitacoes/:id/ligar
rotas.post('/licitacoes/:id/ligar', async (req, res) => {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'Licitação inválida.' });
  try {
    // A licitação precisa ser visível para a organização (catálogo ou dela).
    const [[existe]] = await pool.query(
      `SELECT id FROM ${escopo.daOrganizacao(req.organizacaoId, { todas: true })} l WHERE id = ?`,
      [id]
    );
    if (!existe) return res.status(404).json({ erro: 'Licitação não encontrada.' });

    // Vaga do plano: só conta se o chat desta licitação ainda não estava ligado.
    const atual = await servico.obterMonitor(req.organizacaoId, id);
    if (!(atual && atual.chat_ativo)) {
      const estouro = await limites.conferir(req.organizacaoId, 'monitores_chat');
      if (estouro) return res.status(402).json(estouro);
    }
    // O chat é uma camada do monitoramento: se ele não estava ativo, ligar também ocupa uma vaga de acompanhamento.
    if (!(atual && atual.ativo)) {
      const estouro = await limites.conferir(req.organizacaoId, 'monitoramentos');
      if (estouro) return res.status(402).json(estouro);
    }
    const monitoramento = await servico.ligar({ organizacaoId: req.organizacaoId, licitacaoId: id });
    res.json({ ok: true, monitoramento, mensagem: 'Chat ligado: a primeira leitura sai na próxima rodada do monitor.' });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível ligar o monitor de chat.', erro);
  }
});

// POST /api/chat/licitacoes/:id/desativar
rotas.post('/licitacoes/:id/desativar', async (req, res) => {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'Licitação inválida.' });
  try {
    if (!(await servico.desativar(req.organizacaoId, id))) {
      return res.status(404).json({ erro: 'Esta licitação não está no monitor de chat.' });
    }
    res.json({ ok: true, mensagem: 'Monitor de chat desligado. As mensagens já lidas continuam aqui.' });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível desligar o monitor de chat.', erro);
  }
});

// POST /api/chat/licitacoes/:id/arquivar   { arquivado: true|false }
rotas.post('/licitacoes/:id/arquivar', async (req, res) => {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'Licitação inválida.' });
  const arquivado = !(req.body && req.body.arquivado === false);
  try {
    if (!(await servico.arquivar(req.organizacaoId, id, arquivado))) {
      return res.status(404).json({ erro: 'Esta licitação não está no monitor de chat.' });
    }
    res.json({ ok: true });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível arquivar o chat.', erro);
  }
});

// POST /api/chat/licitacoes/:id/ler — marca todas as mensagens como lidas.
rotas.post('/licitacoes/:id/ler', async (req, res) => {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'Licitação inválida.' });
  try {
    res.json({ ok: true, marcadas: await servico.lerTodas(req.organizacaoId, id) });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível marcar as mensagens como lidas.', erro);
  }
});

// POST /api/chat/licitacoes/:id/checar — lê agora, sem esperar a rodada.
rotas.post('/licitacoes/:id/checar', async (req, res) => {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'Licitação inválida.' });
  try {
    const [[devido]] = await pool.query(
      `SELECT m.id, m.organizacao_id, m.licitacao_id, l.chave_externa, l.orgao_nome, l.fim_propostas,
              l.link_portal, l.link_disputa, f.adaptador, f.config AS fonte_config
         FROM monitoramentos m
         JOIN licitacoes l ON l.id = m.licitacao_id
         JOIN fontes f ON f.id = l.fonte_id
        WHERE m.organizacao_id = ? AND m.licitacao_id = ? AND m.chat_ativo = 1`,
      [req.organizacaoId, id]
    );
    if (!devido) return res.status(404).json({ erro: 'O chat desta licitação não está ligado.' });
    // Seção 5.4: "ler agora" não vira martelo no portal de terceiro.
    const atual = await servico.obterMonitor(req.organizacaoId, id);
    if (atual.chat_checado_em && Date.now() - new Date(atual.chat_checado_em).getTime() < 60 * 1000) {
      return res.status(429).json({ erro: 'O chat foi lido há menos de 1 minuto. Aguarde um pouco para ler de novo.' });
    }
    const resultado = await chatJob.checar(devido);
    res.json({ ok: true, resultado, monitoramento: await servico.obterMonitor(req.organizacaoId, id) });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível ler o chat agora.', erro);
  }
});

// PATCH /api/chat/mensagens/:id   { lida?, importante? }
rotas.patch('/mensagens/:id', async (req, res) => {
  const id = idValido(req.params.id);
  if (!id) return res.status(400).json({ erro: 'Mensagem inválida.' });
  const { lida, importante } = req.body || {};
  try {
    const feito = await servico.marcarMensagem(req.organizacaoId, id, { lida, importante });
    if (feito === null) return res.status(400).json({ erro: 'Diga o que mudar: lida e/ou importante (true ou false).' });
    if (!feito) return res.status(404).json({ erro: 'Mensagem não encontrada.' });
    res.json({ ok: true });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível alterar a mensagem.', erro);
  }
});

module.exports = rotas;
