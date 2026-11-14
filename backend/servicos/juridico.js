// Consultor jurídico (Seção 16 do plano SaaS) — do pedido à resposta gravada.
//
// Mesmo contrato do Pergunte ao Edital: a rota grava a pergunta como 'pendente' e devolve o
// id; `processar` roda fora da requisição e a tela consulta até a linha virar 'respondida'
// ou 'erro'. A conversa é da PESSOA (organização + usuário): a equipe não lê o chat do colega.
// Sem IA, a pergunta ainda recebe os artigos da base que tratam do assunto — o modelo só
// escreve a resposta, nunca é a fonte.
const pool = require('../config/db');
const { ia: cfg } = require('../config/ambiente');
const ia = require('./ia');
const limites = require('./limites');
const regras = require('../regras/juridico');
const base = require('../config/dados/juridico');
const { FALHAS, FALHA_PADRAO, INTERROMPIDA, ESPERA_MAXIMA_S } = require('./perguntas-edital');

const MAX_PENDENTES = 3;
/** Trocas anteriores enviadas como contexto (só o que a pessoa perguntou e o que foi respondido). */
const TROCAS_DE_CONTEXTO = 3;

/** Linha do banco → o que a tela recebe. */
function formatar(linha) {
  const interrompida = linha.situacao === 'pendente' && Number(linha.idade_s) > ESPERA_MAXIMA_S;
  return {
    id: linha.id,
    conversa_id: linha.conversa_id,
    pergunta: linha.pergunta,
    situacao: interrompida ? 'erro' : linha.situacao,
    resposta: limites.lerJson(linha.resposta, null),
    erro: interrompida ? INTERROMPIDA : linha.erro,
    cache: Boolean(linha.cache),
    criado_em: linha.criado_em,
    respondida_em: linha.respondida_em,
  };
}

const SELECAO = `SELECT m.*, TIMESTAMPDIFF(SECOND, m.criado_em, NOW()) AS idade_s FROM juridico_mensagens m`;

async function criarConversa(organizacaoId, usuarioId, titulo = null) {
  const [r] = await pool.query('INSERT INTO juridico_conversas (organizacao_id, usuario_id, titulo) VALUES (?, ?, ?)', [
    organizacaoId,
    usuarioId,
    titulo,
  ]);
  return r.insertId;
}

async function listarConversas(organizacaoId, usuarioId) {
  const [linhas] = await pool.query(
    `SELECT id, titulo, criado_em, atualizado_em FROM juridico_conversas
      WHERE organizacao_id = ? AND usuario_id = ? ORDER BY atualizado_em DESC, id DESC LIMIT 100`,
    [organizacaoId, usuarioId]
  );
  return linhas;
}

/** A conversa da pessoa com as mensagens, ou null (de outra pessoa ou de outra organização = não existe). */
async function obterConversa(organizacaoId, usuarioId, id) {
  const [[conversa]] = await pool.query(
    'SELECT id, titulo, criado_em, atualizado_em FROM juridico_conversas WHERE id = ? AND organizacao_id = ? AND usuario_id = ?',
    [id, organizacaoId, usuarioId]
  );
  if (!conversa) return null;
  const [linhas] = await pool.query(`${SELECAO} WHERE m.conversa_id = ? AND m.organizacao_id = ? ORDER BY m.id`, [id, organizacaoId]);
  return { ...conversa, mensagens: linhas.map(formatar) };
}

async function apagarConversa(organizacaoId, usuarioId, id) {
  const [r] = await pool.query('DELETE FROM juridico_conversas WHERE id = ? AND organizacao_id = ? AND usuario_id = ?', [
    id,
    organizacaoId,
    usuarioId,
  ]);
  return r.affectedRows > 0;
}

async function pendentes(organizacaoId) {
  const [[r]] = await pool.query(
    `SELECT COUNT(*) AS n FROM juridico_mensagens
      WHERE organizacao_id = ? AND situacao = 'pendente' AND criado_em >= NOW() - INTERVAL ? SECOND`,
    [organizacaoId, ESPERA_MAXIMA_S]
  );
  return Number(r.n);
}

/**
 * Grava a pergunta como pendente SE a organização ainda tem vaga (no máximo MAX_PENDENTES em andamento):
 * um INSERT condicional, atômico — pedidos simultâneos não passam juntos do teto. `null` = sem vaga.
 */
async function criarMensagem(organizacaoId, conversaId, pergunta) {
  const [r] = await pool.query(
    `INSERT INTO juridico_mensagens (organizacao_id, conversa_id, pergunta)
     SELECT ?, ?, ? FROM DUAL
      WHERE (SELECT COUNT(*) FROM juridico_mensagens
              WHERE organizacao_id = ? AND situacao = 'pendente' AND criado_em >= NOW() - INTERVAL ? SECOND) < ?`,
    [organizacaoId, conversaId, pergunta, organizacaoId, ESPERA_MAXIMA_S, MAX_PENDENTES]
  );
  if (!r.affectedRows) return null;
  // O título da conversa é o começo da primeira pergunta; mexer nela também sobe a conversa na lista.
  await pool.query(
    'UPDATE juridico_conversas SET titulo = COALESCE(titulo, ?), atualizado_em = NOW() WHERE id = ? AND organizacao_id = ?',
    [regras.tituloDaConversa(pergunta), conversaId, organizacaoId]
  );
  return r.insertId;
}

