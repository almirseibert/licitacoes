// Resumo do Edital 2.0 (Seção 11 do plano SaaS) — o que fala com o banco.
//
// A ficha é do edital (como `ia_resumo` da seção 23): uma por licitação, para
// todas as organizações, porque o edital é o mesmo. Gera uma vez e só refaz a
// pedido. As "considerações do licitante" são de cada organização.
const crypto = require('crypto');
const pool = require('../config/db');
const ia = require('./ia');
const docx = require('./docx');
const regras = require('../regras/resumo-edital');
const { paginasDoArquivo } = require('../regras/busca-edital');
const { arquivosComTexto } = require('./perguntas-edital');
const { ia: cfg } = require('../config/ambiente');
const { lerJson } = require('./limites');
const { formatarData } = require('../regras/boletim');

const MINIMO_DE_TEXTO = 400;
const MAX_CONSIDERACOES = 5000;

/** A ficha guardada e as considerações da organização. */
async function obter(organizacaoId, licitacaoId) {
  const [[l]] = await pool.query(
    `SELECT l.id, l.numero_compra, l.modalidade, l.orgao_nome, l.objeto, l.ia_ficha, l.ia_ficha_em,
            l.ia_ficha_situacao, l.ia_ficha_erro, TIMESTAMPDIFF(SECOND, l.ia_ficha_pedida_em, NOW()) AS idade_s,
            c.texto AS consideracoes, c.atualizado_em AS consideracoes_em
       FROM licitacoes l
       LEFT JOIN resumo_consideracoes c ON c.licitacao_id = l.id AND c.organizacao_id = ?
      WHERE l.id = ?`,
    [organizacaoId, licitacaoId]
  );
  if (!l) return null;
  return comSaidas({
    licitacao: { id: l.id, numero_compra: l.numero_compra, modalidade: l.modalidade, orgao_nome: l.orgao_nome, objeto: l.objeto },
    dados: lerJson(l.ia_ficha, null),
    em: l.ia_ficha_em,
    geracao: estadoDaGeracao(l),
    consideracoes: l.consideracoes || '',
    consideracoes_em: l.consideracoes_em || null,
  });
}

/** Segundos depois dos quais uma geração pendente é dada como interrompida (API reiniciou, por exemplo). */
const ESPERA_MAXIMA_S = Math.ceil(cfg.timeoutResumoMs / 1000) + 60;
const INTERROMPIDA = 'A geração do resumo foi interrompida. Gere de novo.';

/** O que a tela precisa saber da geração: `{ situacao: 'pendente'|'erro'|null, erro }`, calculado na leitura. */
function estadoDaGeracao(l) {
  if (l.ia_ficha_situacao === 'pendente') {
    return Number(l.idade_s) > ESPERA_MAXIMA_S ? { situacao: 'erro', erro: INTERROMPIDA } : { situacao: 'pendente', erro: null };
  }
  if (l.ia_ficha_situacao === 'erro') return { situacao: 'erro', erro: l.ia_ficha_erro };
  return { situacao: null, erro: null };
}

/**
 * Reserva a geração desta licitação (UPDATE condicional, atômico). Devolve o código da reserva, ou
 * `null` se já há uma em andamento dentro do prazo. Pendente velha demais (processo caiu) pode ser
 * retomada — e então só quem tem o código novo fecha a geração.
 */
async function reservarGeracao(licitacaoId) {
  const reserva = crypto.randomBytes(16).toString('hex');
  const [r] = await pool.query(
    `UPDATE licitacoes SET ia_ficha_situacao = 'pendente', ia_ficha_erro = NULL, ia_ficha_pedida_em = NOW(), ia_ficha_reserva = ?
      WHERE id = ? AND (ia_ficha_situacao IS NULL OR ia_ficha_situacao = 'erro'
                        OR ia_ficha_pedida_em < NOW() - INTERVAL ? SECOND)`,
    [reserva, licitacaoId, ESPERA_MAXIMA_S]
  );
  return r.affectedRows > 0 ? reserva : null;
}

/** Fecha a geração da reserva: sucesso limpa o estado; falha guarda a mensagem (a ficha anterior, se havia, fica). */
async function concluirGeracao(licitacaoId, reserva, erro = null) {
  await pool.query(
    'UPDATE licitacoes SET ia_ficha_situacao = ?, ia_ficha_erro = ?, ia_ficha_reserva = NULL WHERE id = ? AND ia_ficha_reserva = ?',
    [erro ? 'erro' : null, erro ? String(erro).slice(0, 500) : null, licitacaoId, reserva]
  );
}

