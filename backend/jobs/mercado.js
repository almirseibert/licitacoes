// Coleta do mercado (Seção 12 do PLANO_SAAS_CONLICITACAO.md): contratos e atas
// de registro de preços publicados no PNCP, e as publicações posteriores ao
// edital (homologação, revogação, anulação, suspensão) de qualquer contratação.
//
// Formato e limites conferidos no PNCP em 14/11/2026:
//   · /api/search com tipos_documento=contrato|ata filtra por UF (`ufs`) — a
//     consulta /v1/contratos IGNORA o parâmetro `uf` e devolve o Brasil inteiro
//     (9.581 contratos num só dia), por isso contratos e atas vêm da busca;
//   · a busca vem do mais novo para o mais velho (createdAt do índice) e só
//     alcança os 10.000 primeiros resultados (página 51 de 200 → 400): em RS
//     isso dá ~16 dias de contratos. A rodada diária cabe com folga; carga
//     histórica além disso fica na 12b;
//   · a ata NÃO traz fornecedor nem valor (nem na busca, nem no detalhe
//     /pncp-api/v1/orgaos/{cnpj}/compras/{ano}/{seq}/atas/{n});
//   · /v1/contratacoes/atualizacao filtra por UF e exige a modalidade: é dela
//     que sai a homologação (valorTotalHomologado) e a situação da compra.
// Conduta da seção 5.4 pelo cliente HTTP único (servicos/http.js).
const pool = require('../config/db');
const fila = require('../servicos/fila');
const { buscarJson } = require('../servicos/http');
const alertas = require('../servicos/alertas');
const regras = require('../regras/mercado');

const BUSCA = 'https://pncp.gov.br/api/search/';
const CONSULTA = 'https://pncp.gov.br/api/consulta/v1';
// 500 por página falhou 3 de 3 vezes em contratos (resposta vazia a ~1,8 MB); 200 passa.
const TAM_PAGINA = 200;
const JANELA_BUSCA = 10000; // teto de resultados da busca do PNCP
// Modalidades da Lei 14.133 no PNCP (manual da API de consulta, tabela 5.2).
const MODALIDADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
// Publicação que chega com mais de 30 dias não vira alerta: é carga atrasada,
// não novidade.
const DIAS_ALERTA = 30;

const COLUNAS = {
  contrato: [
    'numero_controle', 'numero_controle_compra', 'numero_contrato', 'tipo', 'orgao_cnpj', 'orgao_nome',
    'unidade', 'esfera', 'poder', 'uf', 'municipio', 'modalidade', 'objeto', 'valor_global',
    'fornecedor_ni', 'fornecedor_nome', 'data_assinatura', 'vigencia_inicio', 'vigencia_fim',
    'cancelado', 'publicado_em', 'atualizado_pncp_em',
  ],
  ata: [
    'numero_controle', 'numero_controle_compra', 'numero_ata', 'orgao_cnpj', 'orgao_nome', 'unidade',
    'esfera', 'poder', 'uf', 'municipio', 'modalidade', 'objeto', 'valor_global', 'fornecedor_ni',
    'fornecedor_nome', 'permite_adesao', 'data_assinatura', 'vigencia_inicio', 'vigencia_fim',
    'cancelado', 'publicado_em', 'atualizado_pncp_em',
  ],
  publicacao: [
    'chave', 'numero_controle_compra', 'tipo', 'descricao', 'ocorrido_em', 'orgao_cnpj', 'orgao_nome',
    'esfera', 'uf', 'municipio', 'modalidade', 'numero_compra', 'objeto', 'valor',
  ],
};
const TABELA = { contrato: 'mercado_contratos', ata: 'mercado_atas' };

/**
 * Upsert em lote. Catálogo público: atualizar é seguro (não há decisão de
 * usuário aqui). `manter` = colunas que a atualização não toca. Devolve quantas
 * linhas foram enviadas (affectedRows conta 2 por linha atualizada).
 */