async function obterMensagem(organizacaoId, usuarioId, conversaId, id) {
  const [[linha]] = await pool.query(
    `${SELECAO} JOIN juridico_conversas c ON c.id = m.conversa_id AND c.organizacao_id = m.organizacao_id
      WHERE m.id = ? AND m.conversa_id = ? AND m.organizacao_id = ? AND c.usuario_id = ?`,
    [id, conversaId, organizacaoId, usuarioId]
  );
  return linha ? formatar(linha) : null;
}

async function concluir(organizacaoId, id, { resposta = null, erro = null, cache = false }) {
  await pool.query(
    `UPDATE juridico_mensagens
        SET situacao = ?, resposta = ?, erro = ?, cache = ?, base_versao = ?, respondida_em = NOW()
      WHERE id = ? AND organizacao_id = ? AND situacao = 'pendente'`,
    [erro ? 'erro' : 'respondida', resposta ? JSON.stringify(resposta) : null, erro ? String(erro).slice(0, 500) : null, cache ? 1 : 0, base.VERSAO_BASE, id, organizacaoId]
  );
}

/** As últimas trocas respondidas da conversa (antes desta pergunta), para o modelo entender "e se…". */
async function contexto(organizacaoId, conversaId, antesDoId) {
  const [linhas] = await pool.query(
    `SELECT pergunta, resposta FROM juridico_mensagens
      WHERE organizacao_id = ? AND conversa_id = ? AND id < ? AND situacao = 'respondida'
      ORDER BY id DESC LIMIT ?`,
    [organizacaoId, conversaId, antesDoId, TROCAS_DE_CONTEXTO]
  );
  return linhas
    .reverse()
    .map((l) => ({ pergunta: l.pergunta, resposta: String((limites.lerJson(l.resposta, {}) || {}).resposta || '').slice(0, 600) }));
}

/** O que sai de graça com ou sem modelo: os artigos da base que a busca achou. */
const artigosDe = (trechos) => trechos.map((t) => regras.resumoDoArtigo(t.artigo));

/**
 * Responde uma pergunta gravada. Nunca lança: todo desfecho vira linha 'respondida' ou 'erro'.
 */
async function processar({ organizacaoId, id, reservado = false }) {
  // `reservado`: a rota já reservou uma unidade do limite do mês. Ela fica só se o modelo cobrou; senão volta.
  let cobrou = false;
  try {
    const [[linha]] = await pool.query('SELECT * FROM juridico_mensagens WHERE id = ? AND organizacao_id = ?', [id, organizacaoId]);
    if (!linha || linha.situacao !== 'pendente') return;

    const trechos = regras.buscarArtigos(linha.pergunta);
    const meta = { artigos: artigosDe(trechos), base_versao: base.VERSAO_BASE };

    if (!trechos.length) {
      // Sem artigo, não se gasta modelo: a resposta honesta é que a base não cobre.
      return await concluir(organizacaoId, id, {
        resposta: {
          resposta: 'Não encontrei na base do consultor nenhum artigo que trate disso. Vale consultar um advogado ou reformular a pergunta com outras palavras.',
          encontrado: false, citacoes: [], confianca: null, _meta: { ...meta, sem_ia: false },
        },
      });
    }
    if (!ia.disponivel()) {
      return await concluir(organizacaoId, id, {
        resposta: {
          resposta: 'A IA está desligada neste servidor, então não consigo escrever uma resposta. Estes são os artigos da base que mais se aproximam da sua pergunta — leia o resumo de cada um.',
          encontrado: false, citacoes: [], confianca: null, _meta: { ...meta, sem_ia: true },
        },
      });
    }

    const r = await ia.consultarJuridico({
      pergunta: linha.pergunta,
      historico: await contexto(organizacaoId, linha.conversa_id, id),
      trechos,
      versaoBase: base.VERSAO_BASE,
    });
    cobrou = r.chamouModelo;
    if (!r.ok) {
      console.error('Consultor jurídico — o modelo falhou na pergunta', id, '—', r.motivo);
      return await concluir(organizacaoId, id, { erro: FALHAS[r.codigo] || FALHA_PADRAO });
    }
    return await concluir(organizacaoId, id, {
      cache: r.cache,
      resposta: { ...r.dados, _meta: { ...meta, modelo: cfg.modelo, descartados: r.descartados || [], sem_ia: false } },
    });
  } catch (erro) {
    console.error('Consultor jurídico — falha ao processar', id, erro.message);
    await concluir(organizacaoId, id, { erro: FALHA_PADRAO }).catch(() => {});
  } finally {
    if (reservado && !cobrou) await limites.devolverUso(organizacaoId, 'ia_juridico_mes').catch((erro) => console.error('Consultor jurídico — não devolveu a cota:', erro.message));
  }
}

module.exports = {
  MAX_PENDENTES,
  criarConversa,
  listarConversas,
  obterConversa,
  apagarConversa,
  pendentes,
  criarMensagem,
  obterMensagem,
  processar,
};
