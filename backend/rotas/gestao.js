// Gestão por licitação e dashboard (Seção 8 do PLANO_SAAS_CONLICITACAO.md).
//
//   GET    /api/gestao/membros              quem pode ser responsável
//   GET    /api/gestao/tarefas              ?visao=&por=mim&licitacao_id=
//   POST   /api/gestao/tarefas
//   PATCH  /api/gestao/tarefas/:id
//   DELETE /api/gestao/tarefas/:id
//   GET    /api/gestao/andamentos?licitacao_id=
//   POST   /api/gestao/andamentos
//   DELETE /api/gestao/andamentos/:id
//   GET    /api/gestao/anexos?licitacao_id=
//   GET    /api/gestao/agenda?de=&ate=      licitação, tarefa e andamento por dia
//   GET    /api/gestao/dashboard
//
// Tudo é da organização: todo SELECT/UPDATE/DELETE filtra por
// `req.organizacaoId` no WHERE. O id de outra organização dá 404, como se não
// existisse — não "sem permissão", que confirmaria que existe.
const express = require('express');
const { responderErro } = require('../middlewares/responder-erro');
const pool = require('../config/db');
const escopo = require('../servicos/escopo');
const gestao = require('../regras/gestao');
const alertas = require('../servicos/alertas');
const { LISTAS, sqlPorMim } = require('../regras/filtros-radar');

const rotas = express.Router();

const quem = (req) => (req.usuario && req.usuario.id) || null;

/**
 * Confere responsável e licitação do corpo (as duas consultas em paralelo).
 * Devolve `{ status, erro }` do primeiro problema, ou null.
 */
async function conferirVinculos(req, campos) {
  const [membro, licitacao] = await Promise.all([
    campos.responsavel_id ? escopo.ehMembroAtivo(pool, req.organizacaoId, campos.responsavel_id) : true,
    campos.licitacao_id
      ? pool.query('SELECT id FROM licitacoes WHERE id = ?', [campos.licitacao_id]).then(([[l]]) => Boolean(l))
      : true,
  ]);
  if (!membro) return { status: 400, erro: 'O responsável precisa ser alguém da sua equipe.' };
  if (!licitacao) return { status: 404, erro: 'Licitação não encontrada.' };
  return null;
}

/** `?licitacao_id=` das listas por licitação; responde 400 e devolve null se faltar. */
function licitacaoDaConsulta(req, res) {
  const id = Number(req.query.licitacao_id);
  if (Number.isInteger(id) && id > 0) return id;
  res.status(400).json({ erro: 'Informe a licitação.' });
  return null;
}

const SELECAO_TAREFA = `t.*, u.nome AS responsavel_nome, c.nome AS criado_por_nome,
       l.objeto AS licitacao_objeto, l.orgao_nome AS licitacao_orgao`;
const JUNCOES_TAREFA = `LEFT JOIN usuarios u ON u.id = t.responsavel_id
       LEFT JOIN usuarios c ON c.id = t.criado_por
       LEFT JOIN licitacoes l ON l.id = t.licitacao_id`;

async function tarefaDaOrganizacao(organizacaoId, id) {
  const [[t]] = await pool.query(
    `SELECT ${SELECAO_TAREFA} FROM org_tarefas t ${JUNCOES_TAREFA} WHERE t.id = ? AND t.organizacao_id = ?`,
    [id, organizacaoId]
  );
  return t || null;
}

// ------------------------------------------------------------------ membros
rotas.get('/membros', async (req, res) => {
  try {
    const [dados] = await pool.query(
      `SELECT u.id, u.nome FROM organizacao_membros m JOIN usuarios u ON u.id = m.usuario_id
        WHERE m.organizacao_id = ? AND u.ativo = 1 ORDER BY u.nome`,
      [req.organizacaoId]
    );
    res.json({ dados, eu: quem(req) });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar a equipe.', erro);
  }
});

