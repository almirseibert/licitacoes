// Cliente da API. Guarda o token do painel (o mesmo JWT do CRM) no localStorage.
const BASE = import.meta.env.VITE_API_URL || '/api';
const CHAVE_TOKEN = 'licitacoes.token';
const CHAVE_USUARIO = 'licitacoes.usuario';

export function obterToken() {
  return localStorage.getItem(CHAVE_TOKEN);
}

export function obterUsuario() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_USUARIO) || 'null');
  } catch {
    return null;
  }
}

export function guardarSessao(token, usuario) {
  localStorage.setItem(CHAVE_TOKEN, token);
  localStorage.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
}

export function encerrarSessao() {
  localStorage.removeItem(CHAVE_TOKEN);
  localStorage.removeItem(CHAVE_USUARIO);
}

async function requisitar(caminho, opcoes = {}) {
  const token = obterToken();
  const resposta = await fetch(`${BASE}${caminho}`, {
    ...opcoes,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opcoes.headers || {}),
    },
  });

  if (resposta.status === 401) {
    encerrarSessao();
    window.location.reload();
    throw new Error('Sessão expirada.');
  }

  const texto = await resposta.text();
  const dados = texto ? JSON.parse(texto) : null;

  if (!resposta.ok) {
    throw new Error((dados && dados.erro) || 'Não foi possível concluir a ação.');
  }
  return dados;
}

/**
 * Busca um arquivo do volume como blob. O `<iframe>` do visualizador não manda
 * cabeçalho de autorização, então o token entra aqui e o que vai para a tela é
 * uma URL de objeto — nada de token em query string (seção 13).
 */
async function obterBlob(caminho) {
  const token = obterToken();
  const resposta = await fetch(`${BASE}${caminho}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (resposta.status === 401) {
    encerrarSessao();
    window.location.reload();
    throw new Error('Sessão expirada.');
  }
  if (!resposta.ok) {
    const texto = await resposta.text();
    let mensagem = 'Não foi possível abrir o arquivo.';
    try {
      mensagem = JSON.parse(texto).erro || mensagem;
    } catch {
      /* resposta não-JSON: fica a mensagem padrão */
    }
    throw new Error(mensagem);
  }

  return resposta.blob();
}

/**
 * Envia multipart. Sem Content-Type na mão: o navegador precisa montar o
 * boundary, e defini-lo aqui quebraria o upload.
 */
async function enviarFormulario(caminho, forma) {
  const token = obterToken();
  const resposta = await fetch(`${BASE}${caminho}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: forma,
  });

  if (resposta.status === 401) {
    encerrarSessao();
    window.location.reload();
    throw new Error('Sessão expirada.');
  }

  const texto = await resposta.text();
  const dados = texto ? JSON.parse(texto) : null;
  if (!resposta.ok) throw new Error((dados && dados.erro) || 'Não foi possível enviar o arquivo.');
  return dados;
}

