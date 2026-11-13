// Contratos e marcos de execução (seção 28).
const express = require('express');
const { responderErro } = require('../middlewares/responder-erro');
const servico = require('../servicos/contrato');
const job = require('../jobs/contratos');
const regras = require('../regras/contrato');

const rotas = express.Router();

// GET /api/contratos — a lista da tela, com faturado em 12 meses no topo.
rotas.get('/', async (req, res) => {
  try {
    const [dados, receita] = await Promise.all([
      servico.listar({ organizacaoId: req.organizacaoId, situacao: req.query.situacao || null }),
      servico.receita12m(req.organizacaoId),
    ]);
    res.json({
      dados,
      receita,
      situacoes: servico.SITUACOES,
      marcos_padrao: regras.MARCOS.map((m) => ({ tipo: m.tipo, titulo: m.titulo, nota: m.nota })),
    });
  } catch (erro) {
    console.error('Erro ao listar contratos:', erro.message);
    responderErro(res, 500, 'Não foi possível listar os contratos.', erro);
  }
});

// GET /api/contratos/:id — um contrato com os marcos.
rotas.get('/:id', async (req, res) => {
  try {
    const r = await servico.ver(req.organizacaoId, Number(req.params.id));
    if (!r) return res.status(404).json({ erro: 'Contrato não encontrado.' });
    res.json(r);
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível abrir o contrato.', erro);
  }
});

// POST /api/contratos — registra o contrato de uma licitação ganha, com o
// checklist da seção 28.3. O card em "Ganhamos" já faz isso sozinho; esta rota
// é para o contrato que você quer abrir à mão.
rotas.post('/', async (req, res) => {
  const licitacaoId = Number((req.body || {}).licitacao_id);
  if (!licitacaoId) return res.status(400).json({ erro: 'Informe a licitação do contrato.' });

  try {
    const r = await servico.abrir(req.organizacaoId, licitacaoId, { convocadoEm: (req.body || {}).convocado_em || null });

    // Os campos que vieram no mesmo corpo entram agora, para a tela não precisar
    // de duas requisições para registrar um contrato já assinado.
    const corpo = { ...(req.body || {}) };
    delete corpo.licitacao_id;
    delete corpo.convocado_em;

    const completo = Object.keys(corpo).length
      ? await servico.salvar(req.organizacaoId, r.contrato.id, corpo)
      : await servico.ver(req.organizacaoId, r.contrato.id);

    res.status(r.criado ? 201 : 200).json({
      ...completo,
      criado: r.criado,
      mensagem: r.criado
        ? `Contrato aberto com ${r.marcos_criados} marco(s) no checklist.`
        : 'Esta licitação já tinha contrato registrado.' +
          (r.marcos_criados ? ` ${r.marcos_criados} marco(s) novos entraram no checklist.` : ''),
    });
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

// PATCH /api/contratos/:id
rotas.patch('/:id', async (req, res) => {
  try {
    const r = await servico.salvar(req.organizacaoId, Number(req.params.id), req.body || {});
    if (!r) return res.status(404).json({ erro: 'Contrato não encontrado.' });
    res.json({ ...r, mensagem: 'Contrato salvo.' });
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

// POST /api/contratos/:id/marcos — marco à mão (medição mensal, por exemplo).
rotas.post('/:id/marcos', async (req, res) => {
  try {
    const marco = await servico.criarMarco(req.organizacaoId, Number(req.params.id), req.body || {});
    if (!marco) return res.status(404).json({ erro: 'Contrato não encontrado.' });
    res.status(201).json({ marco, mensagem: 'Marco acrescentado.' });
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

// PATCH /api/contratos/:id/marcos/:marcoId — data prevista e conclusão.
rotas.patch('/:id/marcos/:marcoId', async (req, res) => {
  try {
    const marco = await servico.salvarMarco(req.organizacaoId, Number(req.params.marcoId), req.body || {});
    if (!marco) return res.status(404).json({ erro: 'Marco não encontrado.' });
    res.json({ marco, mensagem: marco.concluido_em ? 'Marco concluído.' : 'Marco salvo.' });
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

// DELETE /api/contratos/:id/marcos/:marcoId — só os acrescentados à mão.
rotas.delete('/:id/marcos/:marcoId', async (req, res) => {
  try {
    const removeu = await servico.removerMarco(req.organizacaoId, Number(req.params.marcoId));
    if (removeu === null) return res.status(404).json({ erro: 'Marco não encontrado.' });
    if (!removeu) {
      return res.status(400).json({
        erro: 'Marco do checklist automático não se apaga — ele volta no próximo recálculo. Para tirá-lo da frente, conclua-o.',
      });
    }
    res.json({ ok: true });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível remover o marco.', erro);
  }
});

// POST /api/contratos/avisos — roda os alertas de marco agora (diário no worker).
rotas.post('/avisos/rodar', async (req, res) => {
  try {
    const r = await job.rodar({ organizacaoId: req.organizacaoId });
    res.json({
      ...r,
      mensagem:
        `${r.criados} alerta(s) criados de ${r.marcos_abertos} marco(s) abertos` +
        (r.atrasados ? `, ${r.atrasados} atrasado(s)` : '') + '.',
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível rodar os avisos.', erro);
  }
});

module.exports = rotas;