async function gravar(tabela, colunas, linhas, { manter = [] } = {}) {
  if (!linhas.length) return 0;
  const marcas = `(${colunas.map(() => '?').join(', ')})`;
  const atualizaveis = colunas.slice(1).filter((c) => !manter.includes(c));
  const sufixo = `ON DUPLICATE KEY UPDATE ${atualizaveis.map((c) => `${c} = VALUES(${c})`).join(', ')}`;
  await pool.query(
    `INSERT INTO ${tabela} (${colunas.join(', ')}) VALUES ${linhas.map(() => marcas).join(', ')} ${sufixo}`,
    linhas.flatMap((l) => colunas.map((c) => (l[c] === undefined ? null : l[c])))
  );
  return linhas.length;
}

async function lerCursor(tipo, uf) {
  const [[linha]] = await pool.query(
    "SELECT DATE_FORMAT(ate, '%Y-%m-%d %H:%i:%s') AS ate FROM mercado_coletas WHERE tipo = ? AND uf = ?",
    [tipo, uf]
  );
  return linha ? linha.ate : null;
}

async function salvarCursor(tipo, uf, { ate, status, gravados, erro = null }) {
  await pool.query(
    `INSERT INTO mercado_coletas (tipo, uf, ate, ultima_execucao, ultimo_status, gravados, ultimo_erro)
     VALUES (?, ?, ?, NOW(), ?, ?, ?)
     ON DUPLICATE KEY UPDATE ate = COALESCE(VALUES(ate), ate), ultima_execucao = NOW(),
       ultimo_status = VALUES(ultimo_status), gravados = VALUES(gravados), ultimo_erro = VALUES(ultimo_erro)`,
    [tipo, uf, ate, status, gravados, erro ? String(erro).slice(0, 255) : null]
  );
}

const diasAtras = (n) => regras.sqlUtc(new Date(Date.now() - n * 86400000));

const TAM_MINIMO = 50;

/**
 * Uma faixa da busca (`inicio` múltiplo de `tamanho`). A busca do PNCP às vezes
 * fecha a conexão sem resposta numa página e responde a mesma faixa em pedaços
 * menores (medido em 14/11/2026: 3 de 5 páginas falharam e as metades passaram).
 * Se a página inteira falha depois das 3 tentativas, pede as duas metades.
 */
async function paginaDaBusca({ tipo, uf, inicio, tamanho }) {
  const parametros = new URLSearchParams({
    q: '',
    tipos_documento: tipo,
    ordenacao: '-data',
    pagina: String(inicio / tamanho + 1),
    tam_pagina: String(tamanho),
    ufs: uf,
    status: 'todos',
  });
  try {
    const dados = await buscarJson(`${BUSCA}?${parametros}`, { tentativas: 6 });
    return Array.isArray(dados && dados.items) ? dados.items : [];
  } catch (erro) {
    if (tamanho / 2 < TAM_MINIMO || (erro.status && erro.status < 500)) throw erro;
    const metade = tamanho / 2;
    const primeira = await paginaDaBusca({ tipo, uf, inicio, tamanho: metade });
    if (primeira.length < metade) return primeira;
    return primeira.concat(await paginaDaBusca({ tipo, uf, inicio: inicio + metade, tamanho: metade }));
  }
}

/**
 * Contratos ou atas de uma UF, do mais novo para trás, até alcançar o que já
 * foi gravado (o cursor) ou `desdeDias` na primeira vez.
 * O cursor só avança quando a rodada alcança o ponto anterior: parar no meio
 * (limite de páginas, erro, teto da busca) deixaria um buraco que ninguém veria.
 */