// ------------------------------------------------------------------ tarefas
rotas.get('/tarefas', async (req, res) => {
  const hoje = gestao.diaNoFuso();
  const onde = ['t.organizacao_id = ?'];
  const valores = [req.organizacaoId];
  if (req.query.visao && !gestao.VISOES.includes(req.query.visao)) {
    return res.status(400).json({ erro: `Visão inválida. Use uma de: ${gestao.VISOES.join(', ')}.` });
  }
  if (req.query.por === 'mim') {
    onde.push('t.responsavel_id = ?');
    valores.push(quem(req));
  }
  if (req.query.licitacao_id) {
    onde.push('t.licitacao_id = ?');
    valores.push(Number(req.query.licitacao_id) || 0);
  }

  try {
    const filtroVisao = req.query.visao ? [gestao.sqlVisao(req.query.visao, hoje)] : [];
    const [[dados], [contagem]] = await Promise.all([
      pool.query(
        `SELECT ${SELECAO_TAREFA} FROM org_tarefas t ${JUNCOES_TAREFA}
          WHERE ${[...onde, ...filtroVisao].join(' AND ')}
          ORDER BY t.status = 'concluida', t.prazo IS NULL, t.prazo, t.id DESC
          LIMIT 500`,
        valores
      ),
      // As quatro contagens das abas, com o mesmo "por mim" e a mesma licitação.
      pool.query(
        `SELECT ${gestao.VISOES.map((v) => `SUM(${gestao.sqlVisao(v, hoje)}) AS ${v}`).join(', ')}
           FROM org_tarefas t WHERE ${onde.join(' AND ')}`,
        valores
      ),
    ]);
    const totais = Object.fromEntries(gestao.VISOES.map((v) => [v, Number(contagem[0][v] || 0)]));
    res.json({
      dados: dados.map((t) => ({ ...t, visao: gestao.visaoDaTarefa(t, hoje) })),
      totais,
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar as tarefas.', erro);
  }
});

rotas.post('/tarefas', async (req, res) => {
  const { campos, erro } = gestao.lerTarefa(req.body);
  if (erro) return res.status(400).json({ erro });
  try {
    const problema = await conferirVinculos(req, campos);
    if (problema) return res.status(problema.status).json({ erro: problema.erro });

    const [r] = await pool.query(
      `INSERT INTO org_tarefas (organizacao_id, licitacao_id, titulo, descricao, responsavel_id, prazo,
                                status, concluida_em, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.organizacaoId,
        campos.licitacao_id || null,
        campos.titulo,
        campos.descricao || null,
        campos.responsavel_id === undefined ? quem(req) : campos.responsavel_id,
        campos.prazo || null,
        campos.status || 'aberta',
        campos.status === 'concluida' ? new Date() : null,
        quem(req),
      ]
    );
    res.status(201).json({ ok: true, tarefa: await tarefaDaOrganizacao(req.organizacaoId, r.insertId) });
  } catch (e) {
    responderErro(res, 500, 'Não foi possível criar a tarefa.', e);
  }
});

rotas.patch('/tarefas/:id', async (req, res) => {
  const { campos, erro } = gestao.lerTarefa(req.body, { parcial: true });
  if (erro) return res.status(400).json({ erro });
  try {
    const [[antes]] = await pool.query('SELECT status FROM org_tarefas WHERE id = ? AND organizacao_id = ?', [
      req.params.id,
      req.organizacaoId,
    ]);
    if (!antes) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
    const problema = await conferirVinculos(req, campos);
    if (problema) return res.status(problema.status).json({ erro: problema.erro });

    const partes = Object.keys(campos).map((c) => `${c} = ?`);
    const valores = Object.values(campos);
    if (campos.status && campos.status !== antes.status) {
      partes.push(campos.status === 'concluida' ? 'concluida_em = NOW()' : 'concluida_em = NULL');
    }
    await pool.query(
      `UPDATE org_tarefas SET ${partes.join(', ')} WHERE id = ? AND organizacao_id = ?`,
      [...valores, req.params.id, req.organizacaoId]
    );
    res.json({ ok: true, tarefa: await tarefaDaOrganizacao(req.organizacaoId, req.params.id) });
  } catch (e) {
    responderErro(res, 500, 'Não foi possível salvar a tarefa.', e);
  }
});

rotas.delete('/tarefas/:id', async (req, res) => {
  try {
    const [r] = await pool.query('DELETE FROM org_tarefas WHERE id = ? AND organizacao_id = ?', [
      req.params.id,
      req.organizacaoId,
    ]);
    if (!r.affectedRows) return res.status(404).json({ erro: 'Tarefa não encontrada.' });
    res.json({ ok: true });
  } catch (e) {
    responderErro(res, 500, 'Não foi possível apagar a tarefa.', e);
  }
});

// --------------------------------------------------------------- andamentos
rotas.get('/andamentos', async (req, res) => {
  const licitacaoId = licitacaoDaConsulta(req, res);
  if (!licitacaoId) return;
  try {
    const [dados] = await pool.query(
      `SELECT a.id, a.licitacao_id, a.tipo, a.texto, a.ocorrido_em, a.criado_em, a.autor_id, u.nome AS autor_nome
         FROM org_andamentos a LEFT JOIN usuarios u ON u.id = a.autor_id
        WHERE a.organizacao_id = ? AND a.licitacao_id = ?
        ORDER BY a.ocorrido_em ASC, a.id ASC`,
      [req.organizacaoId, licitacaoId]
    );
    res.json({ dados, tipos: gestao.TIPOS_ANDAMENTO });
  } catch (e) {
    responderErro(res, 500, 'Não foi possível carregar os andamentos.', e);
  }
});

/**
 * Andamento registrado vira aviso para o resto da equipe, do tipo dele (Seção 9):
 * é o que deixa alguém desligar "recurso" no WhatsApp e manter "esclarecimento"
 * no e-mail. Quem registrou não é avisado (`autorId`). Falha aqui não desfaz o
 * andamento: é aviso, não dado.
 */
async function avisarAndamento(req, id, licitacaoId, campos) {
  try {
    const [[l]] = await pool.query('SELECT objeto FROM licitacoes WHERE id = ?', [licitacaoId]);
    const rotulo = (gestao.TIPOS_ANDAMENTO.find((t) => t.chave === campos.tipo) || {}).rotulo || 'Andamento';
    const objeto = String((l && l.objeto) || '').replace(/\s+/g, ' ').slice(0, 120);
    await alertas.criar({
      organizacaoId: req.organizacaoId,
      autorId: quem(req),
      tipo: campos.tipo,
      chave: `andamento:${id}`,
      licitacaoId,
      mensagem: `${rotulo}: ${String(campos.texto).replace(/\s+/g, ' ').slice(0, 300)} — ${objeto}`,
    });
  } catch (e) {
    console.error('Andamento registrado, mas o aviso não foi criado:', e.message);
  }
}

rotas.post('/andamentos', async (req, res) => {
  const { campos, erro } = gestao.lerAndamento(req.body);
  if (erro) return res.status(400).json({ erro });
  const licitacaoId = Number(req.body && req.body.licitacao_id) || 0;
  try {
    const problema = await conferirVinculos(req, { licitacao_id: licitacaoId || -1 });
    if (problema) return res.status(problema.status).json({ erro: problema.erro });
    const [r] = await pool.query(
      `INSERT INTO org_andamentos (organizacao_id, licitacao_id, tipo, texto, ocorrido_em, autor_id)
       VALUES (?, ?, ?, ?, COALESCE(?, NOW()), ?)`,
      [req.organizacaoId, licitacaoId, campos.tipo, campos.texto, campos.ocorrido_em, quem(req)]
    );
    await avisarAndamento(req, r.insertId, licitacaoId, campos);
    res.status(201).json({ ok: true, id: r.insertId });
  } catch (e) {
    responderErro(res, 500, 'Não foi possível registrar o andamento.', e);
  }
});

// Só quem registrou (ou admin) apaga: o andamento é o histórico da equipe.
rotas.delete('/andamentos/:id', async (req, res) => {
  try {
    const [[a]] = await pool.query('SELECT autor_id FROM org_andamentos WHERE id = ? AND organizacao_id = ?', [
      req.params.id,
      req.organizacaoId,
    ]);
    if (!a) return res.status(404).json({ erro: 'Andamento não encontrado.' });
    if (a.autor_id !== quem(req) && !['dono', 'admin'].includes(req.papel)) {
      return res.status(403).json({ erro: 'Só quem registrou o andamento, ou um administrador, pode apagá-lo.' });
    }
    await pool.query('DELETE FROM org_andamentos WHERE id = ? AND organizacao_id = ?', [
      req.params.id,
      req.organizacaoId,
    ]);
    res.json({ ok: true });
  } catch (e) {
    responderErro(res, 500, 'Não foi possível apagar o andamento.', e);
  }
});

// ------------------------------------------------------------------- anexos
// A aba Anexos do detalhe lista o que a equipe anexou à licitação. Enviar e
// remover continuam em /licitacoes/:id/envio/anexos, onde o arquivo é gravado.
rotas.get('/anexos', async (req, res) => {
  const licitacaoId = licitacaoDaConsulta(req, res);
  if (!licitacaoId) return;
  try {
    const [dados] = await pool.query(
      `SELECT id, titulo, nome_arquivo, tamanho_bytes, criado_em FROM licitacao_anexos
        WHERE organizacao_id = ? AND licitacao_id = ? ORDER BY criado_em DESC, id DESC`,
      [req.organizacaoId, licitacaoId]
    );
    res.json({ dados });
  } catch (e) {
    responderErro(res, 500, 'Não foi possível carregar os anexos.', e);
  }
});

// ------------------------------------------------------------------- agenda
// O calendário de trabalho: prazo e abertura das licitações que a equipe
// acompanha (favoritas, em gestão ou com responsável), prazo das tarefas e
// andamentos registrados. No máximo 62 dias por consulta (um mês e a borda).
const MAX_DIAS_AGENDA = 62;

rotas.get('/agenda', async (req, res) => {
  const { de, ate } = req.query;
  if (!gestao.dataValida(de) || !gestao.dataValida(ate) || de > ate) {
    return res.status(400).json({ erro: 'Período inválido. Informe de e até no formato AAAA-MM-DD.' });
  }
  const dias = (Date.parse(ate) - Date.parse(de)) / 86400000;
  if (dias > MAX_DIAS_AGENDA) {
    return res.status(400).json({ erro: `O período da agenda vai até ${MAX_DIAS_AGENDA} dias.` });
  }
  const porMim = req.query.por === 'mim';
  const eu = quem(req);
  // O mesmo "minha" do Radar e do Funil; sem usuário, nada (não "tudo").
  const minha = porMim ? sqlPorMim(eu) || { sql: '1 = 0', valores: [] } : null;
  const { inicio, fim } = gestao.periodoEmUtc(de, ate);

  try {
    const [[licitacoes], [tarefas], [andamentos]] = await Promise.all([
      pool.query(
        `SELECT l.id, l.objeto, l.orgao_nome, l.fim_propostas, l.abertura_propostas
           FROM ${escopo.daOrganizacao(req.organizacaoId)} l
          WHERE l.descartada = 0 AND ${LISTAS.acompanhadas} ${minha ? `AND ${minha.sql}` : ''}
            AND (l.fim_propostas BETWEEN ? AND ? OR l.abertura_propostas BETWEEN ? AND ?)`,
        [...(minha ? minha.valores : []), inicio, fim, inicio, fim]
      ),
      pool.query(
        `SELECT t.id, t.titulo, t.prazo, t.status, t.licitacao_id, t.responsavel_id, u.nome AS responsavel_nome
           FROM org_tarefas t LEFT JOIN usuarios u ON u.id = t.responsavel_id
          WHERE t.organizacao_id = ? AND t.prazo BETWEEN ? AND ? ${porMim ? 'AND t.responsavel_id = ?' : ''}`,
        [req.organizacaoId, de, ate, ...(porMim ? [eu] : [])]
      ),
      pool.query(
        `SELECT a.id, a.tipo, a.texto, a.ocorrido_em, a.licitacao_id, l.orgao_nome
           FROM org_andamentos a JOIN licitacoes l ON l.id = a.licitacao_id
          WHERE a.organizacao_id = ? AND a.ocorrido_em BETWEEN ? AND ? ${porMim ? 'AND a.autor_id = ?' : ''}`,
        [req.organizacaoId, inicio, fim, ...(porMim ? [eu] : [])]
      ),
    ]);

    // `dia` e a chave de ordem saem uma vez por evento: por dia e, dentro do
    // dia, por horário; a tarefa (um dia, sem hora) abre o dia.
    const eventos = [];
    const incluir = (evento) => {
      const dia = gestao.dia(evento.quando);
      if (dia < de || dia > ate) return;
      const hora = evento.tipo === 'tarefa' ? '' : new Date(evento.quando).toISOString();
      eventos.push({ ...evento, dia, ordem: `${dia} ${hora}` });
    };
    for (const l of licitacoes) {
      for (const [tipo, campo] of [['abertura', 'abertura_propostas'], ['prazo', 'fim_propostas']]) {
        if (l[campo]) incluir({ tipo, quando: l[campo], titulo: l.objeto, detalhe: l.orgao_nome, licitacao_id: l.id });
      }
    }
    for (const t of tarefas) {
      incluir({
        tipo: 'tarefa', quando: t.prazo, titulo: t.titulo, detalhe: t.responsavel_nome,
        licitacao_id: t.licitacao_id, tarefa_id: t.id, concluida: t.status === 'concluida',
      });
    }
    for (const a of andamentos) {
      incluir({ tipo: 'andamento', subtipo: a.tipo, quando: a.ocorrido_em, titulo: a.texto, detalhe: a.orgao_nome, licitacao_id: a.licitacao_id });
    }
    eventos.sort((x, y) => x.ordem.localeCompare(y.ordem));
    res.json({ de, ate, eventos: eventos.map(({ ordem: _ordem, ...e }) => e) });
  } catch (e) {
    responderErro(res, 500, 'Não foi possível carregar a agenda.', e);
  }
});

// ---------------------------------------------------------------- dashboard
rotas.get('/dashboard', async (req, res) => {
  const org = req.organizacaoId;
  const eu = quem(req);
  const hoje = gestao.diaNoFuso();
  try {
    const [[[boletins]], [[documentos]], [[tarefas]], [[andamentos]], [ufs]] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS nao_lidos FROM boletins b
          WHERE b.organizacao_id = ? AND b.total_itens > 0
            AND NOT EXISTS (SELECT 1 FROM boletim_leituras r WHERE r.boletim_id = b.id AND r.usuario_id = ?)`,
        [org, eu]
      ),
      pool.query(
        `SELECT SUM(valido_ate < ?) AS vencidos,
                SUM(valido_ate BETWEEN ? AND DATE_ADD(?, INTERVAL 30 DAY)) AS vencendo
           FROM empresa_documentos WHERE organizacao_id = ? AND ativo = 1 AND valido_ate IS NOT NULL`,
        [hoje, hoje, hoje, org]
      ),
      pool.query(
        `SELECT ${['atrasadas', 'hoje', 'futuras'].map((v) => `SUM(${gestao.sqlVisao(v, hoje)}) AS ${v}`).join(', ')},
                SUM(${gestao.sqlVisao('atrasadas', hoje)} AND t.responsavel_id = ?) AS minhas_atrasadas
           FROM org_tarefas t WHERE t.organizacao_id = ?`,
        [eu, org]
      ),
      pool.query(
        `SELECT COUNT(*) AS novos FROM org_andamentos
          WHERE organizacao_id = ? AND criado_em >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND (autor_id IS NULL OR autor_id <> ?)`,
        [org, eu]
      ),
      // Uma passada só pelas licitações da organização, por UF: vigentes (do
      // dia, quantidade, valor) e "em disputa" — o que a equipe está
      // trabalhando de fato (etapas em gestão), não o que só apareceu no Radar.
      pool.query(
        `SELECT COALESCE(x.uf, '—') AS uf, SUM(x.vigente) AS quantidade,
                SUM(IF(x.vigente, x.valor_estimado, 0)) AS valor,
                SUM(x.vigente AND x.criado_em >= DATE_SUB(NOW(), INTERVAL 24 HOUR) AND x.pontuacao > 0) AS do_dia,
                SUM(x.gerenciada) AS disputa, SUM(IF(x.gerenciada, x.valor_estimado, 0)) AS disputa_valor,
                SUM(x.gerenciada AND x.valor_estimado IS NULL) AS disputa_sem_valor
           FROM (SELECT l.uf, l.valor_estimado, l.criado_em, l.pontuacao,
                        (l.fim_propostas IS NULL OR l.fim_propostas >= NOW()) AS vigente,
                        ${LISTAS.gerenciadas} AS gerenciada
                   FROM ${escopo.daOrganizacao(org)} l WHERE l.descartada = 0) x
          GROUP BY COALESCE(x.uf, '—')`
      ),
    ]);

    const n = (v) => Number(v || 0);
    const soma = (campo) => ufs.reduce((s, u) => s + n(u[campo]), 0);
    const porUf = ufs
      .filter((u) => n(u.quantidade) > 0)
      .sort((a, b) => n(b.quantidade) - n(a.quantidade) || a.uf.localeCompare(b.uf));
    res.json({
      cartoes: {
        boletins_nao_lidos: n(boletins.nao_lidos),
        documentos_vencendo: n(documentos.vencendo),
        documentos_vencidos: n(documentos.vencidos),
        tarefas_atrasadas: n(tarefas.atrasadas),
        minhas_tarefas_atrasadas: n(tarefas.minhas_atrasadas),
        tarefas_hoje: n(tarefas.hoje),
        tarefas_futuras: n(tarefas.futuras),
        novos_andamentos: n(andamentos.novos),
      },
      oportunidades: { do_dia: soma('do_dia'), vigentes: soma('quantidade'), valor_vigentes: soma('valor') },
      por_uf: porUf.map((u) => ({ uf: u.uf, quantidade: n(u.quantidade), valor: n(u.valor) })),
      em_disputa: {
        quantidade: soma('disputa'),
        valor: soma('disputa_valor'),
        // Licitação de orçamento sigiloso não soma: o total é "pelo menos".
        sem_valor: soma('disputa_sem_valor'),
      },
    });
  } catch (e) {
    responderErro(res, 500, 'Não foi possível carregar o dashboard.', e);
  }
});

module.exports = rotas;
