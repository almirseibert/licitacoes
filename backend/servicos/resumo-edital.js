// Resumo do Edital 2.0 (Seção 11 do plano SaaS) — o que fala com o banco.
//
// A ficha é do edital (como `ia_resumo` da seção 23): uma por licitação, para
// todas as organizações, porque o edital é o mesmo. Gera uma vez e só refaz a
// pedido. As "considerações do licitante" são de cada organização.
const pool = require('../config/db');
const ia = require('./ia');
const docx = require('./docx');
const regras = require('../regras/resumo-edital');
const { paginasDoArquivo } = require('../regras/busca-edital');
const { arquivosComTexto } = require('./perguntas-edital');
const { ia: cfg } = require('../config/ambiente');
const { lerJson } = require('./limites');

const MINIMO_DE_TEXTO = 400;
const MAX_CONSIDERACOES = 5000;

/** A ficha guardada e as considerações da organização. */
async function obter(organizacaoId, licitacaoId) {
  const [[l]] = await pool.query(
    `SELECT l.id, l.numero_compra, l.modalidade, l.orgao_nome, l.objeto, l.ia_ficha, l.ia_ficha_em,
            c.texto AS consideracoes, c.atualizado_em AS consideracoes_em
       FROM licitacoes l
       LEFT JOIN resumo_consideracoes c ON c.licitacao_id = l.id AND c.organizacao_id = ?
      WHERE l.id = ?`,
    [organizacaoId, licitacaoId]
  );
  if (!l) return null;
  return {
    licitacao: { id: l.id, numero_compra: l.numero_compra, modalidade: l.modalidade, orgao_nome: l.orgao_nome, objeto: l.objeto },
    dados: lerJson(l.ia_ficha, null),
    em: l.ia_ficha_em,
    consideracoes: l.consideracoes || '',
    consideracoes_em: l.consideracoes_em || null,
  };
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
    _meta: {
      modelo: cfg.modelo,
      trechos: trechos.length,
      caracteres: trechos.reduce((s, t) => s + t.texto.length, 0),
      arquivos: arquivos.length,
      descartados: r.descartados,
      em: new Date().toISOString(),
    },
  };
  await pool.query('UPDATE licitacoes SET ia_ficha = ?, ia_ficha_em = NOW() WHERE id = ?', [JSON.stringify(dados), licitacaoId]);
  return { ...r, dados };
}

async function salvarConsideracoes({ organizacaoId, licitacaoId, usuarioId, texto }) {
  const limpo = String(texto || '').slice(0, MAX_CONSIDERACOES);
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

function dataBr(valor) {
  return new Date(valor).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
}

function tituloDe(ficha) {
  const l = ficha.licitacao;
  return `Resumo do edital — ${[l.modalidade, l.numero_compra].filter(Boolean).join(' ') || `licitação ${l.id}`}${l.orgao_nome ? ` · ${l.orgao_nome}` : ''}`;
}

/** O .docx do checklist: a mesma fonte do e-mail e da impressão. */
function gerarDocx(ficha) {
  return docx.gerar({
    titulo: tituloDe(ficha),
    subtitulo: `Gerado pela IA em ${dataBr(ficha.em)}. A IA pode errar: confira cada item no trecho citado do edital.`,
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
    geradoEm: dataBr(ficha.em),
    dados: ficha.dados,
    consideracoes: ficha.consideracoes,
  });
}

module.exports = { obter, gerar, salvarConsideracoes, gerarDocx, textoDoEmail, tituloDe, MAX_CONSIDERACOES };
