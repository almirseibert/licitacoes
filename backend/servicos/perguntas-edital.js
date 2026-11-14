// Pergunte ao Edital (Seção 5 do plano SaaS) — do pedido à resposta gravada.
//
// Fluxo: a rota grava a pergunta como 'pendente' e devolve o id; `processar`
// roda em seguida, fora da requisição, e a tela consulta até a linha mudar
// para 'respondida' ou 'erro'. Falha do modelo vira mensagem gravada — a tela
// nunca fica "digitando" para sempre: pendente mais velha que o timeout do
// modelo é dada como interrompida na próxima consulta.
const pool = require('../config/db');
const { ia: cfg } = require('../config/ambiente');
const ia = require('./ia');
const limites = require('./limites');
const busca = require('../regras/busca-edital');
const biblioteca = require('../config/dados/perguntas-edital');

// Perguntas em andamento por organização: acima disso, 429. Segura o gasto de
// quem dispara a biblioteca inteira de uma vez e o estouro do limite do mês
// (a contagem só sobe quando o modelo responde).
const MAX_PENDENTES = 3;
const MINIMO = 5;
const MAXIMO = 500;

/** Segundos depois dos quais uma pendente é dada como interrompida. */
const ESPERA_MAXIMA_S = Math.ceil(cfg.timeoutMs / 1000) + 60;

/** O que quem perguntou lê quando o modelo falha (o motivo técnico fica no log). */
function mensagemDeFalha(r) {
  if (r.desligada) return 'O Pergunte ao Edital está desligado neste servidor.';
  if (/formato esperado/.test(r.motivo)) return 'A IA respondeu fora do formato esperado e a resposta foi descartada. Pergunte de novo.';
  if (/não respondeu em/.test(r.motivo)) return 'A IA demorou demais para responder. Tente de novo em instantes.';
  return 'A IA não respondeu agora. Tente de novo em instantes.';
}

/** Páginas de todos os arquivos atuais da licitação (a versão mais recente de cada um). */
async function paginasDaLicitacao(licitacaoId) {
  const [arquivos] = await pool.query(
    `SELECT a.id, COALESCE(a.titulo, a.nome_arquivo) AS nome, a.extensao, a.paginas, a.texto_extraido AS texto
       FROM licitacao_arquivos a
       JOIN (SELECT sequencial, MAX(versao) AS versao
               FROM licitacao_arquivos WHERE licitacao_id = ? AND status = 'ok'
              GROUP BY sequencial) u
         ON u.sequencial = a.sequencial AND u.versao = a.versao
      WHERE a.licitacao_id = ? AND a.status = 'ok' AND a.texto_extraido IS NOT NULL
      ORDER BY a.sequencial`,
    [licitacaoId, licitacaoId]
  );
  return arquivos.flatMap((a) => busca.paginasDoArquivo(a));
}

function lerJsonColuna(valor) {
  if (valor == null) return null;
  return typeof valor === 'string' ? JSON.parse(valor) : valor;
}

/** Linha do banco → o que a tela recebe. */
function formatar(linha) {
  return {
    id: linha.id,
    licitacao_id: linha.licitacao_id,
    pergunta: linha.pergunta,
    pronta_codigo: linha.pronta_codigo,
    situacao: linha.situacao,
    resposta: lerJsonColuna(linha.resposta),
    erro: linha.erro,
    cache: Boolean(linha.cache),
    salva: Boolean(linha.salva),
    autor: linha.autor || null,
    criado_em: linha.criado_em,
    respondida_em: linha.respondida_em,
  };
}

/**
 * Valida o pedido. @returns {{ erro } | { pergunta, pronta, dicas }}
 */
function lerPedido(corpo = {}) {
  if (corpo.pronta) {
    const pronta = biblioteca.PORCODIGO.get(String(corpo.pronta));
    if (!pronta) return { erro: 'Pergunta pronta não encontrada.' };
    return { pergunta: pronta.pergunta, pronta: pronta.codigo, dicas: pronta.termos };
  }
  const pergunta = typeof corpo.pergunta === 'string' ? corpo.pergunta.replace(/\s+/g, ' ').trim() : '';
  if (pergunta.length < MINIMO) return { erro: `Escreva a pergunta (pelo menos ${MINIMO} letras).` };
  if (pergunta.length > MAXIMO) return { erro: `A pergunta passa de ${MAXIMO} caracteres — resuma.` };
  return { pergunta, pronta: null, dicas: [] };
}

async function pendentes(organizacaoId) {
  const [[r]] = await pool.query(
    `SELECT COUNT(*) AS n FROM ia_perguntas
      WHERE organizacao_id = ? AND situacao = 'pendente'
        AND criado_em >= NOW() - INTERVAL ? SECOND`,
    [organizacaoId, ESPERA_MAXIMA_S]
  );
  return Number(r.n);
}

async function criar({ organizacaoId, licitacaoId, usuarioId, pergunta, pronta }) {
  const [r] = await pool.query(
    'INSERT INTO ia_perguntas (organizacao_id, licitacao_id, usuario_id, pergunta, pronta_codigo) VALUES (?, ?, ?, ?, ?)',
    [organizacaoId, licitacaoId, usuarioId, pergunta, pronta]
  );
  return r.insertId;
}

