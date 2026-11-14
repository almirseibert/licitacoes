import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api, guardarSessao } from '../servicos/api';
import { Campo } from './Login';

const PAPEIS = { admin: 'administrador', membro: 'membro', leitor: 'leitor (só consulta)', dono: 'dono' };

/**
 * Aceite de convite (Seção 1b), aberto pelo link /convite/<token> do e-mail.
 * E-mail sem conta: cria a conta aqui. E-mail com conta: pede a senha dela —
 * o link sozinho não prova quem é você (ver backend/rotas/auth.js).
 */
export default function Convite({ token, onEntrar, onSair }) {
  const [convite, setConvite] = useState(null);
  const [erro, setErro] = useState(null);
  const [campos, setCampos] = useState({ nome: '', senha: '' });
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.convite(token).then(setConvite).catch((e) => setErro(e.message));
  }, [token]);

  const enviar = async (evento) => {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      const r = await api.aceitarConvite(token, campos);
      guardarSessao(r.token, r.usuario, null);
      onEntrar(r.usuario);
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const mudar = (chave) => (e) => setCampos({ ...campos, [chave]: e.target.value });

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-titulo text-2xl mb-1">Convite</h1>
        {!convite && !erro && (
          <p className="text-xs text-texto-suave flex items-center gap-2">
            <Loader2 size={12} className="animate-spin" /> abrindo o convite…
          </p>
        )}

        {convite && (
          <form onSubmit={enviar}>
            <p className="text-sm text-texto-suave mb-6">
              Você foi convidado para <strong className="text-texto">{convite.organizacao}</strong> como{' '}
              {PAPEIS[convite.papel] || convite.papel}, no e-mail{' '}
              <span className="text-texto">{convite.email}</span>.
            </p>

            {convite.conta_existe ? (
              <>
                <p className="text-xs text-texto-suave mb-3">Este e-mail já tem conta. Confirme com a senha dela.</p>
                <Campo rotulo="Senha" tipo="password" valor={campos.senha} aoMudar={mudar('senha')} autoComplete="current-password" />
              </>
            ) : (
              <>
                <Campo rotulo="Seu nome" valor={campos.nome} aoMudar={mudar('nome')} autoComplete="name" />
                <Campo
                  rotulo="Crie uma senha (mínimo 8 caracteres)"
                  tipo="password"
                  valor={campos.senha}
                  aoMudar={mudar('senha')}
                  autoComplete="new-password"
                  minimo={8}
                />
              </>
            )}

            {erro && <p className="text-xs text-erro mb-4" role="alert">{erro}</p>}
            <button
              type="submit"
              disabled={enviando}
              className="w-full flex items-center justify-center gap-2 bg-voltagem text-obsidiana font-medium rounded py-2 text-sm hover:brightness-110 disabled:opacity-60"
            >
              {enviando && <Loader2 size={14} className="animate-spin" />}
              Aceitar e entrar
            </button>
          </form>
        )}

        {!convite && erro && <p className="text-sm text-erro mt-4" role="alert">{erro}</p>}

        <button type="button" onClick={onSair} className="mt-5 text-xs text-texto-suave hover:text-texto">
          Ir para a tela de entrada
        </button>
      </div>
    </div>
  );
}
