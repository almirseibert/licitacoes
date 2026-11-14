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

// GET, POST, /docx e /email trabalham sobre a ficha: carregada uma vez aqui.
async function carregarFicha(req, res, next) {
  try {
    // `req` é desta requisição só; nada mais escreve nele entre o await e aqui.
    // eslint-disable-next-line require-atomic-updates
    req.ficha = await resumo.obter(req.organizacaoId, idLicitacao(req));
    if (!req.ficha) return res.status(404).json({ erro: 'Licitação não encontrada.' });
    return next();
  } catch (erro) {
    return responderErro(res, 500, 'Não foi possível carregar o resumo do edital.', erro);
  }
}

function exigirFicha(req, res, next) {
  if (!req.ficha.dados) return res.status(409).json({ erro: 'Gere o resumo do edital antes.' });
  return next();
}

// GET — a ficha guardada (ou nada), se a IA está ligada e as considerações.
rotas.get('/', carregarFicha, (req, res) => {
  res.json({ disponivel: ia.disponivel(), motivo: ia.disponivel() ? null : DESLIGADA, ...req.ficha });
});

// POST — gera a ficha. Só refaz a pedido (`forcar`); a guardada não custa nada.
rotas.post('/', carregarFicha, async (req, res) => {
  const forcar = Boolean(req.body && req.body.forcar === true);
  const { ficha } = req;
  try {
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
      ...resumo.comDados(ficha, r.dados),
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
    if (!(await resumo.existe(idLicitacao(req)))) return res.status(404).json({ erro: 'Licitação não encontrada.' });
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

// GET /docx — o checklist em Word.
rotas.get('/docx', carregarFicha, exigirFicha, (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="resumo_edital_${req.ficha.licitacao.id}.docx"`);
    res.send(resumo.gerarDocx(req.ficha));
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível gerar o .docx.', erro);
  }
});

// POST /email — o checklist para o e-mail de quem pediu (só para si: não vira
// canal de envio para terceiros), com o .docx anexo.
rotas.post('/email', carregarFicha, exigirFicha, async (req, res) => {
  const { ficha } = req;
  try {
    const para = req.usuario && req.usuario.email;
    if (!para) return res.status(400).json({ erro: 'Sua conta não tem e-mail cadastrado.' });
    const r = await email.enviarTransacional({
      para,
      assunto: ficha.titulo,
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
