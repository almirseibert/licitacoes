// /api/licitacoes/:id/propostas — gerador de proposta (seções 13 e 19).
//
// O painel não assina nada (seção 17.7): entrega o PDF pronto para assinar e o
// XLSX com as fórmulas vivas, para o edital que exige planilha editável.
const fs = require('fs');
const express = require('express');
const { responderErro } = require('../middlewares/responder-erro');
const servico = require('../servicos/proposta');
const arquivos = require('../servicos/arquivos');

const rotas = express.Router({ mergeParams: true });

const TIPOS = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

// GET — as propostas desta licitação.
rotas.get('/', async (req, res) => {
  try {
    res.json({ dados: await servico.listar(Number(req.params.id)) });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar as propostas.', erro);
  }
});

// POST — cria a proposta puxando os itens do edital (seção 19.2, item 1).
rotas.post('/', async (req, res) => {
  try {
    const criada = await servico.criar({
      licitacaoId: Number(req.params.id),
      perfilId: (req.body || {}).perfil_id || null,
    });
    const completa = await servico.obter(criada.id);
    res.status(201).json({
      ok: true,
      id: criada.id,
      ...completa,
      mensagem: criada.itens
        ? `Proposta criada com ${criada.itens} item(ns) do edital. Informe custo e margem.`
        : 'Proposta criada, mas o edital ainda não tem itens cadastrados. Use "rebuscar no portal".',
    });
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

rotas.get('/:propostaId', async (req, res) => {
  try {
    const completa = await servico.obter(Number(req.params.propostaId));
    if (!completa) return res.status(404).json({ erro: 'Proposta não encontrada.' });
    res.json(completa);
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar a proposta.', erro);
  }
});

// PATCH — validade, prazos, garantia, pagamento, dados bancários, status.
rotas.patch('/:propostaId', async (req, res) => {
  try {
    res.json(await servico.atualizar(Number(req.params.propostaId), req.body || {}));
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

// PATCH do item — custo, margem, preço, marca/modelo, disputar.
rotas.patch('/:propostaId/itens/:itemId', async (req, res) => {
  try {
    res.json(
      await servico.atualizarItem(Number(req.params.propostaId), Number(req.params.itemId), req.body || {})
    );
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

// POST margem — a mesma margem em todos os itens com custo informado.
rotas.post('/:propostaId/margem', async (req, res) => {
  try {
    const completa = await servico.margemEmLote(Number(req.params.propostaId), (req.body || {}).margem_pct);
    res.json({ ok: true, ...completa, mensagem: 'Margem aplicada aos itens com custo informado.' });
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

// POST itens — traz os itens que chegaram ao edital depois.
rotas.post('/:propostaId/itens', async (req, res) => {
  try {
    const r = await servico.puxarItens(Number(req.params.propostaId));
    const completa = await servico.obter(Number(req.params.propostaId));
    res.json({
      ok: true,
      ...completa,
      mensagem: r.aviso || (r.copiados ? `${r.copiados} item(ns) novo(s) do edital.` : 'Nenhum item novo no edital.'),
    });
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

// POST saida — gera o PDF e o XLSX (seção 19.3).
rotas.post('/:propostaId/saida', async (req, res) => {
  try {
    res.status(201).json({ ok: true, ...(await servico.gerarSaida(Number(req.params.propostaId))) });
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

// GET do arquivo gerado. `?baixar=1` força download; sem isso abre na tela.
rotas.get('/:propostaId/arquivo/:formato', async (req, res) => {
  try {
    const formato = String(req.params.formato).toLowerCase();
    if (!TIPOS[formato]) return res.status(400).json({ erro: 'Formato inválido. Use pdf ou xlsx.' });

    const completa = await servico.obter(Number(req.params.propostaId));
    if (!completa) return res.status(404).json({ erro: 'Proposta não encontrada.' });

    const caminho = formato === 'pdf' ? completa.proposta.arquivo_pdf : completa.proposta.arquivo_xlsx;
    if (!caminho) return res.status(404).json({ erro: 'Gere a proposta antes de abrir o arquivo.' });
    if (!arquivos.dentroDoVolume(caminho)) return res.status(400).json({ erro: 'Caminho de arquivo inválido.' });

    const absoluto = arquivos.caminhoAbsoluto(caminho);
    if (!fs.existsSync(absoluto)) {
      return res.status(410).json({ erro: 'O arquivo não está mais no volume. Gere a proposta de novo.' });
    }

    const nome = caminho.split('/').pop();
    res.setHeader('Content-Type', TIPOS[formato]);
    res.setHeader(
      'Content-Disposition',
      `${req.query.baixar ? 'attachment' : 'inline'}; filename="${encodeURIComponent(nome)}"`
    );
    fs.createReadStream(absoluto).pipe(res);
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível entregar o arquivo.', erro);
  }
});

rotas.delete('/:propostaId', async (req, res) => {
  try {
    res.json(await servico.remover(Number(req.params.propostaId)));
  } catch (erro) {
    res.status(404).json({ erro: erro.message });
  }
});

module.exports = rotas;
