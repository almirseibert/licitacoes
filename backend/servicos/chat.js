// Monitor de chat do pregão (Seção 6) — a parte que fala com o banco.
// As regras (janela, destaques, abas) ficam em regras/chat.js.
//
// Toda consulta aqui filtra por `organizacao_id`: o chat, o "lido" e o
// "importante" são de cada organização, mesmo quando duas acompanham a mesma
// sessão.
const pool = require('../config/db');
const regras = require('../regras/chat');
const escopo = require('./escopo');
const alertas = require('./alertas');
const monitor = require('./monitor');

const lista = (valor) => {
  if (Array.isArray(valor)) return valor;
  if (typeof valor !== 'string') return [];
  try {
    const lida = JSON.parse(valor);
    return Array.isArray(lida) ? lida : [];
  } catch {
    return [];
  }
};

/**
 * Liga o chat de uma licitação. Cria o monitoramento se não houver (o chat é uma
 * camada em cima dele) e marca a primeira leitura para já. Religar o que estava
 * desligado limpa o arquivamento e o aviso antigo, e mantém as mensagens já lidas.
 */
async function ligar({ organizacaoId, licitacaoId }) {
  const base = await monitor.ligar({ organizacaoId, licitacaoId, motivo: 'interesse' });
  if (!base) return null;
  await pool.query(
    `UPDATE monitoramentos
        SET chat_ativo = 1, chat_status = 'aguardando', chat_aviso = NULL, chat_arquivado = 0,
            chat_proxima = NOW(), ativo = 1, encerrado_em = NULL
      WHERE organizacao_id = ? AND licitacao_id = ?`,
    [organizacaoId, licitacaoId]
  );
  return obterMonitor(organizacaoId, licitacaoId);
}

/** Para de ler o chat. O monitoramento do edital (Seção 21) segue como está. */
async function desativar(organizacaoId, licitacaoId) {
  const [r] = await pool.query(
    `UPDATE monitoramentos SET chat_ativo = 0, chat_proxima = NULL
      WHERE organizacao_id = ? AND licitacao_id = ?`,
    [organizacaoId, licitacaoId]
  );
  return r.affectedRows > 0;
}

async function arquivar(organizacaoId, licitacaoId, arquivado = true) {
  const [r] = await pool.query(
    'UPDATE monitoramentos SET chat_arquivado = ? WHERE organizacao_id = ? AND licitacao_id = ?',
    [arquivado ? 1 : 0, organizacaoId, licitacaoId]
  );
  return r.affectedRows > 0;
}

async function obterMonitor(organizacaoId, licitacaoId) {
  const [[linha]] = await pool.query(
    `SELECT id, organizacao_id, licitacao_id, ativo, chat_ativo, chat_status, chat_aviso, chat_arquivado,
            chat_checado_em, chat_proxima, chat_link
       FROM monitoramentos WHERE organizacao_id = ? AND licitacao_id = ?`,
    [organizacaoId, licitacaoId]
  );
  return linha || null;
}

/**
 * Grava as mensagens de uma leitura e devolve só as que são novas. A chave única
 * faz a repetida ser ignorada — nenhuma coluna de decisão (lida, importante) é
 * reescrita por uma leitura nova.
 */
async function gravarMensagens({ organizacaoId, licitacaoId, mensagens }) {
  const novas = [];
  for (const m of regras.comChaves(mensagens)) {
    const [r] = await pool.query(
      `INSERT INTO chat_mensagens (organizacao_id, licitacao_id, chave, autor, texto, enviada_em, destaques)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE id = id`,
      [organizacaoId, licitacaoId, m.chave, m.autor, m.texto, m.enviada_em, JSON.stringify(m.destaques)]
    );
    if (r.insertId) novas.push(m);
  }
  return novas;
}

/** Alerta (uma por leitura) quando chegou mensagem nova; `true` se criou. */
async function alertarNovas({ organizacaoId, licitacaoId, novas, orgao = null }) {
  const alerta = regras.alertaDeMensagens(novas, { orgao });
  if (!alerta) return false;
  return alertas.criar({
    organizacaoId,
    tipo: 'chat_pregao',
    nivel: alerta.nivel,
    // A chave carrega a última mensagem nova: a mesma leitura repetida não
    // duplica o aviso, e uma mensagem nova depois gera outro.
    chave: `chat_pregao:${licitacaoId}:${novas[novas.length - 1].chave.slice(0, 16)}`,
    licitacaoId,
    mensagem: alerta.mensagem,
  });
}

