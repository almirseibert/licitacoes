// Adaptador PNCP — Portal Nacional de Contratações Públicas (seção 5.1).
// Base obrigatória: cobre federal, estadual e municipal (Lei 14.133).
const { buscarJson, buscar } = require('../servicos/http');

const BUSCA = 'https://pncp.gov.br/api/search/';
const CONSULTA = 'https://pncp.gov.br/api/consulta/v1';
// Itens, arquivos e resultados ficam no serviço pncp-api, que o portal publica em
// dois caminhos equivalentes. Em 01/11/2026 ele respondeu 503 ("No server is
// available") por indisponibilidade do PNCP, enquanto busca e detalhe seguiam de pé
// — por isso tentamos os dois caminhos antes de desistir, e a falha é só um aviso.
const APIS = ['https://pncp.gov.br/pncp-api/v1', 'https://pncp.gov.br/api/pncp/v1'];
const APP = 'https://pncp.gov.br/app/editais';

// Tenta o mesmo caminho em cada base do pncp-api; devolve o primeiro que responder.
async function buscarNaApi(caminho) {
  let ultimoErro;
  for (const base of APIS) {
    try {
      return await buscarJson(`${base}${caminho}`, { tentativas: 2 });
    } catch (erro) {
      ultimoErro = erro;
    }
  }
  throw ultimoErro;
}

// '12345678000199/2026/45' -> { cnpj, ano, sequencial }
function partesDaChave(chaveExterna) {
  const partes = String(chaveExterna).split('/');
  if (partes.length < 3) throw new Error(`Chave externa inválida para o PNCP: ${chaveExterna}`);
  const [cnpj, ano, sequencial] = partes.slice(-3);
  return { cnpj: String(cnpj).replace(/\D/g, ''), ano: Number(ano), sequencial: Number(sequencial) };
}

function esferaDoRegistro(registro) {
  const texto = `${registro.esfera_nome || ''} ${registro.poder_nome || ''}`.toLowerCase();
  if (texto.includes('federal')) return 'Federal';
  if (texto.includes('estadual')) return 'Estadual';
  if (texto.includes('municipal') || texto.includes('distrital')) return 'Municipal';
  return 'Outra';
}

