// Webhook de novas oportunidades (Seção 14 do PLANO_SAAS_CONLICITACAO.md).
//
// De hora em hora, para cada webhook ativo de uma organização com o recurso
// `api` e a assinatura em dia: calcula o que é NOVO para o filtro salvo dele
// (o mesmo casamento do boletim, ou os filtros do Radar para pesquisa salva),
// e manda em lotes de até 50, assinado com HMAC. Um item só conta como entregue
// quando a URL do cliente respondeu 2xx — falha deixa o item para a próxima
// rodada. Dez falhas seguidas desligam o webhook (o cliente religa pela tela).
const pool = require('../config/db');
const escopo = require('../servicos/escopo');
const limites = require('../servicos/limites');
const webhook = require('../servicos/webhook');
const { filtrosDe, COLUNAS_LISTA } = require('../servicos/radar');
const { jwt, urlPublica } = require('../config/ambiente');
const regras = require('../regras/api');
const regrasBoletim = require('../regras/boletim');
const boletim = require('./boletim');

const DIAS_JANELA = 7;
const MAX_FALHAS = 10;
const MAX_NOVOS = 200;
// Webhooks entregues ao mesmo tempo (cada um é um destino de cliente; 10 s de limite por lote).
const ENTREGAS_EM_PARALELO = 4;

const lerJson = (valor, padrao) => limites.lerJson(valor, padrao) || padrao;

/** O mesmo segredo que a tela mostrou na criação: sal do banco + segredo da aplicação. */
function segredoDe(linha) {
  return regras.segredoDoWebhook(jwt.segredo, linha.segredo_sal);
}

async function selecionarDoRadar(linha, perfil) {
  const { onde, valores } = await filtrosDe(lerJson(perfil.filtros, {}), linha.organizacao_id, null);
  const extras = [
    'l.criado_em >= NOW() - INTERVAL ? DAY',
    'l.criado_em >= ?',
    '(l.fim_propostas IS NULL OR l.fim_propostas > NOW())',
    'NOT EXISTS (SELECT 1 FROM webhook_itens wi WHERE wi.webhook_id = ? AND wi.licitacao_id = l.id)',
  ];
  const [linhas] = await pool.query(
    `SELECT ${COLUNAS_LISTA}
       FROM ${escopo.daOrganizacao(linha.organizacao_id)} l JOIN fontes f ON f.id = l.fonte_id
       ${onde ? `${onde} AND` : 'WHERE'} ${extras.join(' AND ')}
      ORDER BY l.criado_em ASC, l.id ASC LIMIT ${MAX_NOVOS}`,
    [...valores, DIAS_JANELA, linha.entregar_desde, linha.id]
  );
  return linhas;
}

/** O que há de novo para um webhook. Não grava nada. */
async function selecionarNovos(linha) {
  const [[perfil]] = await pool.query(
    'SELECT * FROM perfis_busca WHERE id = ? AND organizacao_id = ?',
    [linha.perfil_id, linha.organizacao_id]
  );
  if (!perfil) return { perfil: null, itens: [] };
  // Filtro do boletim pausado pelo usuário não alimenta webhook (a pesquisa do Radar tem ativo=0 sempre).
  if (perfil.origem === 'boletim' && !perfil.ativo) return { perfil, itens: [] };
  if (perfil.origem === 'radar') return { perfil, itens: await selecionarDoRadar(linha, perfil) };
  const itens = await boletim.selecionar(regrasBoletim.lerPerfil(perfil), {
    dias: DIAS_JANELA,
    webhookId: linha.id,
    desde: linha.entregar_desde,
  });
  return { perfil, itens: itens.slice(0, MAX_NOVOS) };
}

async function podeEntregar(organizacaoId) {
  const dados = await limites.daOrganizacao(organizacaoId);
  if (!dados) return false;
  if (dados.isenta) return true;
  return limites.temRecurso(dados.plano, 'api') && dados.situacao.pode_escrever;
}

async function anotar(id, { ok, detalhe, status }) {
  if (ok) {
    await pool.query(
      "UPDATE webhooks SET ultima_entrega_em = NOW(), ultimo_status = 'ok', ultimo_detalhe = ?, falhas_seguidas = 0 WHERE id = ?",
      [String(detalhe).slice(0, 255), id]
    );
    return;
  }
  // Desliga no mesmo UPDATE que conta a falha: sem janela entre ler e escrever.
  // `ativo` vem ANTES de `falhas_seguidas` no SET de propósito: o MySQL aplica as
  // atribuições da esquerda para a direita, e depois de somar 1 a conta já estaria
  // adiantada — o webhook desligaria na 9ª falha, não na 10ª.
  await pool.query(
    `UPDATE webhooks
        SET ativo = IF(falhas_seguidas + 1 >= ?, 0, ativo),
            falhas_seguidas = falhas_seguidas + 1, ultimo_status = ?, ultimo_detalhe = ?
      WHERE id = ?`,
    [MAX_FALHAS, status ? `http_${status}`.slice(0, 20) : 'erro', String(detalhe).slice(0, 255), id]
  );
}

