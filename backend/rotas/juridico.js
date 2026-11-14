// Consultor jurídico e biblioteca "Jurídico Fácil" (Seção 16 do plano SaaS), montada em
// /api/juridico atrás do recurso 'consultor_juridico' do plano.
//
// A base (artigos e guias) é conteúdo fixo do painel e é de todos; a conversa é da pessoa.
// A resposta do chat é assíncrona: POST devolve 202 com o id e a tela consulta até sair de
// 'pendente'. Leitor da organização só lê (o `leitorSoLe` barra o POST).
const express = require('express');
const { responderErro } = require('../middlewares/responder-erro');
const ia = require('../servicos/ia');
const limites = require('../servicos/limites');
const servico = require('../servicos/juridico');
const regras = require('../regras/juridico');
const base = require('../config/dados/juridico');

const rotas = express.Router();

const numero = (v) => Number(v);
const usuarioId = (req) => (req.usuario && req.usuario.id) || null;
const texto = (v, max = 80) => (typeof v === 'string' ? v.slice(0, max) : '');

// GET /sobre — avisos, estado da revisão, temas e se a IA está ligada.
rotas.get('/sobre', (_req, res) => {
  const revisao = regras.revisao();
  res.json({
    aviso: regras.AVISO,
    aviso_minuta: revisao.revisado_por_advogado ? null : regras.AVISO_MINUTA,
    ...revisao,
    ia_disponivel: ia.disponivel(),
    motivo_ia: ia.disponivel() ? null : 'O chat está sem IA neste servidor: as perguntas recebem os artigos da base, sem resposta escrita.',
    temas: base.TEMAS,
    total_artigos: base.ARTIGOS.length,
    total_guias: base.GUIAS.length,
    exemplos: ['Até quando posso impugnar um edital?', 'Quanto o órgão pode pedir de garantia do contrato?', 'Como funciona o empate ficto para ME e EPP?'],
  });
});

// ------------------------------------------------------------- biblioteca
rotas.get('/biblioteca', (req, res) => {
  const lista = regras.buscarNaBiblioteca(texto(req.query.q, 100), texto(req.query.tema, 30));
  res.json({ temas: base.TEMAS, dados: lista.map(({ id, tema, titulo, resumo }) => ({ id, tema, titulo, resumo })) });
});

rotas.get('/biblioteca/:id', (req, res) => {
  const guia = base.GUIA_POR_ID.get(req.params.id);
  if (!guia) return res.status(404).json({ erro: 'Guia não encontrado.' });
  res.json({ ...guia, tema_nome: base.TEMAS[guia.tema], artigos: guia.artigos.map((id) => regras.resumoDoArtigo(base.POR_ID.get(id))) });
});

rotas.get('/artigos', (req, res) => {
  const lista = regras.pesquisarArtigos(texto(req.query.q, 100), texto(req.query.tema, 30));
  res.json({ dados: lista.map(regras.resumoDoArtigo) });
});

rotas.get('/artigos/:id', (req, res) => {
  const artigo = base.POR_ID.get(req.params.id);
  if (!artigo) return res.status(404).json({ erro: 'Artigo não encontrado na base.' });
  res.json(regras.resumoDoArtigo(artigo));
});

// ------------------------------------------------------------------- chat
rotas.get('/conversas', async (req, res) => {
  try {
    res.json({ dados: await servico.listarConversas(req.organizacaoId, usuarioId(req)) });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar as conversas.', erro);
  }
});

// "Novo chat": uma conversa vazia; o título nasce da primeira pergunta.
rotas.post('/conversas', async (req, res) => {
  try {
    const id = await servico.criarConversa(req.organizacaoId, usuarioId(req));
    res.status(201).json({ id });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível abrir a conversa.', erro);
  }
});

rotas.get('/conversas/:id', async (req, res) => {
  try {
    const conversa = await servico.obterConversa(req.organizacaoId, usuarioId(req), numero(req.params.id));
    if (!conversa) return res.status(404).json({ erro: 'Conversa não encontrada.' });
    res.json(conversa);
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar a conversa.', erro);
  }
});

rotas.delete('/conversas/:id', async (req, res) => {
  try {
    const ok = await servico.apagarConversa(req.organizacaoId, usuarioId(req), numero(req.params.id));
    if (!ok) return res.status(404).json({ erro: 'Conversa não encontrada.' });
    res.json({ ok: true });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível apagar a conversa.', erro);
  }
});

rotas.post('/conversas/:id/mensagens', async (req, res) => {
  const pedido = regras.lerPedido(req.body || {});
  if (pedido.erro) return res.status(400).json({ erro: pedido.erro });
  try {
    const conversaId = numero(req.params.id);
    const [conversa, estouro, emAndamento] = await Promise.all([
      servico.obterConversa(req.organizacaoId, usuarioId(req), conversaId),
      // Sem IA a pergunta não custa nada: o limite só vale com o modelo ligado.
      ia.disponivel() ? limites.conferir(req.organizacaoId, 'ia_juridico_mes') : null,
      servico.pendentes(req.organizacaoId),
    ]);
    if (!conversa) return res.status(404).json({ erro: 'Conversa não encontrada.' });
    if (estouro) return res.status(402).json(estouro);
    if (emAndamento >= servico.MAX_PENDENTES) {
      return res.status(429).json({ erro: `Já há ${servico.MAX_PENDENTES} perguntas sendo respondidas. Espere uma terminar.` });
    }
    const id = await servico.criarMensagem(req.organizacaoId, conversaId, pedido.pergunta);
    // Fora da requisição: a tela não fica presa esperando o modelo. `processar` não lança.
    setImmediate(() => servico.processar({ organizacaoId: req.organizacaoId, id }).catch((erro) => console.error('Consultor jurídico —', id, erro.message)));
    res.status(202).json({ id, situacao: 'pendente', mensagem: 'Pergunta recebida. A resposta aparece aqui em instantes.' });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível registrar a pergunta.', erro);
  }
});

rotas.get('/conversas/:id/mensagens/:mid', async (req, res) => {
  try {
    const m = await servico.obterMensagem(req.organizacaoId, usuarioId(req), numero(req.params.id), numero(req.params.mid));
    if (!m) return res.status(404).json({ erro: 'Pergunta não encontrada.' });
    res.json(m);
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar a pergunta.', erro);
  }
});

module.exports = rotas;
