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

  fontes: () => requisitar('/fontes'),

  coletarTudo: (forcar = true) =>
    requisitar('/fontes/coletar-todas', { method: 'POST', body: JSON.stringify({ forcar }) }),

  coletarFonte: (id) => requisitar(`/fontes/${id}/coletar`, { method: 'POST' }),

  palavras: () => requisitar('/palavras'),
};
