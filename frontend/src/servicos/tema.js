// Tema claro/escuro (Seção 2 do PLANO_SAAS_CONLICITACAO.md).
//
// O tema é o atributo `data-tema` no <html>; as cores vivem em variáveis CSS
// (estilo.css), então trocar é mudar um atributo — sem recarregar e sem
// componente nenhum saber disso. A escolha fica no localStorage (vale antes do
// login e sem rede) e, para quem está logado, também em `usuarios.tema_preferido`,
// que manda quando existe: é ela que acompanha o usuário em outro navegador.
// O script em index.html repete `temaInicial` antes do primeiro pintar, para a
// tela não piscar escura no tema claro.
export const CHAVE_TEMA = 'licitacoes.tema';
export const TEMAS = ['claro', 'escuro'];

const consulta = () => window.matchMedia('(prefers-color-scheme: light)');

export function temaDoSistema() {
  return consulta().matches ? 'claro' : 'escuro';
}

export function temaGuardado() {
  try {
    const tema = localStorage.getItem(CHAVE_TEMA);
    return TEMAS.includes(tema) ? tema : null;
  } catch {
    return null;
  }
}

export function temaInicial() {
  return temaGuardado() || temaDoSistema();
}

export function temaAtual() {
  const tema = document.documentElement.dataset.tema;
  return TEMAS.includes(tema) ? tema : temaInicial();
}

function aplicar(tema) {
  document.documentElement.dataset.tema = tema;
  window.dispatchEvent(new CustomEvent('tema', { detail: tema }));
}

/** Aplica e guarda no navegador. Tema inválido (ex.: `null` do banco) não muda nada. */
export function definirTema(tema) {
  if (!TEMAS.includes(tema)) return;
  aplicar(tema);
  try {
    localStorage.setItem(CHAVE_TEMA, tema);
  } catch {
    // modo privado ou armazenamento bloqueado: o tema vale até fechar a aba
  }
}

// Seção 2b: escolha que o servidor ainda não recebeu (rede caiu no PATCH). Fica marcada
// até um envio dar certo; no próximo carregamento ela vale mais que o banco e é reenviada.
const CHAVE_PENDENTE = 'licitacoes.tema_pendente';

export function marcarTemaPendente(tema) {
  try {
    localStorage.setItem(CHAVE_PENDENTE, tema);
  } catch {
    // sem armazenamento: a escolha vale nesta sessão
  }
}

export function temaPendente() {
  try {
    const tema = localStorage.getItem(CHAVE_PENDENTE);
    return TEMAS.includes(tema) ? tema : null;
  } catch {
    return null;
  }
}

export function limparTemaPendente() {
  try {
    localStorage.removeItem(CHAVE_PENDENTE);
  } catch {
    // nada a limpar
  }
}

/**
 * Salva o tema no usuário. Falhou? Fica pendente e o próximo carregamento tenta de novo.
 * `enviar` é `api.salvarTema` (passada de fora para este arquivo não depender da API).
 */
export async function salvarTemaNoUsuario(enviar, tema) {
  marcarTemaPendente(tema);
  try {
    await enviar(tema);
    // Só apaga se ninguém escolheu outro enquanto este voava.
    if (temaPendente() === tema) limparTemaPendente();
  } catch {
    // continua pendente
  }
}

/** Ao sair: a escolha é do usuário, não do navegador — o próximo não a herda. */
export function esquecerTema() {
  limparTemaPendente();
  try {
    localStorage.removeItem(CHAVE_TEMA);
  } catch {
    // nada guardado para apagar
  }
  aplicar(temaDoSistema());
}

/** Enquanto ninguém escolheu, acompanha o sistema operacional ao vivo. */
export function seguirSistema() {
  const aoMudar = () => {
    if (!temaGuardado()) aplicar(temaDoSistema());
  };
  consulta().addEventListener('change', aoMudar);
  return () => consulta().removeEventListener('change', aoMudar);
}
