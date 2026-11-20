// Adaptador `compras_rs` — Central de Licitações do Rio Grande do Sul (CELIC),
// em www.compras.rs.gov.br. Não é o `generico_html` da seção 5.3 porque a
// lista de editais não vem pronta no HTML: a página de busca
// (`/editais/pesquisar`) entrega uma tabela vazia, preenchida depois por um
// POST em `/editais/pesquisa.json` que devolve JSON. Confirmado em 15/11/2026
// com requisição real — a diferença do Portal de Compras Públicas e do
// Compras.gov.br (que escondem o mesmo tipo de JSON atrás de hCaptcha ou de
// uma API só do app) é que aqui o endpoint responde sem login, sem CAPTCHA e
// sem bloqueio: é dado público de verdade, só que em JSON em vez de HTML.
//
// O servidor recusa a busca sem pelo menos um filtro: número/ano do edital,
// número do processo, OU um período (publicação ou abertura) de até 12 meses.
// Este adaptador sempre manda um período — `dias_publicacao` da config, 180
// por padrão — para que a palavra-chave sozinha baste.
const { buscarJson } = require('../servicos/http');

const BASE = 'https://www.compras.rs.gov.br';
const ENDPOINT = `${BASE}/editais/pesquisa.json`;

/** 'DD/MM/YYYY', como o formulário do CELIC espera. */
function formatarData(data) {
  const dia = String(data.getDate()).padStart(2, '0');
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${data.getFullYear()}`;
}

/** Período [hoje - dias, hoje], nas duas pontas, formatado para o formulário. */
function periodoPublicacao(dias) {
  const fim = new Date();
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - Math.min(Math.max(Number(dias) || 180, 1), 365));
  return { de: formatarData(inicio), ate: formatarData(fim) };
}

/** Epoch em milissegundos (como o CELIC devolve) -> Date, ou null. */
function paraData(epochMs) {
  if (!epochMs && epochMs !== 0) return null;
  const data = new Date(Number(epochMs));
  return Number.isNaN(data.getTime()) ? null : data;
}

// Tipo de processo devolvido pelo CELIC não é sempre "licitação" em sentido
// estrito — dispensa e inexigibilidade são contratação direta — mas a tela
// trata as três como oportunidade, igual o restante do painel já faz com o
// PNCP (seção 5.1 não distingue modalidade na entrada do Radar).
function normalizar(registro, { fonteId, agora = Date.now() }) {
  const chaveExterna = `${fonteId}:${registro.id}`;
  // O CELIC só informa `startDate`: o início da sessão (disputa). Na Lei 14.133 as propostas
  // recebem-se até a abertura da sessão, então ela é também o fim das propostas — inferência
  // marcada aqui. Sem isso toda licitação dos últimos 180 dias aparecia "recebendo proposta" para
  // sempre, inclusive as já encerradas (20/11/2026).
  const abertura = paraData(registro.startDate);

  return {
    fonte_id: fonteId,
    chave_externa: chaveExterna,
    numero_controle: registro.issuanceNumber || null,
    orgao_nome: registro.tradeOffice || null,
    esfera: 'Estadual',
    uf: 'RS',
    municipio: null,
    modalidade: registro.biddingTypeName || null,
    numero_compra: registro.issuanceNumber || null,
    processo: registro.processNumber || null,
    objeto: registro.description || null,
    abertura_propostas: abertura,
    fim_propostas: abertura,
    publicada_em: paraData(registro.publishDate),
    situacao: abertura && abertura.getTime() < agora ? 'Encerrada' : 'Recebendo proposta',
    plataforma_disputa: 'Compras RS (CELIC)',
    link_portal: registro.simplifiedIssuanceNumber
      ? `${BASE}/editais/${registro.simplifiedIssuanceNumber}/${registro.id}`
      : null,
    link_disputa: null,
    bruto: registro,
  };
}

module.exports = {
  chave: 'compras_rs',
  nome: 'Compras RS (CELIC) — editais do Estado do Rio Grande do Sul',

  camposConfig: [
    { campo: 'dias_publicacao', rotulo: 'Janela de publicação (dias, máx. 365)', tipo: 'numero', padrao: 180 },
    { campo: 'tam_pagina', rotulo: 'Resultados por página', tipo: 'numero', padrao: 50 },
    { campo: 'paginas_max', rotulo: 'Máximo de páginas por termo', tipo: 'numero', padrao: 3 },
  ],

  /** Busca por um termo (`description`). Devolve { total, licitacoes }. */
  async buscar({ config = {}, fonteId, termo, pagina = 1 }) {
    const tamPagina = Number(config.tam_pagina || 50);
    const { de, ate } = periodoPublicacao(config.dias_publicacao);

    const parametros = new URLSearchParams({
      draw: '1',
      start: String((pagina - 1) * tamPagina),
      length: String(tamPagina),
      publicationStartDate: de,
      publicationEndDate: ate,
    });
    if (termo) parametros.set('description', termo);

    const dados = await buscarJson(ENDPOINT, {
      metodo: 'POST',
      corpo: parametros.toString(),
      cabecalhos: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      },
      aceitar: 'application/json, text/plain, */*',
    });

    const registros = Array.isArray(dados && dados.data) ? dados.data : [];

    return {
      total: Number((dados && dados.iTotalDisplayRecords) || registros.length),
      licitacoes: registros.map((registro) => normalizar(registro, { fonteId })),
    };
  },

  /**
   * O CELIC não publica o chat do pregão em consulta pública própria: a
   * disputa roda noutro sistema (Portal do Fornecedor RS). Sem link para
   * seguir, a leitura diz isso em vez de inventar uma URL.
   */
  async listarMensagens() {
    const erro = new Error('O CELIC não tem consulta pública do chat da disputa nesta fonte.');
    erro.semConsulta = true;
    throw erro;
  },

  async detalhar() {
    return null;
  },

  formatarData,
  periodoPublicacao,
  paraData,
  normalizar,
};