/** Entrega o blob ao navegador com o nome certo, sem abrir aba nova. */
async function salvarComo(caminho, nome) {
  const blob = await obterBlob(caminho);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export const api = {
  login: (email, senha) =>
    requisitar('/auth/login', { method: 'POST', body: JSON.stringify({ email, senha }) }),

  resumo: () => requisitar('/painel/resumo'),

  filtros: () => requisitar('/licitacoes/filtros'),

  licitacoes: (parametros = {}) => {
    const q = new URLSearchParams();
    Object.entries(parametros).forEach(([chave, valor]) => {
      if (valor !== '' && valor !== null && valor !== undefined) q.set(chave, valor);
    });
    return requisitar(`/licitacoes?${q.toString()}`);
  },

  licitacao: (id) => requisitar(`/licitacoes/${id}`),

  atualizarLicitacao: (id, campos) =>
    requisitar(`/licitacoes/${id}`, { method: 'PATCH', body: JSON.stringify(campos) }),

  detalharLicitacao: (id) => requisitar(`/licitacoes/${id}/detalhar`, { method: 'POST' }),

  arquivos: (id) => requisitar(`/licitacoes/${id}/arquivos`),

  baixarDocumentacao: (id, confirmado = false) =>
    requisitar(`/licitacoes/${id}/baixar`, { method: 'POST', body: JSON.stringify({ confirmado }) }),

  verArquivo: (id, arqId) => obterBlob(`/licitacoes/${id}/arquivos/${arqId}`),

  salvarArquivo: (id, arqId, nome) =>
    salvarComo(`/licitacoes/${id}/arquivos/${arqId}?baixar=1`, nome),

  salvarZip: (id, nome) => salvarComo(`/licitacoes/${id}/zip`, `${nome || 'documentacao'}.zip`),

  exigencias: (id) => requisitar(`/licitacoes/${id}/exigencias`),

  lerEdital: (id) => requisitar(`/licitacoes/${id}/ler`, { method: 'POST' }),

  corrigirExigencia: (id, codigo, detectado) =>
    requisitar(`/licitacoes/${id}/exigencias/${codigo}`, {
      method: 'POST',
      body: JSON.stringify({ detectado }),
    }),

  soltarExigencia: (id, codigo) =>
    requisitar(`/licitacoes/${id}/exigencias/${codigo}/soltar`, { method: 'POST' }),

  fontes: () => requisitar('/fontes'),

  coletarTudo: (forcar = true) =>
    requisitar('/fontes/coletar-todas', { method: 'POST', body: JSON.stringify({ forcar }) }),

  coletarFonte: (id) => requisitar(`/fontes/${id}/coletar`, { method: 'POST' }),

  criarFonte: (campos) => requisitar('/fontes', { method: 'POST', body: JSON.stringify(campos) }),

  salvarFonte: (id, campos) =>
    requisitar(`/fontes/${id}`, { method: 'PATCH', body: JSON.stringify(campos) }),

  apagarFonte: (id) => requisitar(`/fontes/${id}`, { method: 'DELETE' }),

  testarFonte: (id, termo) =>
    requisitar(`/fontes/${id}/testar`, { method: 'POST', body: JSON.stringify({ termo }) }),

  palavras: () => requisitar('/palavras'),

  criarPalavra: (campos) => requisitar('/palavras', { method: 'POST', body: JSON.stringify(campos) }),

  salvarPalavra: (id, campos) =>
    requisitar(`/palavras/${id}`, { method: 'PATCH', body: JSON.stringify(campos) }),

  apagarPalavra: (id) => requisitar(`/palavras/${id}`, { method: 'DELETE' }),

  simularPalavra: (campos) =>
    requisitar('/palavras/simular', { method: 'POST', body: JSON.stringify(campos) }),

  criarExcluida: (termo) =>
    requisitar('/palavras/excluidas', { method: 'POST', body: JSON.stringify({ termo }) }),

  salvarExcluida: (id, campos) =>
    requisitar(`/palavras/excluidas/${id}`, { method: 'PATCH', body: JSON.stringify(campos) }),

  apagarExcluida: (id) => requisitar(`/palavras/excluidas/${id}`, { method: 'DELETE' }),

  configuracoes: () => requisitar('/configuracoes'),

  salvarPesos: (pesos) =>
    requisitar('/configuracoes/pesos', { method: 'PATCH', body: JSON.stringify(pesos) }),

  restaurarPeso: (chave) =>
    requisitar(`/configuracoes/pesos/${chave}/restaurar`, { method: 'POST' }),

  repontuar: () => requisitar('/configuracoes/repontuar', { method: 'POST' }),

  salvarPerfil: (id, campos) =>
    requisitar(`/empresa/perfis/${id}`, { method: 'PATCH', body: JSON.stringify(campos) }),

  // ------------------------------------------------- cofre de documentos
  cofre: (historico = false) => requisitar(`/empresa/documentos${historico ? '?historico=1' : ''}`),

  guardarDocumento: (campos, arquivo) => {
    const forma = new FormData();
    Object.entries(campos).forEach(([chave, valor]) => {
      if (valor !== null && valor !== undefined && valor !== '') forma.set(chave, valor);
    });
    forma.set('arquivo', arquivo);
    return enviarFormulario('/empresa/documentos', forma);
  },

  salvarDocumento: (id, campos) =>
    requisitar(`/empresa/documentos/${id}`, { method: 'PATCH', body: JSON.stringify(campos) }),

  removerDocumento: (id) => requisitar(`/empresa/documentos/${id}`, { method: 'DELETE' }),

  verDocumento: (id) => obterBlob(`/empresa/documentos/${id}/arquivo`),

  baixarDocumento: (id, nome) => salvarComo(`/empresa/documentos/${id}/arquivo?baixar=1`, nome),

  kits: () => requisitar('/kits'),

  // ---------------------------------------------------------- montar envio
  envio: (id, kitId) => requisitar(`/licitacoes/${id}/envio${kitId ? `?kit_id=${kitId}` : ''}`),

  gerarEnvio: (id, corpo) =>
    requisitar(`/licitacoes/${id}/envio`, { method: 'POST', body: JSON.stringify(corpo) }),

  repetirEnvio: (id, pacoteId) =>
    requisitar(`/licitacoes/${id}/envio/repetir/${pacoteId}`, { method: 'POST' }),

  baixarPacote: (id, pacoteId, nome) =>
    salvarComo(`/licitacoes/${id}/envio/pacotes/${pacoteId}/arquivo`, nome),

  anexar: (id, titulo, arquivo) => {
    const forma = new FormData();
    forma.set('titulo', titulo);
    forma.set('arquivo', arquivo);
    return enviarFormulario(`/licitacoes/${id}/envio/anexos`, forma);
  },

  removerAnexo: (id, anexoId) =>
    requisitar(`/licitacoes/${id}/envio/anexos/${anexoId}`, { method: 'DELETE' }),

  // ---------------------------------------------- declarações (seção 18)
  modelos: () => requisitar('/modelos-declaracao'),

  criarModelo: (campos) =>
    requisitar('/modelos-declaracao', { method: 'POST', body: JSON.stringify(campos) }),

  duplicarModelo: (id) => requisitar(`/modelos-declaracao/${id}/duplicar`, { method: 'POST' }),

  salvarModelo: (id, campos) =>
    requisitar(`/modelos-declaracao/${id}`, { method: 'PATCH', body: JSON.stringify(campos) }),

  apagarModelo: (id) => requisitar(`/modelos-declaracao/${id}`, { method: 'DELETE' }),

  previaModelo: (corpo) =>
    requisitar('/modelos-declaracao/previa', { method: 'POST', body: JSON.stringify({ corpo }) }),

  previaPdf: (id) => obterBlob(`/modelos-declaracao/${id}/previa.pdf`),

  verDeclaracao: (licitacaoId, modeloId) =>
    obterBlob(`/licitacoes/${licitacaoId}/declaracoes/${modeloId}`),

  gerarDeclaracoes: (licitacaoId, modelos) =>
    requisitar(`/licitacoes/${licitacaoId}/declaracoes`, {
      method: 'POST',
      body: JSON.stringify({ modelos }),
    }),

  // ------------------------------------------- gerador de proposta (seção 19)
  propostas: (licitacaoId) => requisitar(`/licitacoes/${licitacaoId}/propostas`),

  criarProposta: (licitacaoId) =>
    requisitar(`/licitacoes/${licitacaoId}/propostas`, { method: 'POST', body: JSON.stringify({}) }),

  proposta: (licitacaoId, propostaId) => requisitar(`/licitacoes/${licitacaoId}/propostas/${propostaId}`),

  salvarProposta: (licitacaoId, propostaId, campos) =>
    requisitar(`/licitacoes/${licitacaoId}/propostas/${propostaId}`, {
      method: 'PATCH',
      body: JSON.stringify(campos),
    }),

  salvarItemProposta: (licitacaoId, propostaId, itemId, campos) =>
    requisitar(`/licitacoes/${licitacaoId}/propostas/${propostaId}/itens/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify(campos),
    }),

  margemDaProposta: (licitacaoId, propostaId, margem) =>
    requisitar(`/licitacoes/${licitacaoId}/propostas/${propostaId}/margem`, {
      method: 'POST',
      body: JSON.stringify({ margem_pct: margem }),
    }),

  puxarItensDaProposta: (licitacaoId, propostaId) =>
    requisitar(`/licitacoes/${licitacaoId}/propostas/${propostaId}/itens`, { method: 'POST' }),

  gerarSaidaDaProposta: (licitacaoId, propostaId) =>
    requisitar(`/licitacoes/${licitacaoId}/propostas/${propostaId}/saida`, { method: 'POST' }),

  verPropostaPdf: (licitacaoId, propostaId) =>
    obterBlob(`/licitacoes/${licitacaoId}/propostas/${propostaId}/arquivo/pdf`),

  baixarArquivoDaProposta: (licitacaoId, propostaId, formato, nome) =>
    salvarComo(`/licitacoes/${licitacaoId}/propostas/${propostaId}/arquivo/${formato}?baixar=1`, nome),

  apagarProposta: (licitacaoId, propostaId) =>
    requisitar(`/licitacoes/${licitacaoId}/propostas/${propostaId}`, { method: 'DELETE' }),

  // ------------------------------------------------- funil e alertas
  alertas: (lido) => requisitar(`/alertas${lido === undefined ? '' : `?lido=${lido ? 1 : 0}`}`),

  marcarAlerta: (id, lido = true) =>
    requisitar(`/alertas/${id}/lido`, { method: 'PATCH', body: JSON.stringify({ lido }) }),

  marcarAlertasLidos: () => requisitar('/alertas/lidos', { method: 'POST' }),

  anotacoes: (id) => requisitar(`/licitacoes/${id}/anotacoes`),

  anotar: (id, texto) =>
    requisitar(`/licitacoes/${id}/anotacoes`, { method: 'POST', body: JSON.stringify({ texto }) }),
  // --------------------------------------- preço e concorrência (seção 12)
  preco: (id) => requisitar(`/licitacoes/${id}/preco`),

  salvarCusto: (id, custo) =>
    requisitar(`/licitacoes/${id}/preco`, {
      method: 'PATCH',
      body: JSON.stringify({ custo_estimado: custo }),
    }),

  concorrentesDa: (id) => requisitar(`/licitacoes/${id}/concorrentes`),

  buscarResultados: (id) => requisitar(`/licitacoes/${id}/concorrentes`, { method: 'POST' }),

  precosReferencia: () => requisitar('/precos-referencia'),

  recalcularPrecos: () => requisitar('/precos-referencia/recalcular', { method: 'POST' }),

  coletarEncerradas: (corpo = {}) =>
    requisitar('/precos-referencia/coletar', { method: 'POST', body: JSON.stringify(corpo) }),

  concorrentes: (parametros = {}) => {
    const q = new URLSearchParams();
    Object.entries(parametros).forEach(([chave, valor]) => {
      if (valor !== '' && valor !== null && valor !== undefined) q.set(chave, valor);
    });
    return requisitar(`/concorrentes?${q.toString()}`);
  },

  concorrente: (cnpj) => requisitar(`/concorrentes/${cnpj}`),

  // ------------------------------- diagnóstico de descarte (seção 20)
  diagnostico: (periodo = 90) => requisitar(`/diagnostico?periodo=${periodo}`),

  descartarVencidas: () => requisitar('/diagnostico/descartar-vencidas', { method: 'POST' }),

  // ------------------- monitor e oportunidades (seções 21 e 22)
  linhaDoTempo: (id) => requisitar(`/licitacoes/${id}/linha-do-tempo`),

  monitorar: (id, acao = 'ligar') =>
    requisitar(`/licitacoes/${id}/monitorar`, { method: 'POST', body: JSON.stringify({ acao }) }),

  oportunidades: (dias = 90) => requisitar(`/oportunidades?dias=${dias}`),

  varrerEstrategicas: () => requisitar('/oportunidades/varrer', { method: 'POST' }),

  salvarOportunidade: (id, campos) =>
    requisitar(`/oportunidades/${id}`, { method: 'PATCH', body: JSON.stringify(campos) }),

  acompanharOrgao: (id) => requisitar(`/oportunidades/${id}/acompanhar`, { method: 'POST' }),

  // ------------ leitura assistida e recorrência (seções 23 e 24)
  leituraIa: (id) => requisitar(`/licitacoes/${id}/ia`),

  lerComIa: (id, forcar = false) =>
    requisitar(`/licitacoes/${id}/ia`, { method: 'POST', body: JSON.stringify({ forcar }) }),

  decidirLeituraIa: (id, situacao) =>
    requisitar(`/licitacoes/${id}/ia`, { method: 'PATCH', body: JSON.stringify({ situacao }) }),

  gastoIa: (dias = 30) => requisitar(`/ia?dias=${dias}`),

  palavrasSugeridas: () => requisitar('/ia/palavras-sugeridas'),

  pedirPalavrasSugeridas: () => requisitar('/ia/palavras-sugeridas', { method: 'POST', body: JSON.stringify({}) }),

  decidirPalavraSugerida: (id, situacao) =>
    requisitar(`/ia/palavras-sugeridas/${id}`, { method: 'PATCH', body: JSON.stringify({ situacao }) }),

  calendario: (confianca = 0) => requisitar(`/calendario?confianca=${confianca}`),

  detectarRecorrencias: () => requisitar('/calendario/detectar', { method: 'POST' }),

  prepararRecorrencia: (id) => requisitar(`/calendario/${id}/preparar`, { method: 'POST' }),
};
