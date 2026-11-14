// Resumo do Edital 2.0 (Seção 11 do plano SaaS) — montada em
// /api/licitacoes/:id/resumo-edital, atrás do recurso 'ia' do plano.
//
// A ficha é do edital (catálogo); as considerações, o e-mail e o limite do
// mês são da organização. Gera uma vez: POST sem `forcar` devolve a guardada.
const express = require('express');
const { responderErro } = require('../middlewares/responder-erro');
const ia = require('../servicos/ia');
const limites = require('../servicos/limites');
const email = require('../servicos/email');
const resumo = require('../servicos/resumo-edital');

const rotas = express.Router({ mergeParams: true });
const idLicitacao = (req) => Number(req.params.id);

const DESLIGADA = 'O Resumo do Edital está desligado no servidor (sem chave da IA configurada, ou IA_ATIVA=false). O resto do painel funciona sem ele.';

// Falha do modelo → mensagem para quem usa; o técnico vai para o log.
const FALHAS = {
  http: 'A IA não respondeu agora. Tente de novo em instantes.',
  timeout: 'A IA demorou demais para responder. Tente de novo em instantes.',
  rede: 'Não foi possível falar com a IA agora. Tente de novo em instantes.',
  formato: 'A IA respondeu fora do formato esperado e a ficha foi descartada. Tente gerar de novo.',
  cortada: 'A ficha deste edital ficou maior que o teto de resposta da IA. Avise o suporte: o teto precisa subir.',
  vazia: 'A IA devolveu uma resposta vazia. Tente gerar de novo.',
};

async function carregar(req, res) {
  const ficha = await resumo.obter(req.organizacaoId, idLicitacao(req));
  if (!ficha) res.status(404).json({ erro: 'Licitação não encontrada.' });
  return ficha;
}

// GET — a ficha guardada (ou nada), se a IA está ligada e as considerações.
rotas.get('/', async (req, res) => {
  try {
    const ficha = await carregar(req, res);
    if (!ficha) return;
    res.json({ disponivel: ia.disponivel(), motivo: ia.disponivel() ? null : DESLIGADA, ...ficha });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar o resumo do edital.', erro);
  }
});

// POST — gera a ficha. Só refaz a pedido (`forcar`); a guardada não custa nada.
rotas.post('/', async (req, res) => {
  const forcar = Boolean(req.body && req.body.forcar === true);
  try {
    const ficha = await carregar(req, res);
    if (!ficha) return;
    if (ficha.dados && !forcar) {
      return res.json({ ...ficha, cache: true, mensagem: 'Este edital já foi resumido. Use "gerar de novo" para refazer.' });
    }
    if (!ia.disponivel()) return res.status(409).json({ erro: DESLIGADA });
    const estouro = await limites.conferir(req.organizacaoId, 'ia_resumos_mes');
    if (estouro) return res.status(402).json(estouro);

    const r = await resumo.gerar({ licitacaoId: idLicitacao(req), forcar });
    if (r.chamouModelo) await limites.registrarUso(req.organizacaoId, 'ia_resumos_mes');
    if (!r.ok) {
      if (r.codigo === 'sem_texto') return res.status(422).json({ erro: r.motivo });
      console.error('Resumo do edital:', r.motivo);
      return res.status(['formato', 'cortada'].includes(r.codigo) ? 422 : 502).json({ erro: FALHAS[r.codigo] || FALHAS.http });
    }
    res.json({
      ...(await resumo.obter(req.organizacaoId, idLicitacao(req))),
      cache: r.cache,
      mensagem: r.cache
        ? 'Ficha recuperada do cache, sem custo novo.'
        : 'Edital resumido. Confira cada item no trecho citado: a IA pode errar.',
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível resumir o edital.', erro);
  }
});

// PUT /consideracoes — o campo livre da organização.
rotas.put('/consideracoes', async (req, res) => {
  const texto = req.body && req.body.texto;
  if (typeof texto !== 'string') return res.status(400).json({ erro: 'Envie o texto das considerações.' });
  if (texto.length > resumo.MAX_CONSIDERACOES) {
    return res.status(400).json({ erro: `As considerações passam de ${resumo.MAX_CONSIDERACOES} caracteres.` });
  }
  try {
    const ficha = await carregar(req, res);
    if (!ficha) return;
    await resumo.salvarConsideracoes({
      organizacaoId: req.organizacaoId,
      licitacaoId: idLicitacao(req),
      usuarioId: req.usuario && req.usuario.id,
      texto,
    });
    res.json({ ok: true });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível salvar as considerações.', erro);
  }
});

async function fichaPronta(req, res) {
  const ficha = await carregar(req, res);
  if (!ficha) return null;
  if (!ficha.dados) {
    res.status(409).json({ erro: 'Gere o resumo do edital antes.' });
    return null;
  }
  return ficha;
}

// GET /docx — o checklist em Word.
rotas.get('/docx', async (req, res) => {
  try {
    const ficha = await fichaPronta(req, res);
    if (!ficha) return;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="resumo_edital_${ficha.licitacao.id}.docx"`);
    res.send(resumo.gerarDocx(ficha));
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível gerar o .docx.', erro);
  }
});

// POST /email — o checklist para o e-mail de quem pediu (só para si: não vira
// canal de envio para terceiros), com o .docx anexo.
rotas.post('/email', async (req, res) => {
  try {
    const ficha = await fichaPronta(req, res);
    if (!ficha) return;
    const para = req.usuario && req.usuario.email;
    if (!para) return res.status(400).json({ erro: 'Sua conta não tem e-mail cadastrado.' });
    const r = await email.enviarTransacional({
      para,
      assunto: resumo.tituloDe(ficha),
      texto: resumo.textoDoEmail(ficha),
      anexos: [{ filename: `resumo_edital_${ficha.licitacao.id}.docx`, content: resumo.gerarDocx(ficha) }],
    });
    if (!r.enviado) {
      console.error('Resumo do edital por e-mail:', r.motivo);
      return res.status(409).json({ erro: 'O envio de e-mail não está configurado no servidor. Baixe o .docx ou imprima.' });
    }
    res.json({ ok: true, mensagem: `Checklist enviado para ${para}.` });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível enviar o e-mail.', erro);
  }
});

module.exports = rotas;
