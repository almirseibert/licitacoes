// /api/licitacoes/:id/declaracoes — gera as declarações já preenchidas com os
// dados desta licitação (seções 13 e 18).
//
// O painel não assina nada (seção 17.7): entrega o PDF pronto para você assinar
// no gov.br ou com seu certificado.
const express = require('express');
const pool = require('../config/db');
const arquivos = require('../servicos/arquivos');
const pacote = require('../servicos/pacote');
const envio = require('../servicos/envio');
const declaracao = require('../servicos/declaracao');

const rotas = express.Router({ mergeParams: true });

async function contexto(organizacaoId, licitacaoId) {
  const [[licitacao]] = await pool.query('SELECT * FROM licitacoes WHERE id = ?', [licitacaoId]);
  if (!licitacao) throw new Error('Licitação não encontrada.');
  const perfil = await envio.perfilPadrao(organizacaoId, null);
  return { licitacao, perfil, dados: declaracao.variaveis({ licitacao, perfil }) };
}

// GET — o que entraria, sem gerar nada.
rotas.get('/', async (req, res) => {
  try {
    const montagem = await envio.montar({ organizacaoId: req.organizacaoId, licitacaoId: Number(req.params.id) });
    res.json({ dados: montagem.declaracoes });
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

rotas.post('/', async (req, res) => {
  try {
    const corpo = req.body || {};
    const montagem = await envio.montar({ organizacaoId: req.organizacaoId, licitacaoId: Number(req.params.id) });
    const ids = Array.isArray(corpo.modelos) && corpo.modelos.length
      ? corpo.modelos.map(Number)
      : montagem.declaracoes.filter((d) => d.marcado).map((d) => d.modelo_id);

    if (!ids.length) return res.status(400).json({ erro: 'Escolha ao menos uma declaração.' });

    const { dados } = await contexto(req.organizacaoId, req.params.id);
    const [modelos] = await pool.query(
      `SELECT * FROM modelos_declaracao
        WHERE (organizacao_id IS NULL OR organizacao_id = ?) AND id IN (${ids.map(() => '?').join(',')})`,
      [req.organizacaoId, ...ids]
    );

    const geradas = [];
    for (const modelo of modelos) {
      const { texto, faltando } = declaracao.preencher(modelo.corpo, dados);
      const bytes = await declaracao.gerarPdf({ titulo: modelo.titulo, texto, dados });
      const nome = `${arquivos.limpar(modelo.titulo).replace(/\s+/g, '_').slice(0, 80)}.pdf`;
      const salvo = await pacote.gravar(`org/${req.organizacaoId}/declaracoes/${req.params.id}`, nome, bytes);
      geradas.push({
        modelo_id: modelo.id, titulo: modelo.titulo, arquivo: nome,
        faltando, tamanho: salvo.tamanho,
      });
    }

    const comLacuna = geradas.filter((g) => g.faltando.length);
    res.status(201).json({
      ok: true,
      geradas,
      mensagem: comLacuna.length
        ? `${geradas.length} declaração(ões) gerada(s), ${comLacuna.length} com lacuna — complete o perfil da empresa em Configurações.`
        : `${geradas.length} declaração(ões) gerada(s) com os dados desta licitação.`,
    });
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

// GET /:modeloId — a declaração desta licitação, em PDF, para conferir na tela.
rotas.get('/:modeloId', async (req, res) => {
  try {
    const [[modelo]] = await pool.query(
      'SELECT * FROM modelos_declaracao WHERE id = ? AND (organizacao_id IS NULL OR organizacao_id = ?)',
      [req.params.modeloId, req.organizacaoId]
    );
    if (!modelo) return res.status(404).json({ erro: 'Modelo não encontrado.' });

    const { dados } = await contexto(req.organizacaoId, req.params.id);
    const { texto } = declaracao.preencher(modelo.corpo, dados);
    const bytes = await declaracao.gerarPdf({ titulo: modelo.titulo, texto, dados });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(`${modelo.titulo}.pdf`)}"`);
    res.send(bytes);
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

module.exports = rotas;
