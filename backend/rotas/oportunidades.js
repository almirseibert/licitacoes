// Tela "Oportunidades" (seção 22.4) — desertas, fracassadas e baixa
// concorrência.
const express = require('express');
const { responderErro } = require('../middlewares/responder-erro');
const pool = require('../config/db');
const estrategicas = require('../jobs/estrategicas');
const monitor = require('../servicos/monitor');

const rotas = express.Router();

// Ordenação padrão da seção 22.4: valor estimado desc, dentro de 90 dias.
const DIAS_PADRAO = 90;
const SITUACOES = ['aguardando', 'reaberta', 'virou_dispensa', 'perdida', 'descartada'];

/**
 * As três abas. `dias_desde` é calculado agora, nunca lido do banco: guardado,
 * envelheceria em silêncio e a tela diria "há 3 dias" meses depois.
 */
rotas.get('/', async (req, res) => {
  const dias = Number(req.query.dias) > 0 ? Number(req.query.dias) : DIAS_PADRAO;
  const situacao = SITUACOES.includes(req.query.situacao) ? req.query.situacao : null;

  try {
    const [retomada] = await pool.query(
      `SELECT o.*,
              DATEDIFF(CURDATE(), o.encerrada_em) AS dias_desde,
              n.objeto AS nova_objeto, n.fim_propostas AS nova_fim
         FROM oportunidades_retomada o
         LEFT JOIN licitacoes n ON n.id = o.nova_licitacao_id
        WHERE o.encerrada_em >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
          ${situacao ? 'AND o.situacao = ?' : "AND o.situacao <> 'descartada'"}
        ORDER BY o.valor_estimado DESC
        LIMIT 300`,
      situacao ? [dias, situacao] : [dias]
    );

    const baixa = await estrategicas.baixaConcorrencia({ dias });
    const urgentes = await estrategicas.iminencia({});

    const desertas = retomada.filter((o) => o.tipo === 'deserta');
    const fracassadas = retomada.filter((o) => o.tipo === 'fracassada');

    res.json({
      periodo: { dias },
      desertas,
      fracassadas,
      baixa_concorrencia: baixa.map((l) => ({
        ...l,
        dias_desde: l.encerrada_em
          ? Math.round((Date.now() - new Date(l.encerrada_em).getTime()) / 86400000)
          : null,
      })),
      // Iminência (seção 22.2): aberta, prazo acabando em menos de 24 h.
      // Prioridade máxima — vem ordenada pelo prazo mais curto primeiro.
      iminencia: urgentes.map((l) => ({
        ...l,
        horas_restantes: l.fim_propostas
          ? Math.max(0, Math.round((new Date(l.fim_propostas).getTime() - Date.now()) / 3600000))
          : null,
      })),
      resumo: {
        desertas: desertas.length,
        fracassadas: fracassadas.length,
        baixa_concorrencia: baixa.length,
        iminencia: urgentes.length,
        valor_desertas: desertas.reduce((s, o) => s + Number(o.valor_estimado || 0), 0),
        reabertas: retomada.filter((o) => o.situacao === 'reaberta').length,
      },
      // O que a tela precisa dizer ao usuário sobre a qualidade do dado, em vez
      // de deixá-lo supor que tudo tem a mesma procedência.
      ressalvas: {
        fracassada:
          'Houve interessados: leia o que desclassificou as propostas anteriores antes de montar a sua.',
        amostra:
          'Oportunidade sem item vem da amostra de encerradas: o PNCP informa que a compra fechou sem ' +
          'homologação, mas não se foi por falta de proposta ou por desclassificação de todas. Abra no portal para saber.',
        baixa_concorrencia:
          'Inferida pelo desconto, não por contagem de propostas: contratação que fechou no 1º quartil de ' +
          'desconto do grupo quase não teve com quem disputar. A contagem real de propostas é do Compras.gov.br, que hoje bloqueia.',
        iminencia:
          'É "o prazo está acabando", não "ninguém disputou ainda": o painel não tem a contagem de ' +
          'propostas de licitação aberta para a maioria das fontes. Abra o link de disputa para confirmar.',
      },
    });
  } catch (erro) {
    console.error('Erro ao listar oportunidades:', erro.message);
    responderErro(res, 500, 'Não foi possível carregar as oportunidades.', erro);
  }
});