/** Entrega o que há de novo de UM webhook. `simular` só calcula. */
async function entregarUm(linha, { simular = false } = {}) {
  const { perfil, itens } = await selecionarNovos(linha);
  if (!perfil) return { webhook_id: linha.id, novos: 0, entregues: 0, erro: 'filtro apagado' };
  if (simular || !itens.length) return { webhook_id: linha.id, filtro: perfil.nome, novos: itens.length, entregues: 0, simulado: simular };

  const segredo = segredoDe(linha);
  let entregues = 0;
  let falha = null;
  for (let i = 0; i < itens.length; i += regras.MAX_ITENS_POR_ENTREGA) {
    const lote = itens.slice(i, i + regras.MAX_ITENS_POR_ENTREGA);
    const payload = regras.montarPayload({
      webhook: linha,
      perfil,
      itens: lote,
      urlPublica,
      // Mesmo id para o mesmo lote: se o registro falhar depois do 2xx, o reenvio é reconhecível.
      entregaId: regras.entregaIdDoLote(linha.id, lote.map((l) => l.id)),
    });
    const r = await webhook.entregar({ webhook: linha, segredo, payload });
    if (!r.ok) {
      falha = r;
      break;
    }
    // INSERT IGNORE: a chave primária segura a repetição se duas rodadas se cruzarem.
    await pool.query('INSERT IGNORE INTO webhook_itens (webhook_id, organizacao_id, licitacao_id) VALUES ?', [lote.map((l) => [linha.id, linha.organizacao_id, l.id])]);
    entregues += lote.length;
  }
  await anotar(linha.id, falha || { ok: true, detalhe: `${entregues} oportunidade(s) entregue(s)` });
  return { webhook_id: linha.id, filtro: perfil.nome, novos: itens.length, entregues, erro: falha ? falha.detalhe : null };
}

/** Rodada do worker (e `npm run webhooks`). */
async function rodar({ org = null, webhookId = null, simular = false } = {}) {
  const condicoes = ["w.ativo = 1", "o.status <> 'suspensa'"];
  const valores = [];
  if (org) {
    condicoes.push('w.organizacao_id = ?');
    valores.push(escopo.idOrganizacao(org));
  }
  if (webhookId) {
    condicoes.push('w.id = ?');
    valores.push(Number(webhookId));
  }
  const [lista] = await pool.query(
    `SELECT w.* FROM webhooks w JOIN organizacoes o ON o.id = w.organizacao_id WHERE ${condicoes.join(' AND ')} ORDER BY w.id`,
    valores
  );
  const resultado = { webhooks: lista.length, entregas: [], erros: [] };
  const pode = new Map();
  const condicao = async (organizacaoId) => {
    if (!pode.has(organizacaoId)) pode.set(organizacaoId, podeEntregar(organizacaoId));
    return pode.get(organizacaoId);
  };
  // Em paralelo, com teto: um destino lento (até 10 s por lote) não segura os outros. O resultado
  // volta na ordem do webhook, que é a que o relatório do job mostra.
  const porPosicao = new Array(lista.length);
  await emParalelo(lista, ENTREGAS_EM_PARALELO, async (linha, i) => {
    try {
      if (!(await condicao(linha.organizacao_id))) return;
      porPosicao[i] = { organizacao_id: linha.organizacao_id, ...(await entregarUm(linha, { simular })) };
    } catch (erro) {
      resultado.erros.push(`webhook ${linha.id}: ${erro.sqlMessage || erro.message}`);
    }
  });
  resultado.entregas = porPosicao.filter(Boolean);
  return resultado;
}

/** Roda `fn(item, posição)` com no máximo `limite` ao mesmo tempo; espera todos. */
async function emParalelo(itens, limite, fn) {
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < itens.length) {
      const i = proximo;
      proximo += 1;
      await fn(itens[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
}

module.exports = { rodar, emParalelo, entregarUm, selecionarNovos, segredoDe, MAX_FALHAS };