async function coletarIndice({ tipo, uf, desdeDias = 7, paginasMax = JANELA_BUSCA / TAM_PAGINA }) {
  const cursor = (await lerCursor(tipo, uf)) || diasAtras(desdeDias);
  const normalizar = tipo === 'contrato' ? regras.normalizarContrato : regras.normalizarAta;
  let gravados = 0;
  let lidos = 0;
  let maisNovo = null;
  let alcancou = false;
  let erro = null;

  let paginas = 0;
  for (let pagina = 1; pagina <= paginasMax && pagina * TAM_PAGINA <= JANELA_BUSCA; pagina += 1) {
    paginas = pagina;
    let itens;
    try {
      itens = await paginaDaBusca({ tipo, uf, inicio: (pagina - 1) * TAM_PAGINA, tamanho: TAM_PAGINA });
    } catch (e) {
      erro = e.message;
      break;
    }
    if (!itens.length) {
      alcancou = true; // acabou o índice antes do cursor
      break;
    }
    const novos = [];
    for (const item of itens) {
      const criado = regras.instante(item.createdAt);
      if (!maisNovo || (criado && criado > maisNovo)) maisNovo = criado;
      if (criado && criado <= cursor) {
        alcancou = true;
        continue;
      }
      const linha = normalizar(item);
      if (linha.numero_controle) novos.push(linha);
    }
    lidos += itens.length;
    // Mesmo registro duas vezes na página (reindexado) não pode virar dois valores no mesmo INSERT.
    const unicos = [...new Map(novos.map((l) => [l.numero_controle, l])).values()];
    gravados += await gravar(TABELA[tipo], COLUNAS[tipo], unicos);
    await gravar(
      'mercado_publicacoes',
      COLUNAS.publicacao,
      unicos.map((l) => regras.publicacaoDe(tipo, l)).filter(Boolean)
    );
    if (alcancou || itens.length < TAM_PAGINA) {
      alcancou = true;
      break;
    }
  }

  // Bateu no teto da busca (10.000) sem alcançar o cursor: o que ficou entre os
  // dois não tem como ser lido pela busca. O cursor avança mesmo assim (senão
  // nunca mais sai do lugar) e o buraco fica registrado para quem olhar a coleta.
  const tetoDaBusca = !alcancou && !erro && paginas * TAM_PAGINA >= JANELA_BUSCA;
  const status = erro ? 'erro' : alcancou ? 'ok' : 'parcial';
  await salvarCursor(tipo, uf, {
    ate: alcancou || tetoDaBusca ? maisNovo : null,
    status,
    gravados,
    erro: erro || (tetoDaBusca ? `teto de ${JANELA_BUSCA} da busca: buraco entre ${cursor} e o mais antigo lido` : null),
  });
  return { tipo, uf, lidos, gravados, status, erro };
}

const paraConsulta = (dataSql) => dataSql.slice(0, 10).replace(/-/g, '');

/**
 * Homologação e situação (revogada/anulada/suspensa) das contratações da UF
 * atualizadas desde o último dia conferido. A consulta é por dia e exige a
 * modalidade; 13 modalidades × dias × páginas de 50.
 */
async function coletarAcompanhamentos({ uf, desdeDias = 2, paginasMax = 40 }) {
  const cursor = (await lerCursor('acompanhamento', uf)) || diasAtras(desdeDias);
  const inicio = paraConsulta(cursor);
  // O dia da consulta é o de Brasília; o cursor guarda esse dia (00:00), não um instante.
  const fim = paraConsulta(regras.hojeEmBrasilia());
  let gravados = 0;
  let lidos = 0;
  const erros = [];

  for (const modalidade of MODALIDADES) {
    for (let pagina = 1; pagina <= paginasMax; pagina += 1) {
      const url =
        `${CONSULTA}/contratacoes/atualizacao?dataInicial=${inicio}&dataFinal=${fim}` +
        `&codigoModalidadeContratacao=${modalidade}&uf=${uf}&pagina=${pagina}&tamanhoPagina=50`;
      let dados;
      try {
        dados = await buscarJson(url);
      } catch (e) {
        erros.push(`modalidade ${modalidade}: ${e.message}`);
        break;
      }
      const itens = Array.isArray(dados && dados.data) ? dados.data : [];
      lidos += itens.length;
      const publicacoes = itens.flatMap(regras.publicacoesDaContratacao);
      // A homologação de um mês atrás que recebe outra atualização hoje não é
      // novidade: ocorrido_em fica o da primeira vez que foi vista.
      gravados += await gravar('mercado_publicacoes', COLUNAS.publicacao, publicacoes, { manter: ['ocorrido_em'] });
      if (!dados || !dados.paginasRestantes) break;
      if (pagina === paginasMax) erros.push(`modalidade ${modalidade}: parou na página ${paginasMax} com ${dados.paginasRestantes} restante(s)`);
    }
  }

  // Dia a dia: a próxima rodada recomeça no dia de hoje (atualizações do resto
  // do dia), nunca pula para amanhã.
  const status = erros.length ? (erros.length === MODALIDADES.length ? 'erro' : 'parcial') : 'ok';
  await salvarCursor('acompanhamento', uf, {
    ate: status === 'ok' ? `${fim.slice(0, 4)}-${fim.slice(4, 6)}-${fim.slice(6)} 00:00:00` : null,
    status,
    gravados,
    erro: erros[0] || null,
  });
  return { tipo: 'acompanhamento', uf, lidos, gravados, status, erro: erros[0] || null };
}

