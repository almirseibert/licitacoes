import { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { api, guardarSessao } from '../servicos/api';
import { definirTema } from '../servicos/tema';

/**
 * Entrada do painel, multiempresa (PLANO_SAAS_CONLICITACAO.md, Seção 1b):
 * entrar, criar a conta de uma empresa nova (vira 'dono' dela, com 15 dias de
 * teste) e pedir o link de senha nova. O link de senha nova e o de convite
 * chegam por e-mail e abrem as telas próprias (RedefinirSenha, Convite).
 *
 * É um popup sobre a página de divulgação (Divulgacao.jsx): `onFechar` o fecha
 * (Esc, X ou clique fora) e `modoInicial` abre direto em "criar conta".
 */
export default function Login({ onEntrar, onFechar, modoInicial = 'entrar' }) {
  const [modo, setModo] = useState(modoInicial); // entrar | cadastrar | esqueci
  const caixa = useRef(null);
  const [campos, setCampos] = useState({ nome: '', organizacao: '', email: '', senha: '', aceitou_termos: false });
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [enviando, setEnviando] = useState(false);

  // Popup acessível: Esc fecha, a página de trás não rola, o foco entra no
  // primeiro campo, fica preso dentro da caixa e volta ao botão que abriu.
  useEffect(() => {
    const anterior = document.activeElement;
    const rolagem = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const aoTeclar = (e) => {
      if (e.key === 'Escape') return onFechar && onFechar();
      if (e.key !== 'Tab' || !caixa.current) return;
      const focaveis = caixa.current.querySelectorAll('a[href], button:not([disabled]), input, select, textarea');
      if (!focaveis.length) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    };
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = rolagem;
      if (anterior && anterior.focus) anterior.focus();
    };
  }, [onFechar]);

  // Troca de modo: o foco vai para o primeiro campo da tela nova.
  useEffect(() => {
    const campo = caixa.current && caixa.current.querySelector('input:not([type=checkbox])');
    if (campo) campo.focus();
  }, [modo]);

  const mudar = (chave) => (e) => setCampos({ ...campos, [chave]: e.target.value });
  const irPara = (novo) => {
    setModo(novo);
    setErro(null);
    setAviso(null);
  };

  const enviar = async (evento) => {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    setAviso(null);
    try {
      if (modo === 'esqueci') {
        const r = await api.recuperarSenha(campos.email);
        setAviso(r.mensagem);
        return;
      }
      const r =
        modo === 'cadastrar'
          ? await api.cadastrar(campos)
          : await api.login(campos.email, campos.senha);
      guardarSessao(r.token, r.usuario, r.organizacao);
      definirTema(r.tema); // Seção 2: já no login, sem esperar o /eu
      onEntrar(r.usuario);
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const titulos = {
    entrar: ['Entrar no painel', 'Use o e-mail e a senha da sua conta'],
    cadastrar: ['Criar conta', 'Sua empresa entra com 15 dias de teste, sem cartão'],
    esqueci: ['Esqueci minha senha', 'Mandamos um link para criar uma senha nova'],
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center px-4 py-6 overflow-y-auto bg-obsidiana/70 backdrop-blur-md animate-aparecer"
      onMouseDown={(e) => { if (e.target === e.currentTarget && onFechar) onFechar(); }}
    >
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-titulo"
        className="relative w-full max-w-sm bg-superficie border border-borda rounded-2xl shadow-2xl shadow-black/40 p-7 animate-subir"
      >
        {onFechar && (
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="absolute top-3 right-3 p-1.5 rounded-lg text-texto-suave hover:text-texto hover:bg-realce/10"
          >
            <X size={16} />
          </button>
        )}
      <form onSubmit={enviar}>
        <h2 id="login-titulo" className="font-titulo text-2xl mb-1">{titulos[modo][0]}</h2>
        <p className="text-xs text-texto-suave mb-6">{titulos[modo][1]}</p>

        {modo === 'cadastrar' && (
          <>
            <Campo rotulo="Seu nome" valor={campos.nome} aoMudar={mudar('nome')} autoComplete="name" />
            <Campo rotulo="Nome da empresa" valor={campos.organizacao} aoMudar={mudar('organizacao')} autoComplete="organization" />
          </>
        )}

        <Campo rotulo="E-mail" tipo="email" valor={campos.email} aoMudar={mudar('email')} autoComplete="username" />

        {modo !== 'esqueci' && (
          <Campo
            rotulo={modo === 'cadastrar' ? 'Senha (mínimo 8 caracteres)' : 'Senha'}
            tipo="password"
            valor={campos.senha}
            aoMudar={mudar('senha')}
            autoComplete={modo === 'cadastrar' ? 'new-password' : 'current-password'}
            minimo={modo === 'cadastrar' ? 8 : undefined}
          />
        )}

        {modo === 'cadastrar' && (
          <label className="flex items-start gap-2 mb-4 text-xs text-texto-suave">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={campos.aceitou_termos}
              onChange={(e) => setCampos({ ...campos, aceitou_termos: e.target.checked })}
              required
            />
            <span>
              Li e aceito os <a className="underline" href="/termos" target="_blank" rel="noreferrer">termos de uso</a> e a{' '}
              <a className="underline" href="/privacidade" target="_blank" rel="noreferrer">política de privacidade</a>.
            </span>
          </label>
        )}

        {erro && <p className="text-xs text-erro mb-4" role="alert">{erro}</p>}
        {aviso && <p className="text-xs text-ok mb-4" role="status">{aviso}</p>}

        <button
          type="submit"
          disabled={enviando}
          className="w-full flex items-center justify-center gap-2 bg-voltagem text-obsidiana font-medium rounded-lg py-2.5 text-sm hover:brightness-110 disabled:opacity-60"
        >
          {enviando && <Loader2 size={14} className="animate-spin" />}
          {modo === 'entrar' ? 'Entrar' : modo === 'cadastrar' ? 'Criar conta' : 'Mandar o link'}
        </button>

        <div className="mt-5 flex flex-col gap-1.5 text-xs text-texto-suave">
          {modo !== 'entrar' && (
            <button type="button" className="text-left hover:text-texto" onClick={() => irPara('entrar')}>
              Já tenho conta — entrar
            </button>
          )}
          {modo !== 'cadastrar' && (
            <button type="button" className="text-left hover:text-texto" onClick={() => irPara('cadastrar')}>
              Criar conta para a minha empresa
            </button>
          )}
          {modo === 'entrar' && (
            <button type="button" className="text-left hover:text-texto" onClick={() => irPara('esqueci')}>
              Esqueci minha senha
            </button>
          )}
        </div>
      </form>
      </div>
    </div>
  );
}

const ESTILO_CAMPO =
  'w-full bg-superficie border border-borda rounded px-3 py-2 text-sm ' +
  'focus:outline-none focus:border-voltagem/60 placeholder:text-texto-suave/70';

export function Campo({ rotulo, tipo = 'text', valor, aoMudar, autoComplete, minimo }) {
  return (
    <label className="block mb-4">
      <span className="block text-[11px] uppercase tracking-wide text-texto-suave mb-1">{rotulo}</span>
      <input
        className={ESTILO_CAMPO}
        type={tipo}
        autoComplete={autoComplete}
        value={valor}
        onChange={aoMudar}
        minLength={minimo}
        required
      />
    </label>
  );
}
