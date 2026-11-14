import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api, guardarSessao } from '../servicos/api';
import AlternarTema from '../componentes/AlternarTema';
import { definirTema } from '../servicos/tema';

/**
 * Entrada do painel, multiempresa (PLANO_SAAS_CONLICITACAO.md, Seção 1b):
 * entrar, criar a conta de uma empresa nova (vira 'dono' dela, com 15 dias de
 * teste) e pedir o link de senha nova. O link de senha nova e o de convite
 * chegam por e-mail e abrem as telas próprias (RedefinirSenha, Convite).
 */
export default function Login({ onEntrar }) {
  const [modo, setModo] = useState('entrar'); // entrar | cadastrar | esqueci
  const [campos, setCampos] = useState({ nome: '', organizacao: '', email: '', senha: '' });
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [enviando, setEnviando] = useState(false);

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
    entrar: ['Painel de Licitações', 'Entre com o seu e-mail e senha'],
    cadastrar: ['Criar conta', 'Sua empresa entra com 15 dias de teste, sem cartão'],
    esqueci: ['Esqueci minha senha', 'Mandamos um link para criar uma senha nova'],
  };

  return (
    <div className="min-h-screen grid place-items-center px-4 relative">
      <div className="absolute top-4 right-4"><AlternarTema /></div>
      <form onSubmit={enviar} className="w-full max-w-sm">
        <h1 className="font-titulo text-2xl mb-1">{titulos[modo][0]}</h1>
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

        {erro && <p className="text-xs text-erro mb-4" role="alert">{erro}</p>}
        {aviso && <p className="text-xs text-ok mb-4" role="status">{aviso}</p>}

        <button
          type="submit"
          disabled={enviando}
          className="w-full flex items-center justify-center gap-2 bg-voltagem text-obsidiana font-medium rounded py-2 text-sm hover:brightness-110 disabled:opacity-60"
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