/** Guarda o resultado da tentativa de leitura no monitoramento. */
async function registrarLeitura({ organizacaoId, licitacaoId, passo, link = null, agora = new Date() }) {
  await pool.query(
    `UPDATE monitoramentos
        SET chat_status = ?, chat_aviso = ?, chat_checado_em = ?, chat_proxima = ?,
            chat_link = COALESCE(?, chat_link)
      WHERE organizacao_id = ? AND licitacao_id = ?`,
    [passo.status, passo.aviso ? String(passo.aviso).slice(0, 255) : null, agora, passo.proxima, link, organizacaoId, licitacaoId]
  );
}

/** Janela fechada: o chat se encerra e a vaga do plano volta. */
async function encerrar(organizacaoId, licitacaoId, agora = new Date()) {
  await pool.query(
    `UPDATE monitoramentos
        SET chat_ativo = 0, chat_status = 'encerrado', chat_proxima = NULL,
            chat_aviso = 'A janela do chat acabou (três dias depois da sessão).', chat_checado_em = ?
      WHERE organizacao_id = ? AND licitacao_id = ?`,
    [agora, organizacaoId, licitacaoId]
  );
}

/** Os chats que estão na hora de ler (todas as organizações — é o worker que pergunta). */
async function devidos({ limite = 30 } = {}) {
  const [linhas] = await pool.query(
    `SELECT m.id, m.organizacao_id, m.licitacao_id, m.chat_status,
            l.chave_externa, l.fonte_id, l.orgao_nome, l.fim_propostas, l.link_portal, l.link_disputa,
            f.adaptador, f.config AS fonte_config
       FROM monitoramentos m
       JOIN licitacoes l ON l.id = m.licitacao_id
       JOIN fontes f ON f.id = l.fonte_id
      WHERE m.chat_ativo = 1
        AND (m.chat_proxima IS NULL OR m.chat_proxima <= NOW())
      ORDER BY m.chat_proxima ASC
      LIMIT ?`,
    [limite]
  );
  return linhas;
}

/** Lista por edital, com os números que as abas usam. */
async function listarMonitores(organizacaoId, aba = 'todos') {
  const condicao = regras.CONDICAO_DA_ABA[regras.abaValida(aba)];
  const [linhas] = await pool.query(
    `SELECT m.licitacao_id, m.chat_ativo, m.chat_status, m.chat_aviso, m.chat_arquivado, m.chat_checado_em,
            m.chat_link, l.objeto, l.orgao_nome, l.uf, l.fim_propostas, l.link_disputa, l.link_portal,
            COALESCE(r.total, 0) AS total, COALESCE(r.nao_lidas, 0) AS nao_lidas,
            COALESCE(r.importantes, 0) AS importantes, r.ultima_em
       FROM monitoramentos m
       JOIN ${escopo.daOrganizacao(organizacaoId, { todas: true })} l ON l.id = m.licitacao_id
       LEFT JOIN (
         SELECT licitacao_id, COUNT(*) AS total, SUM(lida = 0) AS nao_lidas, SUM(importante = 1) AS importantes,
                MAX(COALESCE(enviada_em, criado_em)) AS ultima_em
           FROM chat_mensagens WHERE organizacao_id = ? GROUP BY licitacao_id
       ) r ON r.licitacao_id = m.licitacao_id
      WHERE m.organizacao_id = ?
        AND (m.chat_ativo = 1 OR m.chat_status IS NOT NULL)
        AND ${condicao}
      ORDER BY m.chat_ativo DESC, COALESCE(r.nao_lidas, 0) DESC, l.fim_propostas DESC
      LIMIT 200`,
    [organizacaoId, organizacaoId]
  );
  return linhas.map((l) => ({
    ...l,
    chat_ativo: Boolean(l.chat_ativo),
    chat_arquivado: Boolean(l.chat_arquivado),
    total: Number(l.total),
    nao_lidas: Number(l.nao_lidas),
    importantes: Number(l.importantes),
  }));
}