function paraData(valor) {
  if (!valor) return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

function paraNumero(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

// Normaliza um registro da busca no formato que a coleta grava no banco.
function normalizar(registro, { fonteId } = {}) {
  const cnpj = String(registro.orgao_cnpj || '').replace(/\D/g, '');
  const ano = registro.ano || String(registro.data_publicacao_pncp || '').slice(0, 4);
  const sequencial = registro.numero_sequencial;
  const chaveExterna = `${cnpj}/${ano}/${sequencial}`;

  return {
    fonte_id: fonteId,
    chave_externa: chaveExterna,
    numero_controle: registro.numero_controle_pncp || null,
    orgao_cnpj: cnpj || null,
    orgao_nome: registro.orgao_nome || null,
    unidade: registro.unidade_nome || null,
    esfera: esferaDoRegistro(registro),
    uf: registro.uf || registro.uf_sigla || null,
    municipio: registro.municipio_nome || null,
    modalidade: registro.modalidade_licitacao_nome || null,
    modo_disputa: registro.modo_disputa_nome || null,
    numero_compra: registro.numero_contratacao || registro.numero || null,
    processo: registro.processo || null,
    objeto: registro.description || registro.objeto || null,
    titulo: registro.title || null,
    valor_estimado: paraNumero(registro.valor_total_estimado) ?? paraNumero(registro.valor_global),
    valor_homologado: paraNumero(registro.valor_total_homologado),
    orcamento_sigiloso: registro.indicador_orcamento_sigiloso ? 1 : 0,
    abertura_propostas: paraData(registro.data_inicio_recebimento_propostas || registro.data_inicio_vigencia),
    fim_propostas: paraData(registro.data_fim_recebimento_propostas || registro.data_fim_vigencia),
    situacao: registro.situacao_nome || (registro.tem_resultado ? 'Com resultado' : 'Recebendo proposta'),
    // usuario_nome é a plataforma onde a disputa acontece (seção 5.1).
    plataforma_disputa: registro.usuario_nome || null,
    link_portal: cnpj && ano && sequencial ? `${APP}/${cnpj}/${ano}/${sequencial}` : null,
    // A busca já traz o link da disputa; o detalhe confirma em linkSistemaOrigem.
    link_disputa: registro.link_sistema_origem || null,
    bruto: registro,
  };
}

module.exports = {
  chave: 'pncp',
  nome: 'PNCP — Portal Nacional de Contratações Públicas',

  // Descreve o formulário da tela de Fontes (Fase 2).
  camposConfig: [
    { campo: 'status', rotulo: 'Status', tipo: 'select', opcoes: ['recebendo_proposta', 'encerradas'], padrao: 'recebendo_proposta' },
    { campo: 'tipos_documento', rotulo: 'Tipo de documento', tipo: 'texto', padrao: 'edital' },
    { campo: 'tam_pagina', rotulo: 'Resultados por página', tipo: 'numero', padrao: 100 },
    { campo: 'paginas_max', rotulo: 'Máximo de páginas por termo', tipo: 'numero', padrao: 3 },
    { campo: 'ufs', rotulo: 'UFs (vazio = todas)', tipo: 'texto', padrao: '' },
  ],

  /**
   * Busca por um termo. Devolve { licitacoes, total }.
   * O PNCP aceita a expressão entre aspas para busca exata.
   */
  async buscar({ config = {}, fonteId, termo, usarAspas = true, pagina = 1 }) {
    const parametros = new URLSearchParams({
      tipos_documento: config.tipos_documento || 'edital',
      ordenacao: config.ordenacao || '-data',
      pagina: String(pagina),
      tam_pagina: String(config.tam_pagina || 100),
      status: config.status || 'recebendo_proposta',
    });
    if (termo) parametros.set('q', usarAspas ? `"${termo}"` : termo);
    if (config.ufs) parametros.set('ufs', config.ufs);

    const dados = await buscarJson(`${BUSCA}?${parametros.toString()}`);
    const itens = Array.isArray(dados && dados.items) ? dados.items : [];
    const total = Number((dados && (dados.total || dados.totalElements)) || itens.length);

    return {
      total,
      licitacoes: itens.map((registro) => normalizar(registro, { fonteId })),
    };
  },

  /** Detalhe da compra: datas, situação e o link direto da disputa. */
  async detalhar({ chaveExterna }) {
    const { cnpj, ano, sequencial } = partesDaChave(chaveExterna);
    const dados = await buscarJson(`${CONSULTA}/orgaos/${cnpj}/compras/${ano}/${sequencial}`);
    if (!dados) return null;

    return {
      modalidade: dados.modalidadeNome || null,
      modo_disputa: dados.modoDisputaNome || null,
      situacao: dados.situacaoCompraNome || null,
      numero_compra: dados.numeroCompra || null,
      processo: dados.processo || null,
      objeto: dados.objetoCompra || null,
      orgao_nome: (dados.orgaoEntidade && dados.orgaoEntidade.razaoSocial) || null,
      unidade: (dados.unidadeOrgao && dados.unidadeOrgao.nomeUnidade) || null,
      uf: (dados.unidadeOrgao && dados.unidadeOrgao.ufSigla) || null,
      municipio: (dados.unidadeOrgao && dados.unidadeOrgao.municipioNome) || null,
      abertura_propostas: paraData(dados.dataAberturaProposta),
      fim_propostas: paraData(dados.dataEncerramentoProposta),
      valor_estimado: paraNumero(dados.valorTotalEstimado),
      valor_homologado: paraNumero(dados.valorTotalHomologado),
      orcamento_sigiloso: Number(dados.orcamentoSigilosoCodigo) > 1 ? 1 : 0,
      link_disputa: dados.linkSistemaOrigem || null,
      bruto: dados,
    };
  },

  /** Itens da compra, com benefício ME/EPP por item (seção 6.3). */
  async listarItens({ chaveExterna }) {
    const { cnpj, ano, sequencial } = partesDaChave(chaveExterna);
    const dados = await buscarNaApi(`/orgaos/${cnpj}/compras/${ano}/${sequencial}/itens?pagina=1&tamanhoPagina=1000`);
    const lista = Array.isArray(dados) ? dados : (dados && dados.data) || [];

    return lista.map((item) => ({
      numero_item: paraNumero(item.numeroItem),
      descricao: item.descricao || null,
      quantidade: paraNumero(item.quantidade),
      unidade: item.unidadeMedida || item.unidadeFornecimento || null,
      valor_unit_estimado: paraNumero(item.valorUnitarioEstimado),
      valor_total_estimado: paraNumero(item.valorTotal),
      beneficio: item.tipoBeneficioNome || null,
      situacao_item: item.situacaoCompraItemNome || null,
      tem_resultado: item.temResultado ? 1 : 0,
    }));
  },

  /** Arquivos do edital. Ignora os inativos, conforme a seção 5.1. */
  async listarArquivos({ chaveExterna }) {
    const { cnpj, ano, sequencial } = partesDaChave(chaveExterna);
    const dados = await buscarNaApi(`/orgaos/${cnpj}/compras/${ano}/${sequencial}/arquivos`);
    const lista = Array.isArray(dados) ? dados : (dados && dados.data) || [];

    return lista
      .filter((arquivo) => arquivo.statusAtivo !== false)
      .map((arquivo) => ({
        sequencial: paraNumero(arquivo.sequencialDocumento),
        titulo: arquivo.titulo || arquivo.nomeArquivo || null,
        url: `${APIS[0]}/orgaos/${cnpj}/compras/${ano}/${sequencial}/arquivos/${arquivo.sequencialDocumento}`,
      }));
  },

  /** Resultado de um item (vencedor) — usado nas fases 7 e 10. */
  async resultadoDoItem({ chaveExterna, numeroItem }) {
    const { cnpj, ano, sequencial } = partesDaChave(chaveExterna);
    return buscarNaApi(`/orgaos/${cnpj}/compras/${ano}/${sequencial}/itens/${numeroItem}/resultados`);
  },

  /** Stream do arquivo para disco (Fase 3). */
  async baixarArquivo({ url }) {
    const resposta = await buscar(url, { aceitar: '*/*' });
    return {
      corpo: resposta.body,
      // O nome real vem no Content-Disposition e às vezes precisa de dois decodeURIComponent.
      disposicao: resposta.headers.get('content-disposition') || '',
      tipo: resposta.headers.get('content-type') || '',
      tamanho: Number(resposta.headers.get('content-length') || 0),
    };
  },

  partesDaChave,
  normalizar,
};
