// Cliente da API. Guarda o token do painel e a organização em que ele atua
// no localStorage (Seção 1 do PLANO_SAAS_CONLICITACAO.md: login próprio,
// multiempresa — o token vale para UMA organização por vez).
import { esquecerTema } from './tema';

const BASE = import.meta.env.VITE_API_URL || '/api';
const CHAVE_TOKEN = 'licitacoes.token';
const CHAVE_USUARIO = 'licitacoes.usuario';
const CHAVE_ORGANIZACAO = 'licitacoes.organizacao';

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

export function obterOrganizacao() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_ORGANIZACAO) || 'null');
  } catch {
    return null;
  }
}

export function guardarSessao(token, usuario, organizacao = null) {
  localStorage.setItem(CHAVE_TOKEN, token);
  localStorage.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
  if (organizacao) localStorage.setItem(CHAVE_ORGANIZACAO, JSON.stringify(organizacao));
}

export function encerrarSessao() {
  localStorage.removeItem(CHAVE_TOKEN);
  localStorage.removeItem(CHAVE_USUARIO);
  localStorage.removeItem(CHAVE_ORGANIZACAO);
  esquecerTema();
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

  // 401 numa rota pública (login, aceite de convite com senha errada) é
  // resposta para a tela, não sessão vencida: não derruba nada.
  if (resposta.status === 401 && token && !opcoes.publica) {
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
    requisitar('/auth/login', { method: 'POST', publica: true, body: JSON.stringify({ email, senha }) }),

  // ---------------------------------------------- conta e equipe (Seção 1b)
  cadastrar: (campos) =>
    requisitar('/auth/cadastro', { method: 'POST', publica: true, body: JSON.stringify(campos) }),

  eu: () => requisitar('/auth/eu'),

  // ------------------------------------------- planos e cobrança (Seção 3)
  assinatura: () => requisitar('/assinatura'),
  usoDoPlano: () => requisitar('/assinatura/uso'),
  pedirPlano: (plano, ciclo) =>
    requisitar('/assinatura/pedido', { method: 'POST', body: JSON.stringify({ plano, ciclo }) }),
  adminOrganizacoes: () => requisitar('/admin/organizacoes'),
  adminEventos: (id) => requisitar(`/admin/organizacoes/${id}/eventos`),
  adminAcao: (id, corpo) =>
    requisitar(`/admin/organizacoes/${id}/acao`, { method: 'POST', body: JSON.stringify(corpo) }),

  // Seção 2: preferência de tema do usuário ('claro' | 'escuro' | null).
  salvarTema: (tema) => requisitar('/auth/tema', { method: 'PATCH', body: JSON.stringify({ tema }) }),

  trocarOrganizacao: (organizacaoId) =>
    requisitar('/auth/trocar-organizacao', {
      method: 'POST',
      body: JSON.stringify({ organizacao_id: organizacaoId }),
    }),

  convite: (token) => requisitar(`/auth/convites/${encodeURIComponent(token)}`, { publica: true }),

  aceitarConvite: (token, campos) =>
    requisitar(`/auth/convites/${encodeURIComponent(token)}/aceitar`, {
      method: 'POST',
      publica: true,
      body: JSON.stringify(campos),
    }),

  recuperarSenha: (email) =>
    requisitar('/auth/recuperar', { method: 'POST', publica: true, body: JSON.stringify({ email }) }),

  redefinirSenha: (token, senha) =>
    requisitar('/auth/redefinir', { method: 'POST', publica: true, body: JSON.stringify({ token, senha }) }),

  equipe: () => requisitar('/auth/equipe'),

  convidar: (email, papel) =>
    requisitar('/auth/convites', { method: 'POST', body: JSON.stringify({ email, papel }) }),

  cancelarConvite: (id) => requisitar(`/auth/convites/${id}`, { method: 'DELETE' }),

  mudarPapel: (usuarioId, papel) =>
    requisitar(`/auth/equipe/${usuarioId}`, { method: 'PATCH', body: JSON.stringify({ papel }) }),

  removerDaEquipe: (usuarioId) => requisitar(`/auth/equipe/${usuarioId}`, { method: 'DELETE' }),

  // Boletim diário (Seção 4 do plano SaaS).
  perfisBoletim: () => requisitar('/boletins/perfis'),
  criarPerfilBoletim: (campos) => requisitar('/boletins/perfis', { method: 'POST', body: JSON.stringify(campos) }),
  salvarPerfilBoletim: (id, campos) =>
    requisitar(`/boletins/perfis/${id}`, { method: 'PUT', body: JSON.stringify(campos) }),
  apagarPerfilBoletim: (id) => requisitar(`/boletins/perfis/${id}`, { method: 'DELETE' }),
  receberBoletim: (id, receber) =>
    requisitar(`/boletins/perfis/${id}/email`, { method: 'PUT', body: JSON.stringify({ receber }) }),
  boletins: (filtro = {}) => {
    const q = new URLSearchParams(Object.entries(filtro).filter(([, v]) => v !== '' && v != null));
    return requisitar(`/boletins?${q}`);
  },
  boletim: (id) => requisitar(`/boletins/${id}`),
  marcarBoletim: (id, lido = true) =>
    requisitar(`/boletins/${id}/lido`, { method: 'POST', body: JSON.stringify({ lido }) }),
  marcarBoletinsLidos: (filtro) =>
    requisitar('/boletins/marcar-lidos', { method: 'POST', body: JSON.stringify(filtro) }),

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

  // Destinatário do alerta, teto de download e janela de coleta (seção 11.13).
  // Campo vazio devolve a chave à variável de ambiente.
  salvarAjustes: (campos) =>
    requisitar('/configuracoes/ajustes', { method: 'PATCH', body: JSON.stringify(campos) }),

  salvarPerfil: (id, campos) =>
    requisitar(`/empresa/perfis/${id}`, { method: 'PATCH', body: JSON.stringify(campos) }),

  // ------------------------------------------------- cofre de documentos
  cofre: (filtros = {}) => {
    const q = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v)).toString();
    return requisitar(`/empresa/documentos${q ? `?${q}` : ''}`);
  },

  revisarDocumento: (id) => requisitar(`/empresa/documentos/${id}/revisado`, { method: 'POST' }),

  baixarLote: (ids) => salvarComo(`/empresa/documentos/lote/baixar?ids=${ids.join(',')}`, 'documentos.zip'),

  enviarLote: (corpo) =>
    requisitar('/empresa/documentos/lote/email', { method: 'POST', body: JSON.stringify(corpo) }),

  // ------------------------------------------- agenda de portais (Seção 10)
  portais: () => requisitar('/portais'),
  criarPortal: (campos) => requisitar('/portais', { method: 'POST', body: JSON.stringify(campos) }),
  salvarPortal: (id, campos) => requisitar(`/portais/${id}`, { method: 'PATCH', body: JSON.stringify(campos) }),
  apagarPortal: (id) => requisitar(`/portais/${id}`, { method: 'DELETE' }),

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

  // Resumo do Edital 2.0 (Seção 11 do plano SaaS)
  resumoEdital: (id) => requisitar(`/licitacoes/${id}/resumo-edital`),

  gerarResumoEdital: (id, forcar = false) =>
    requisitar(`/licitacoes/${id}/resumo-edital`, { method: 'POST', body: JSON.stringify({ forcar }) }),

  salvarConsideracoes: (id, texto) =>
    requisitar(`/licitacoes/${id}/resumo-edital/consideracoes`, { method: 'PUT', body: JSON.stringify({ texto }) }),

  baixarResumoDocx: (id) => salvarComo(`/licitacoes/${id}/resumo-edital/docx`, `resumo_edital_${id}.docx`),

  enviarResumoEmail: (id) => requisitar(`/licitacoes/${id}/resumo-edital/email`, { method: 'POST' }),

  // Pergunte ao Edital (Seção 5 do plano SaaS)
  perguntasEdital: (id) => requisitar(`/licitacoes/${id}/perguntas`),
  perguntarEdital: (id, corpo) =>
    requisitar(`/licitacoes/${id}/perguntas`, { method: 'POST', body: JSON.stringify(corpo) }),
  perguntaEdital: (id, pid) => requisitar(`/licitacoes/${id}/perguntas/${pid}`),
  salvarPerguntaEdital: (id, pid, salva) =>
    requisitar(`/licitacoes/${id}/perguntas/${pid}`, { method: 'PATCH', body: JSON.stringify({ salva }) }),

  gastoIa: (dias = 30) => requisitar(`/ia?dias=${dias}`),

  palavrasSugeridas: () => requisitar('/ia/palavras-sugeridas'),

  pedirPalavrasSugeridas: () => requisitar('/ia/palavras-sugeridas', { method: 'POST', body: JSON.stringify({}) }),

  decidirPalavraSugerida: (id, situacao) =>
    requisitar(`/ia/palavras-sugeridas/${id}`, { method: 'PATCH', body: JSON.stringify({ situacao }) }),

  calendario: (confianca = 0) => requisitar(`/calendario?confianca=${confianca}`),

  detectarRecorrencias: () => requisitar('/calendario/detectar', { method: 'POST' }),

  prepararRecorrencia: (id) => requisitar(`/calendario/${id}/preparar`, { method: 'POST' }),

  // ------------- prazos, questionamentos e dossiês (seções 25 a 27)
  questionamentos: (id) => requisitar(`/licitacoes/${id}/questionamentos`),

  montarQuestionamento: (id, codigo, questionamento, ponto) =>
    requisitar(`/licitacoes/${id}/questionamentos/montar`, {
      method: 'POST',
      body: JSON.stringify({ codigo, questionamento, ponto }),
    }),

  criarQuestionamento: (id, campos) =>
    requisitar(`/licitacoes/${id}/questionamentos`, { method: 'POST', body: JSON.stringify(campos) }),

  salvarQuestionamento: (id, qid, campos) =>
    requisitar(`/licitacoes/${id}/questionamentos/${qid}`, { method: 'PATCH', body: JSON.stringify(campos) }),

  orgaos: (parametros = {}) => {
    const q = new URLSearchParams();
    Object.entries(parametros).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined) q.set(k, v);
    });
    return requisitar(`/dossies/orgaos?${q.toString()}`);
  },

  orgao: (cnpj) => requisitar(`/dossies/orgaos/${cnpj}`),

  dossieConcorrente: (cnpj) => requisitar(`/dossies/concorrentes/${cnpj}`),

  consultarSancoes: (cnpj) =>
    requisitar(`/dossies/concorrentes/${cnpj}/sancoes`, { method: 'POST', body: JSON.stringify({}) }),

  minhasSancoes: () => requisitar('/dossies/minhas-sancoes', { method: 'POST', body: JSON.stringify({}) }),

  agregarDossies: () => requisitar('/dossies/agregar', { method: 'POST' }),

  feriados: (ano) => requisitar(`/feriados?ano=${ano || new Date().getFullYear()}`),

  importarFeriados: () => requisitar('/feriados/importar', { method: 'POST' }),

  criarFeriado: (campos) => requisitar('/feriados', { method: 'POST', body: JSON.stringify(campos) }),

  apagarFeriado: (id) => requisitar(`/feriados/${id}`, { method: 'DELETE' }),

  // ------------- contratos e marcos (seção 28)
  contratos: (situacao) => requisitar(`/contratos${situacao ? `?situacao=${situacao}` : ''}`),

  contrato: (id) => requisitar(`/contratos/${id}`),

  abrirContrato: (campos) => requisitar('/contratos', { method: 'POST', body: JSON.stringify(campos) }),

  salvarContrato: (id, campos) =>
    requisitar(`/contratos/${id}`, { method: 'PATCH', body: JSON.stringify(campos) }),

  criarMarco: (id, campos) =>
    requisitar(`/contratos/${id}/marcos`, { method: 'POST', body: JSON.stringify(campos) }),

  salvarMarco: (id, marcoId, campos) =>
    requisitar(`/contratos/${id}/marcos/${marcoId}`, { method: 'PATCH', body: JSON.stringify(campos) }),

  apagarMarco: (id, marcoId) => requisitar(`/contratos/${id}/marcos/${marcoId}`, { method: 'DELETE' }),

  rodarAvisosContrato: () => requisitar('/contratos/avisos/rodar', { method: 'POST' }),

  // ------------- exportações e relatório (Fase 14)
  // `formato`: 'xlsx' (padrão) ou 'docx' (Seção 7).
  exportarRadar: (parametros = {}, formato = 'xlsx') => {
    const q = new URLSearchParams();
    Object.entries(parametros).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined && v !== false) q.set(k, v);
    });
    if (formato === 'docx') q.set('formato', 'docx');
    const dia = new Date().toISOString().slice(0, 10);
    return salvarComo(`/licitacoes/exportar?${q.toString()}`, `radar-licitacoes-${dia}.${formato}`);
  },

  // ------------------------------------------------- Radar 2.0 (Seção 7)
  itensDaLicitacao: (id) => requisitar(`/licitacoes/${id}/itens`),
  municipios: (busca) => requisitar(`/licitacoes/municipios?busca=${encodeURIComponent(busca)}`),
  pesquisas: () => requisitar('/licitacoes/pesquisas'),
  salvarPesquisa: (nome, filtros) =>
    requisitar('/licitacoes/pesquisas', { method: 'POST', body: JSON.stringify({ nome, filtros }) }),
  apagarPesquisa: (id) => requisitar(`/licitacoes/pesquisas/${id}`, { method: 'DELETE' }),
  compartilharRadar: (filtros, dias, nome) =>
    requisitar('/licitacoes/compartilhar', { method: 'POST', body: JSON.stringify({ filtros, dias, nome }) }),
  compartilhados: () => requisitar('/licitacoes/compartilhados'),
  revogarLink: (id) => requisitar(`/licitacoes/compartilhados/${id}`, { method: 'DELETE' }),
  radarPublico: (token, pagina = 1) =>
    requisitar(`/publico/radar/${encodeURIComponent(token)}?pagina=${pagina}`, { publica: true }),

  relatorioMensal: (meses = 12) => requisitar(`/licitacoes/relatorio?meses=${meses}`),

  exportarRelatorio: (meses = 12) => {
    const dia = new Date().toISOString().slice(0, 10);
    return salvarComo(`/licitacoes/relatorio?meses=${meses}&formato=xlsx`, `relatorio-mensal-${dia}.xlsx`);
  },

  // Gestão por licitação e dashboard (Seção 8).
  membros: () => requisitar('/gestao/membros'),
  tarefas: (filtro = {}) => {
    const q = new URLSearchParams(Object.entries(filtro).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    return requisitar(`/gestao/tarefas${q.toString() ? `?${q}` : ''}`);
  },
  criarTarefa: (campos) => requisitar('/gestao/tarefas', { method: 'POST', body: JSON.stringify(campos) }),
  salvarTarefa: (id, campos) => requisitar(`/gestao/tarefas/${id}`, { method: 'PATCH', body: JSON.stringify(campos) }),
  apagarTarefa: (id) => requisitar(`/gestao/tarefas/${id}`, { method: 'DELETE' }),
  andamentos: (licitacaoId) => requisitar(`/gestao/andamentos?licitacao_id=${licitacaoId}`),
  registrarAndamento: (campos) => requisitar('/gestao/andamentos', { method: 'POST', body: JSON.stringify(campos) }),
  apagarAndamento: (id) => requisitar(`/gestao/andamentos/${id}`, { method: 'DELETE' }),

  // ------------------------------------------ avisos por tipo e canal (Seção 9)
  notificacoes: () => requisitar('/notificacoes'),
  salvarPreferenciasAviso: (escopo, preferencias) =>
    requisitar('/notificacoes/preferencias', { method: 'PUT', body: JSON.stringify({ escopo, preferencias }) }),
  salvarDestinosAviso: (campos) =>
    requisitar('/notificacoes/destinos', { method: 'PATCH', body: JSON.stringify(campos) }),
  inscreverPush: (inscricao) => requisitar('/notificacoes/push', { method: 'POST', body: JSON.stringify(inscricao) }),
  desinscreverPush: (endpoint) =>
    requisitar('/notificacoes/push', { method: 'DELETE', body: JSON.stringify({ endpoint }) }),
  testarAviso: (canal) => requisitar('/notificacoes/teste', { method: 'POST', body: JSON.stringify({ canal }) }),
  anexosDa: (licitacaoId) => requisitar(`/gestao/anexos?licitacao_id=${licitacaoId}`),
  agenda: (de, ate, por) => requisitar(`/gestao/agenda?de=${de}&ate=${ate}${por === 'mim' ? '&por=mim' : ''}`),
  dashboard: () => requisitar('/gestao/dashboard'),
};