/** Quantas licitações há em cada aba (para o número ao lado do rótulo). */
async function contarAbas(organizacaoId) {
  const [[c]] = await pool.query(
    `SELECT SUM(m.chat_arquivado = 0) AS todos,
            SUM(m.chat_arquivado = 0 AND COALESCE(r.nao_lidas, 0) > 0) AS nao_lidos,
            SUM(COALESCE(r.importantes, 0) > 0) AS importantes,
            SUM(m.chat_arquivado = 1) AS arquivados
       FROM monitoramentos m
       LEFT JOIN (
         SELECT licitacao_id, SUM(lida = 0) AS nao_lidas, SUM(importante = 1) AS importantes
           FROM chat_mensagens WHERE organizacao_id = ? GROUP BY licitacao_id
       ) r ON r.licitacao_id = m.licitacao_id
      WHERE m.organizacao_id = ? AND (m.chat_ativo = 1 OR m.chat_status IS NOT NULL)`,
    [organizacaoId, organizacaoId]
  );
  return Object.fromEntries(regras.ABAS.map((a) => [a, Number(c[a] || 0)]));
}

async function listarMensagens(organizacaoId, licitacaoId, { limite = 500 } = {}) {
  const [linhas] = await pool.query(
    `SELECT id, autor, texto, enviada_em, destaques, lida, importante, criado_em
       FROM chat_mensagens WHERE organizacao_id = ? AND licitacao_id = ?
      ORDER BY COALESCE(enviada_em, criado_em) ASC, id ASC LIMIT ?`,
    [organizacaoId, licitacaoId, limite]
  );
  return linhas.map((m) => ({
    ...m,
    destaques: lista(m.destaques),
    lida: Boolean(m.lida),
    importante: Boolean(m.importante),
  }));
}

/** Marca lida e/ou importante. Só o que veio no corpo muda. */
async function marcarMensagem(organizacaoId, id, { lida, importante }) {
  const colunas = [];
  const valores = [];
  if (typeof lida === 'boolean') {
    colunas.push('lida = ?');
    valores.push(lida ? 1 : 0);
  }
  if (typeof importante === 'boolean') {
    colunas.push('importante = ?');
    valores.push(importante ? 1 : 0);
  }
  if (!colunas.length) return null;
  const [r] = await pool.query(
    `UPDATE chat_mensagens SET ${colunas.join(', ')} WHERE id = ? AND organizacao_id = ?`,
    [...valores, id, organizacaoId]
  );
  return r.affectedRows > 0;
}

async function lerTodas(organizacaoId, licitacaoId) {
  const [r] = await pool.query(
    'UPDATE chat_mensagens SET lida = 1 WHERE organizacao_id = ? AND licitacao_id = ? AND lida = 0',
    [organizacaoId, licitacaoId]
  );
  return r.affectedRows;
}

/**
 * O que o painel mediu em cada portal desta organização: quantos chats foram
 * lidos, quantos bloqueados, quantos sem consulta. É a parte do "portais
 * compatíveis" que não depende de ninguém ter conferido na mão.
 */
async function portaisMedidos(organizacaoId) {
  const [linhas] = await pool.query(
    `SELECT f.nome AS fonte, f.adaptador, m.chat_status AS status, COUNT(*) AS chats,
            MAX(m.chat_aviso) AS aviso
       FROM monitoramentos m
       JOIN licitacoes l ON l.id = m.licitacao_id
       JOIN fontes f ON f.id = l.fonte_id
      WHERE m.organizacao_id = ? AND m.chat_status IS NOT NULL
      GROUP BY f.nome, f.adaptador, m.chat_status
      ORDER BY f.nome`,
    [organizacaoId]
  );
  return linhas.map((l) => ({ ...l, chats: Number(l.chats) }));
}

module.exports = {
  ligar,
  desativar,
  arquivar,
  obterMonitor,
  gravarMensagens,
  alertarNovas,
  registrarLeitura,
  encerrar,
  devidos,
  listarMonitores,
  contarAbas,
  listarMensagens,
  marcarMensagem,
  lerTodas,
  portaisMedidos,
};
