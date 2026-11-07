// /api/licitacoes/:id/preco e /api/licitacoes/:id/concorrentes — seção 12.
const express = require('express');
const pool = require('../config/db');
const servico = require('../servicos/preco');
const encerradas = require('../jobs/encerradas');
const adaptadores = require('../adaptadores');

const rotas = express.Router({ mergeParams: true });

// GET /preco — o bloco "fecha normalmente por X" da seção 12.
rotas.get('/preco', async (req, res) => {
  try {
    const resumo = await servico.resumoDaLicitacao(Number(req.params.id));
    if (!resumo) return res.status(404).json({ erro: 'Licitação não encontrada.' });
    res.json(resumo);
  } catch (erro) {
    res.status(500).json({ erro: 'Não foi possível montar o preço de referência.', detalhe: erro.message });
  }
});

// PATCH /preco — grava o seu custo. É o campo que transforma faixa em decisão.
rotas.patch('/preco', async (req, res) => {
  const bruto = (req.body || {}).custo_estimado;

  try {
    let custo = null;
    if (bruto !== null && bruto !== undefined && bruto !== '') {
      custo = Number(bruto);
      if (!Number.isFinite(custo) || custo < 0) {
        return res.status(400).json({ erro: 'Informe o custo como um número igual ou maior que zero.' });
      }
    }

    const [r] = await pool.query('UPDATE licitacoes SET custo_estimado = ? WHERE id = ?', [
      custo,
      req.params.id,
    ]);
    if (!r.affectedRows) return res.status(404).json({ erro: 'Licitação não encontrada.' });

    res.json(await servico.resumoDaLicitacao(Number(req.params.id)));
  } catch (erro) {
    res.status(500).json({ erro: 'Não foi possível salvar o custo.', detalhe: erro.message });
  }
});

// GET /concorrentes — quem disputou esta licitação.
rotas.get('/concorrentes', async (req, res) => {
  try {
    const dados = await servico.concorrentesDa(Number(req.params.id));

    // Se não há linha nenhuma, a tela precisa saber se é porque ninguém venceu
    // ainda ou porque a fonte não publica. Daí o link para abrir à mão.
    const [[licitacao]] = await pool.query(
      'SELECT link_disputa, plataforma_disputa FROM licitacoes WHERE id = ?',
      [req.params.id]
    );
    const comprasgov = adaptadores.obter('comprasgov');
    const compraId = licitacao && comprasgov.idDaCompra(licitacao.link_disputa);

    res.json({
      ...dados,
      plataforma: licitacao && licitacao.plataforma_disputa,
      // Lista completa de propostas só existe no Compras.gov.br, e lá só com
      // CAPTCHA (seção 5.2): o painel entrega o link, não força a entrada.
      link_propostas: compraId ? comprasgov.linkDaCompra(compraId) : licitacao && licitacao.link_disputa,
      aviso: dados.dados.length
        ? null
        : 'Nenhum resultado publicado ainda. Quando o órgão homologar, o botão abaixo busca o vencedor de cada item.',
    });
  } catch (erro) {
    res.status(500).json({ erro: 'Não foi possível carregar os concorrentes.', detalhe: erro.message });
  }
});

// POST /concorrentes — busca no portal o vencedor de cada item, agora.
rotas.post('/concorrentes', async (req, res) => {
  try {
    const r = await encerradas.registrarResultados({ licitacaoId: Number(req.params.id) });
    res.json({
      ok: true,
      ...r,
      mensagem:
        r.aviso ||
        `${r.gravados} resultado(s) gravado(s) em ${r.itens} item(ns)` +
          (r.sem_resultado ? `; ${r.sem_resultado} ainda sem resultado.` : '.'),
    });
  } catch (erro) {
    const status = erro.message === 'Licitação não encontrada.' ? 404 : 400;
    res.status(status).json({ erro: erro.message });
  }
});

module.exports = rotas;
