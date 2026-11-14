// Pergunte ao Edital (Seção 5 do plano SaaS) — montada em
// /api/licitacoes/:id/perguntas, atrás do recurso 'ia' do plano.
//
// A resposta é assíncrona: POST devolve 202 com o id e a tela consulta
// GET /:pid até sair de 'pendente'. A licitação é do catálogo (sem
// organização); a pergunta, a resposta e o "salvar" são da organização.
const express = require('express');
const { responderErro } = require('../middlewares/responder-erro');
const pool = require('../config/db');
const ia = require('../servicos/ia');
const limites = require('../servicos/limites');
const perguntas = require('../servicos/perguntas-edital');
const biblioteca = require('../config/dados/perguntas-edital');

const rotas = express.Router({ mergeParams: true });

const idLicitacao = (req) => Number(req.params.id);

async function licitacaoExiste(id) {
  const [[l]] = await pool.query('SELECT id FROM licitacoes WHERE id = ?', [id]);
  return Boolean(l);
}

// GET — histórico desta licitação na organização, biblioteca e se está ligado.
rotas.get('/', async (req, res) => {
  try {
    if (!(await licitacaoExiste(idLicitacao(req)))) return res.status(404).json({ erro: 'Licitação não encontrada.' });
    const dados = await perguntas.listar(req.organizacaoId, idLicitacao(req));
    res.json({
      disponivel: ia.disponivel(),
      motivo: ia.disponivel()
        ? null
        : 'O Pergunte ao Edital está desligado: o servidor não tem GEMINI_API_KEY configurada. O resto do painel funciona sem ela.',
      categorias: biblioteca.CATEGORIAS,
      prontas: biblioteca.PERGUNTAS.map(({ codigo, categoria, subtipo, pergunta }) => ({ codigo, categoria, subtipo, pergunta })),
      dados,
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar as perguntas.', erro);
  }
});

// POST — faz a pergunta (texto livre ou `pronta`), responde 202 com o id.
rotas.post('/', async (req, res) => {
  const pedido = perguntas.lerPedido(req.body || {});
  if (pedido.erro) return res.status(400).json({ erro: pedido.erro });
  if (!ia.disponivel()) {
    return res.status(409).json({ erro: 'O Pergunte ao Edital está desligado: falta configurar GEMINI_API_KEY no servidor.' });
  }

  try {
    const licitacaoId = idLicitacao(req);
    if (!(await licitacaoExiste(licitacaoId))) return res.status(404).json({ erro: 'Licitação não encontrada.' });

    // Conferência e INSERT não são atômicas: pedidos simultâneos da mesma
    // organização podem passar juntos. O estouro fica limitado ao número de
    // pedidos no mesmo instante — aceito em troca de não travar a tabela.
    const estouro = await limites.conferir(req.organizacaoId, 'ia_perguntas_mes');
    if (estouro) return res.status(402).json(estouro);
    if ((await perguntas.pendentes(req.organizacaoId)) >= perguntas.MAX_PENDENTES) {
      return res.status(429).json({ erro: `Já há ${perguntas.MAX_PENDENTES} perguntas sendo respondidas. Espere uma terminar.` });
    }

    const id = await perguntas.criar({
      organizacaoId: req.organizacaoId,
      licitacaoId,
      usuarioId: (req.usuario && req.usuario.id) || null,
      pergunta: pedido.pergunta,
      pronta: pedido.pronta,
    });
    // Fora da requisição: a tela não fica presa esperando o modelo.
    // `processar` não lança; o catch é só para nada escapar como unhandledRejection.
    setImmediate(() =>
      perguntas
        .processar({ organizacaoId: req.organizacaoId, id, dicas: pedido.dicas })
        .catch((erro) => console.error('Pergunte ao Edital —', id, erro.message))
    );
    res.status(202).json({ id, situacao: 'pendente', mensagem: 'Pergunta recebida. A resposta aparece aqui em instantes.' });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível registrar a pergunta.', erro);
  }
});

// GET /:pid — uma pergunta (a tela consulta enquanto está pendente).
rotas.get('/:pid', async (req, res) => {
  try {
    const p = await perguntas.obter(req.organizacaoId, idLicitacao(req), Number(req.params.pid));
    if (!p) return res.status(404).json({ erro: 'Pergunta não encontrada.' });
    res.json(p);
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar a pergunta.', erro);
  }
});

// PATCH /:pid — { salva: true|false }.
rotas.patch('/:pid', async (req, res) => {
  const salva = req.body && req.body.salva;
  if (typeof salva !== 'boolean') return res.status(400).json({ erro: 'Use salva: true ou false.' });
  try {
    const ok = await perguntas.marcarSalva(req.organizacaoId, idLicitacao(req), Number(req.params.pid), salva);
    if (!ok) return res.status(404).json({ erro: 'Pergunta não encontrada.' });
    res.json({ ok: true, mensagem: salva ? 'Pergunta salva nesta licitação.' : 'Pergunta tirada das salvas.' });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível salvar a pergunta.', erro);
  }
});

module.exports = rotas;