/**
 * Alerta às organizações que favoritaram a licitação quando ela recebe uma
 * publicação nova. Cada publicação é olhada uma vez (`avisado_em`).
 */
async function avisarFavoritas() {
  // O teto fixa o lote: o que chegar enquanto isto roda fica para a próxima.
  const [[{ teto }]] = await pool.query('SELECT COALESCE(MAX(id), 0) AS teto FROM mercado_publicacoes');
  const [pendentes] = await pool.query(
    `SELECT p.id, p.tipo, p.descricao, p.ocorrido_em, ol.organizacao_id, l.id AS licitacao_id, l.objeto
       FROM mercado_publicacoes p
       JOIN licitacoes l ON l.numero_controle = p.numero_controle_compra
       JOIN org_licitacoes ol ON ol.licitacao_id = l.id AND ol.favorito = 1
      WHERE p.avisado_em IS NULL AND p.id <= ?
        AND (p.ocorrido_em IS NULL OR p.ocorrido_em >= DATE_SUB(NOW(), INTERVAL ? DAY))`,
    [teto, DIAS_ALERTA]
  );
  let criados = 0;
  for (const p of pendentes) {
    const criou = await alertas.criar({
      organizacaoId: p.organizacao_id,
      tipo: 'acompanhamento',
      chave: `acompanhamento:${p.id}`,
      licitacaoId: p.licitacao_id,
      mensagem: `${regras.ROTULOS_PUBLICACAO[p.tipo]} em favorita: ${p.descricao || ''} — ${String(p.objeto || '').slice(0, 160)}`,
    });
    if (criou) criados += 1;
  }
  await pool.query('UPDATE mercado_publicacoes SET avisado_em = NOW() WHERE avisado_em IS NULL AND id <= ?', [teto]);
  return { criados };
}

function ufsConfiguradas() {
  const ufs = String(process.env.MERCADO_UFS || 'RS')
    .split(',')
    .map((u) => u.trim().toUpperCase())
    .filter((u) => /^[A-Z]{2}$/.test(u));
  return ufs.length ? ufs : ['RS'];
}

/** Uma rodada completa: contratos, atas e acompanhamentos de cada UF, depois os alertas. */
async function rodar({ ufs = ufsConfiguradas(), tipos = ['contrato', 'ata', 'acompanhamento'], ...opcoes } = {}) {
  const resultados = [];
  for (const uf of ufs) {
    for (const tipo of tipos) {
      resultados.push(
        tipo === 'acompanhamento'
          ? await coletarAcompanhamentos({ uf, ...opcoes })
          : await coletarIndice({ tipo, uf, ...opcoes })
      );
    }
  }
  const avisos = await avisarFavoritas();
  return { resultados, alertas: avisos.criados };
}

function registrarNaFila() {
  fila.registrar('coletar_mercado', (payload) => rodar(payload || {}));
}

module.exports = { registrarNaFila, rodar, coletarIndice, coletarAcompanhamentos, avisarFavoritas, ufsConfiguradas };