/**
 * Título e linhas do checklist prontos para a tela imprimir — a mesma fonte do
 * .docx e do e-mail. As considerações ficam de fora: a tela soma o rascunho.
 */
function comSaidas(ficha) {
  return { ...ficha, titulo: tituloDe(ficha), linhas: ficha.dados ? regras.linhasDoChecklist(ficha.dados) : [] };
}

/** A ficha depois de gerar, sem reler o banco. */
function comDados(ficha, dados) {
  return comSaidas({ ...ficha, dados, em: new Date() });
}

/** A licitação existe? (para rota que não precisa da ficha) */
async function existe(licitacaoId) {
  const [[l]] = await pool.query('SELECT 1 AS sim FROM licitacoes WHERE id = ?', [licitacaoId]);
  return Boolean(l);
}

/**
 * Gera a ficha (quem chama já devolveu a guardada quando não é `forcar`).
 * @returns {{ok, dados?, cache?, chamouModelo, motivo?, codigo?}}
 */
async function gerar({ licitacaoId, forcar = false }) {
  const arquivos = await arquivosComTexto(licitacaoId);
  const paginas = arquivos.flatMap(paginasDoArquivo);
  if (paginas.reduce((s, p) => s + p.texto.trim().length, 0) < MINIMO_DE_TEXTO) {
    return {
      ok: false,
      codigo: 'sem_texto',
      chamouModelo: false,
      motivo: 'Ainda não há texto lido deste edital (baixe e leia os arquivos antes) ou o PDF é escaneado.',
    };
  }

  const trechos = regras.selecionarTrechos(paginas, cfg.maxCaracteres);
  const r = await ia.resumirEdital({ licitacaoId, trechos, forcar });
  if (!r.ok) return r;

  const dados = {
    ...r.dados,
    _meta: { modelo: cfg.modelo, trechos: trechos.length, arquivos: arquivos.length, descartados: r.descartados },
  };
  await pool.query('UPDATE licitacoes SET ia_ficha = ?, ia_ficha_em = NOW() WHERE id = ?', [JSON.stringify(dados), licitacaoId]);
  return { ...r, dados };
}

async function salvarConsideracoes({ organizacaoId, licitacaoId, usuarioId, texto }) {
  const limpo = String(texto || '');
  if (!limpo.trim()) {
    await pool.query('DELETE FROM resumo_consideracoes WHERE organizacao_id = ? AND licitacao_id = ?', [organizacaoId, licitacaoId]);
    return;
  }
  await pool.query(
    `INSERT INTO resumo_consideracoes (organizacao_id, licitacao_id, texto, usuario_id) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE texto = VALUES(texto), usuario_id = VALUES(usuario_id)`,
    [organizacaoId, licitacaoId, limpo, usuarioId || null]
  );
}

function tituloDe(ficha) {
  const l = ficha.licitacao;
  return `Resumo do edital — ${[l.modalidade, l.numero_compra].filter(Boolean).join(' ') || `licitação ${l.id}`}${l.orgao_nome ? ` · ${l.orgao_nome}` : ''}`;
}

/** O .docx do checklist: a mesma fonte do e-mail e da impressão. */
function gerarDocx(ficha) {
  return docx.gerar({
    titulo: tituloDe(ficha),
    subtitulo: `Gerado pela IA em ${formatarData(ficha.em)}. A IA pode errar: confira cada item no trecho citado do edital.`,
    colunas: [
      { titulo: 'Seção', largura: 14 },
      { titulo: 'Item', largura: 16 },
      { titulo: 'O que o edital diz', largura: 38 },
      { titulo: 'Trecho citado (arquivo · página)', largura: 39 },
    ],
    linhas: regras.linhasDoChecklist(ficha.dados, ficha.consideracoes),
  });
}

function textoDoEmail(ficha) {
  return regras.textoDoEmail({
    titulo: tituloDe(ficha),
    geradoEm: formatarData(ficha.em),
    dados: ficha.dados,
    consideracoes: ficha.consideracoes,
  });
}

module.exports = { obter, existe, comDados, gerar, reservarGeracao, concluirGeracao, estadoDaGeracao, salvarConsideracoes, gerarDocx, textoDoEmail, MAX_CONSIDERACOES };