async function concluir(organizacaoId, id, { resposta = null, erro = null, cache = false }) {
  await pool.query(
    `UPDATE ia_perguntas
        SET situacao = ?, resposta = ?, erro = ?, cache = ?, respondida_em = NOW()
      WHERE id = ? AND organizacao_id = ? AND situacao = 'pendente'`,
    [erro ? 'erro' : 'respondida', resposta ? JSON.stringify(resposta) : null, erro ? String(erro).slice(0, 500) : null, cache ? 1 : 0, id, organizacaoId]
  );
}

/**
 * Responde uma pergunta gravada. Nunca lança: todo desfecho vira linha
 * 'respondida' ou 'erro'.
 */
async function processar({ organizacaoId, id, dicas = [] }) {
  try {
    const [[linha]] = await pool.query('SELECT * FROM ia_perguntas WHERE id = ? AND organizacao_id = ?', [id, organizacaoId]);
    if (!linha || linha.situacao !== 'pendente') return;

    const paginas = await paginasDaLicitacao(linha.licitacao_id);
    const caracteres = paginas.reduce((s, p) => s + p.texto.length, 0);
    if (caracteres < 200) {
      return await concluir(organizacaoId, id, {
        erro: 'Este edital ainda não tem texto lido: baixe os arquivos e rode a leitura (ou o PDF é escaneado, sem texto).',
      });
    }

    const trechos = busca.buscarTrechos(paginas, linha.pergunta, { dicas });
    if (!trechos.length) {
      // Sem trecho, não se gasta modelo: a resposta honesta é que o texto não fala disso.
      return await concluir(organizacaoId, id, {
        resposta: {
          resposta: 'Não encontrei no texto lido do edital nenhum trecho que trate disso. Confira os anexos que não puderam ser lidos.',
          encontrado: false,
          citacoes: [],
          confianca: null,
          _meta: { trechos: 0, suspeitos: [], descartados: [] },
        },
      });
    }

    const r = await ia.perguntar({ licitacaoId: linha.licitacao_id, pergunta: linha.pergunta, trechos });
    // Contou o que custou: resposta nova do modelo, válida ou fora do schema.
    if ((r.ok && !r.cache) || r.cobrar) await limites.registrarUso(organizacaoId, 'ia_perguntas_mes');
    if (!r.ok) {
      // O técnico (corpo da API, status) vai para o log; a tela recebe português.
      console.error('Pergunte ao Edital — o modelo falhou na pergunta', id, '—', r.motivo);
      return await concluir(organizacaoId, id, { erro: mensagemDeFalha(r) });
    }

    return await concluir(organizacaoId, id, {
      cache: r.cache,
      resposta: {
        ...r.dados,
        _meta: {
          modelo: cfg.modelo,
          trechos: trechos.length,
          // Trecho do edital com texto dirigido à IA: a tela avisa.
          suspeitos: trechos.filter((t) => busca.pareceInstrucao(t.texto)).map((t) => t.id),
          descartados: r.descartados || [],
        },
      },
    });
  } catch (erro) {
    console.error('Pergunte ao Edital — falha ao processar', id, erro.message);
    await concluir(organizacaoId, id, { erro: 'Não foi possível responder agora. Tente de novo em instantes.' }).catch(() => {});
  }
}

/** Pendente velha demais (API reiniciou no meio, por exemplo) vira erro com mensagem. */
async function encerrarInterrompidas(organizacaoId) {
  await pool.query(
    `UPDATE ia_perguntas
        SET situacao = 'erro', erro = 'A resposta foi interrompida. Pergunte de novo.', respondida_em = NOW()
      WHERE organizacao_id = ? AND situacao = 'pendente' AND criado_em < NOW() - INTERVAL ? SECOND`,
    [organizacaoId, ESPERA_MAXIMA_S]
  );
}

const SELECAO = `SELECT p.*, u.nome AS autor FROM ia_perguntas p LEFT JOIN usuarios u ON u.id = p.usuario_id`;

async function listar(organizacaoId, licitacaoId) {
  await encerrarInterrompidas(organizacaoId);
  const [linhas] = await pool.query(
    `${SELECAO} WHERE p.organizacao_id = ? AND p.licitacao_id = ? ORDER BY p.criado_em DESC, p.id DESC LIMIT 100`,
    [organizacaoId, licitacaoId]
  );
  return linhas.map(formatar);
}

async function obter(organizacaoId, licitacaoId, id) {
  await encerrarInterrompidas(organizacaoId);
  const [[linha]] = await pool.query(`${SELECAO} WHERE p.id = ? AND p.organizacao_id = ? AND p.licitacao_id = ?`, [
    id,
    organizacaoId,
    licitacaoId,
  ]);
  return linha ? formatar(linha) : null;
}

async function marcarSalva(organizacaoId, licitacaoId, id, salva) {
  const [r] = await pool.query(
    'UPDATE ia_perguntas SET salva = ? WHERE id = ? AND organizacao_id = ? AND licitacao_id = ?',
    [salva ? 1 : 0, id, organizacaoId, licitacaoId]
  );
  return r.affectedRows > 0;
}

module.exports = {
  MAX_PENDENTES,
  ESPERA_MAXIMA_S,
  lerPedido,
  pendentes,
  criar,
  processar,
  listar,
  obter,
  marcarSalva,
  paginasDaLicitacao,
};
