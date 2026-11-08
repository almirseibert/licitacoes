// Tela "Calendário" (seção 24.4) — as recorrências previstas por mês.
//
// Serve para planejar o ano: em que mês vale ter certidão em dia e caixa para
// garantia.
const express = require('express');
const { responderErro } = require('../middlewares/responder-erro');
const pool = require('../config/db');
const recorrencias = require('../jobs/recorrencias');
const alertas = require('../servicos/alertas');

const rotas = express.Router();

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

// GET /api/calendario — doze meses à frente, mais o histórico sem previsão.
rotas.get('/', async (req, res) => {
  const confiancaMinima = Number(req.query.confianca) >= 0 ? Number(req.query.confianca) : 0;

  try {
    const [linhas] = await pool.query(
      `SELECT *, DATEDIFF(proxima_prevista, CURDATE()) AS faltam
         FROM recorrencias
        WHERE confianca >= ?
        ORDER BY proxima_prevista IS NULL, proxima_prevista ASC, valor_medio DESC`,
      [confiancaMinima]
    );

    // Doze casas, a partir do mês corrente — é como o ano se planeja, não de
    // janeiro a dezembro.
    const hoje = new Date();
    const meses = [];
    for (let i = 0; i < 12; i += 1) {
      const data = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
      const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
      meses.push({
        chave,
        ano: data.getFullYear(),
        mes: data.getMonth() + 1,
        rotulo: MESES[data.getMonth()],
        recorrencias: [],
        valor: 0,
      });
    }
    const porChave = new Map(meses.map((m) => [m.chave, m]));

    const semPrevisao = [];
    for (const r of linhas) {
      if (!r.proxima_prevista) {
        semPrevisao.push(r);
        continue;
      }
      const chave = String(r.proxima_prevista).slice(0, 7);
      const mes = porChave.get(chave);
      if (!mes) {
        // Previsão além dos doze meses: não some, só não cabe no quadro.
        semPrevisao.push(r);
        continue;
      }
      mes.recorrencias.push(r);
      mes.valor += Number(r.valor_medio || 0);
    }

    res.json({
      meses,
      sem_previsao: semPrevisao,
      resumo: {
        total: linhas.length,
        previstas: linhas.filter((r) => r.proxima_prevista).length,
        // Confiança 0,5 é o piso: duas ocorrências em anos diferentes. Abaixo
        // disso o painel não cria linha nenhuma (seção 24.3).
        comprovadas: linhas.filter((r) => Number(r.ocorrencias) >= 2).length,
        valor: linhas.reduce((s, r) => s + Number(r.valor_medio || 0), 0),
      },
      // O que a tela precisa dizer sobre o que estes números são.
      ressalva:
        'Previsão a partir do que o órgão já fez: duas ocorrências do mesmo objeto em anos diferentes ' +
        'valem 0,5 de confiança; três, 0,8. Com menos de duas, o painel não cria linha — não especula.',
    });
  } catch (erro) {
    console.error('Erro no calendário:', erro.message);
    responderErro(res, 500, 'Não foi possível carregar o calendário.', erro);
  }
});

// POST /api/calendario/detectar — recalcula as recorrências na hora.
rotas.post('/detectar', async (_req, res) => {
  try {
    const r = await recorrencias.detectarRecorrencias({});
    const avisos = await recorrencias.avisarRecorrencias({});
    res.json({
      ...r,
      avisos,
      mensagem:
        `${r.recorrencias} recorrência(s) a partir de ${r.contratacoes} contratações de ${r.orgaos} órgãos` +
        (avisos.criados ? `, ${avisos.criados} alerta(s) criados` : '') + '.',
    });
  } catch (erro) {
    console.error('Erro ao detectar recorrências:', erro.message);
    responderErro(res, 500, 'Não foi possível recalcular as recorrências.', erro);
  }
});

/**
 * POST /api/calendario/:id/preparar — o botão "Preparar" da seção 24.4.
 *
 * DIVERGÊNCIA registrada: a seção fala em "criar uma tarefa com checklist". O
 * painel não tem lista de tarefas do usuário — `tarefas` é a fila de jobs — e
 * inventar um gerenciador de tarefas inteiro para três itens seria construir o
 * que ninguém pediu. O checklist vai no alerta, agendado para 30 dias antes da
 * janela prevista, que é onde o usuário já olha todo dia.
 */
rotas.post('/:id/preparar', async (req, res) => {
  try {
    const [[r]] = await pool.query('SELECT * FROM recorrencias WHERE id = ?', [req.params.id]);
    if (!r) return res.status(404).json({ erro: 'Recorrência não encontrada.' });
    if (!r.proxima_prevista) {
      return res.status(400).json({ erro: 'Esta recorrência não tem janela prevista para preparar.' });
    }

    const objeto = String(r.objeto_exemplo || r.assinatura_objeto).replace(/\s+/g, ' ').slice(0, 100);
    const valor = r.valor_medio
      ? Number(r.valor_medio).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
      : null;

    const criado = await alertas.criar({
      tipo: 'preparar',
      nivel: 'atencao',
      chave: `preparar:${r.id}:${String(r.proxima_prevista).slice(0, 7)}`,
      quando: r.proxima_prevista,
      mensagem:
        `Preparar para ${r.orgao_nome || 'o órgão'} — ${objeto}` +
        `${valor ? ` (costuma sair por ${valor})` : ''}: ` +
        'certidões em dia, atestado compatível e pesquisa de preço do grupo.',
    });

    res.json({
      ok: true,
      mensagem: criado
        ? `Lembrete criado para ${new Date(r.proxima_prevista).toLocaleDateString('pt-BR')}: certidões, atestado e pesquisa de preço.`
        : 'Já existe um lembrete para esta janela.',
    });
  } catch (erro) {
    console.error('Erro ao preparar recorrência:', erro.message);
    responderErro(res, 500, 'Não foi possível criar o lembrete.', erro);
  }
});

module.exports = rotas;