// POST /api/oportunidades/varrer — a varredura da seção 22.3 na mão.
rotas.post('/varrer', async (_req, res) => {
  try {
    const r = await estrategicas.varrerEstrategicas({});
    res.json({
      ...r,
      mensagem:
        `${r.aguardando} oportunidade(s) de retomada aguardando` +
        (r.reaberturas.ligadas ? `, ${r.reaberturas.ligadas} reabertura(s) encontradas` : '') +
        '.',
    });
  } catch (erro) {
    console.error('Erro na varredura de estratégicas:', erro.message);
    responderErro(res, 500, 'Não foi possível varrer as estratégicas.', erro);
  }
});

// PATCH /api/oportunidades/:id — a sua decisão sobre a oportunidade.
rotas.patch('/:id', async (req, res) => {
  const { situacao, observacao } = req.body || {};
  if (situacao !== undefined && !SITUACOES.includes(situacao)) {
    return res.status(400).json({ erro: `Situação inválida. Use uma de: ${SITUACOES.join(', ')}.` });
  }
  try {
    const partes = [];
    const valores = [];
    if (situacao !== undefined) {
      partes.push('situacao = ?');
      valores.push(situacao);
    }
    if (observacao !== undefined) {
      partes.push('observacao = ?');
      valores.push(observacao || null);
    }
    if (!partes.length) return res.status(400).json({ erro: 'Nada para atualizar.' });

    const [r] = await pool.query(
      `UPDATE oportunidades_retomada SET ${partes.join(', ')} WHERE id = ?`,
      [...valores, req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ erro: 'Oportunidade não encontrada.' });
    res.json({ ok: true });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível salvar a oportunidade.', erro);
  }
});

/**
 * POST /api/oportunidades/:id/acompanhar — o botão "Acompanhar este órgão"
 * (seção 22.4).
 *
 * Acompanhar um órgão é vigiar o que ele tem aberto hoje e passar a vigiar o
 * que ele abrir: o monitoramento entra em cada licitação dele que já está na
 * base, com motivo 'orgao'.
 */
rotas.post('/:id/acompanhar', async (req, res) => {
  try {
    const [[oportunidade]] = await pool.query(
      'SELECT id, orgao_cnpj, orgao_nome FROM oportunidades_retomada WHERE id = ?',
      [req.params.id]
    );
    if (!oportunidade) return res.status(404).json({ erro: 'Oportunidade não encontrada.' });
    if (!oportunidade.orgao_cnpj) {
      return res.status(400).json({ erro: 'Esta oportunidade não tem o CNPJ do órgão para acompanhar.' });
    }

    const [licitacoes] = await pool.query(
      `SELECT id FROM licitacoes
        WHERE orgao_cnpj = ? AND descartada = 0
          AND (fim_propostas IS NULL OR fim_propostas >= DATE_SUB(NOW(), INTERVAL 30 DAY))
        LIMIT 200`,
      [oportunidade.orgao_cnpj]
    );

    for (const licitacao of licitacoes) {
      await monitor.ligar({ licitacaoId: licitacao.id, motivo: 'orgao' });
    }

    res.json({
      ok: true,
      monitoradas: licitacoes.length,
      mensagem: licitacoes.length
        ? `Acompanhando ${licitacoes.length} licitação(ões) de ${oportunidade.orgao_nome || 'este órgão'}.`
        : `${oportunidade.orgao_nome || 'Este órgão'} não tem licitação aberta na base agora — ` +
          'nada a monitorar até a próxima coleta trazer uma.',
    });
  } catch (erro) {
    console.error('Erro ao acompanhar órgão:', erro.message);
    responderErro(res, 500, 'Não foi possível acompanhar este órgão.', erro);
  }
});

module.exports = rotas;
