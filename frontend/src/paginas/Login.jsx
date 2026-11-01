import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api, guardarSessao } from '../servicos/api';

/** Login com os mesmos usuários do painel atual (seção 13). */
export default function Login({ onEntrar }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (evento) => {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const r = await api.login(email, senha);
      guardarSessao(r.token, r.usuario);
      onEntrar(r.usuario);
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const campo =
    'w-full bg-superficie border border-borda rounded px-3 py-2 text-sm ' +
    'focus:outline-none focus:border-voltagem/60 placeholder:text-texto-suave/50';

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <form onSubmit={enviar} className="w-full max-w-sm">
        <h1 className="font-titulo text-2xl mb-1">Painel de Licitações</h1>
        <p className="text-xs text-texto-suave mb-6">Studio Mythos · entre com o acesso do painel</p>

        <label className="block text-[11px] uppercase tracking-wide text-texto-suave mb-1">E-mail</label>
        <input
          className={`${campo} mb-4`}
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label className="block text-[11px] uppercase tracking-wide text-texto-suave mb-1">Senha</label>
        <input
          className={`${campo} mb-6`}
          type="password"
          autoComplete="current-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          required
        />

        {erro && <p className="text-xs text-erro mb-4">{erro}</p>}

        <button
          type="submit"
          disabled={enviando}
          className="w-full flex items-center justify-center gap-2 bg-voltagem text-obsidiana font-medium rounded py-2 text-sm hover:brightness-110 disabled:opacity-60"
        >
          {enviando && <Loader2 size={14} className="animate-spin" />}
          Entrar
        </button>
      </form>
    </div>
  );
}
