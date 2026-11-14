import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../servicos/api';
import { Campo } from './Login';

/**
 * Senha nova pelo link /redefinir-senha/<token> que chega por e-mail
 * (Seção 1b). O link vale 1 hora e funciona uma vez só.
 */
export default function RedefinirSenha({ token, onSair }) {
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erro, setErro] = useState(null);
  const [feito, setFeito] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (evento) => {
    evento.preventDefault();
    setErro(null);
    if (senha !== confirma) {
      setErro('As duas senhas não são iguais.');
      return;
    }
    setEnviando(true);
    try {
      const r = await api.redefinirSenha(token, senha);
      setFeito(r.mensagem);
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <form onSubmit={enviar} className="w-full max-w-sm">
        <h1 className="font-titulo text-2xl mb-1">Senha nova</h1>
        <p className="text-xs text-texto-suave mb-6">Escolha uma senha com pelo menos 8 caracteres.</p>

        {feito ? (
          <p className="text-sm text-ok mb-4" role="status">{feito}</p>
        ) : (
          <>
            <Campo rotulo="Senha nova" tipo="password" valor={senha} aoMudar={(e) => setSenha(e.target.value)} autoComplete="new-password" minimo={8} />
            <Campo rotulo="Repita a senha" tipo="password" valor={confirma} aoMudar={(e) => setConfirma(e.target.value)} autoComplete="new-password" minimo={8} />
            {erro && <p className="text-xs text-erro mb-4" role="alert">{erro}</p>}
            <button
              type="submit"
              disabled={enviando}
              className="w-full flex items-center justify-center gap-2 bg-voltagem text-obsidiana font-medium rounded py-2 text-sm hover:brightness-110 disabled:opacity-60"
            >
              {enviando && <Loader2 size={14} className="animate-spin" />}
              Salvar senha nova
            </button>
          </>
        )}

        <button type="button" onClick={onSair} className="mt-5 text-xs text-texto-suave hover:text-texto">
          Ir para a tela de entrada
        </button>
      </form>
    </div>
  );
}
