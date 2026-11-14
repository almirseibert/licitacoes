import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../servicos/api';
import { dataHora } from '../servicos/formato';
import TextoLegal from '../componentes/TextoLegal';
import Abas from '../componentes/Abas';

/**
 * Privacidade e dados (Seção 17): termos, política e aviso da IA, a cópia dos
 * dados da organização e o pedido de exclusão (LGPD). A permissão vem do backend:
 * a tela só mostra o que ele respondeu que a pessoa pode.
 */
export default function Privacidade({ aoIr }) {
  const [aba, setAba] = useState('textos');
  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <header className="mb-4">
        <h1 className="font-titulo text-xl">Privacidade e dados</h1>
        <p className="text-xs text-texto-suave">O que o painel guarda, o que você pode baixar e como apagar.</p>
      </header>
      <Abas abas={[['textos', 'Termos e política'], ['dados', 'Meus dados']]} ativa={aba} aoMudar={setAba} />
      <div className="max-w-2xl">
        {aba === 'textos' ? <TextoLegal /> : <MeusDados aoIr={aoIr} />}
      </div>
    </div>
  );
}

function MeusDados({ aoIr }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [confirmacao, setConfirmacao] = useState('');
  const [senha, setSenha] = useState('');

  const carregar = useCallback(() => {
    api.lgpd().then(setDados).catch((e) => setErro(e.message));
  }, []);
  useEffect(carregar, [carregar]);

  const agir = async (fazer, ok) => {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      await fazer();
      if (ok) setAviso(ok);
      carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(false);
    }
  };

  if (!dados) return <p className="text-sm text-texto-suave">{erro || <span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> carregando…</span>}</p>;

  const agendada = dados.exclusao_agendada_em;
  return (
    <div>
      <section className="mb-8">
        <h2 className="font-titulo text-base mb-1">Baixar uma cópia</h2>
        <p className="text-sm text-texto-suave mb-3">
          Um arquivo JSON com tudo o que a organização cadastrou: empresa, palavras-chave, filtros, decisões sobre licitações,
          tarefas, propostas, contratos, equipe e a trilha de auditoria. Senhas e tokens não vão. Os arquivos do cofre ficam de fora:
          baixe-os em Documentos ou peça ao suporte.
        </p>
        <button className="botao" disabled={ocupado} onClick={() => agir(() => api.baixarMeusDados(), 'Cópia baixada.')}>
          Baixar meus dados (JSON)
        </button>
        <p className="text-[11px] text-texto-suave mt-1">Só administrador e dono.</p>
      </section>

      <section>
        <h2 className="font-titulo text-base mb-1">Excluir os dados da organização</h2>
        {agendada ? (
          <div role="alert" className="border border-atencao/60 rounded p-3 text-sm">
            <p className="mb-2">
              Exclusão agendada para <strong>{dataHora(agendada)}</strong>
              {dados.exclusao_pedida_por ? `, pedida por ${dados.exclusao_pedida_por}` : ''}. Depois dessa data, tudo é apagado de vez:
              dados, equipe e arquivos do cofre.
            </p>
            <button className="botao" disabled={ocupado} onClick={() => agir(() => api.cancelarExclusao(), 'Exclusão cancelada. Nada será apagado.')}>
              Cancelar a exclusão
            </button>
            <span className="text-[11px] text-texto-suave ml-2">Só o dono.</span>
          </div>
        ) : (
          <>
            <p className="text-sm text-texto-suave mb-3">
              Apaga a organização, as pessoas que só pertencem a ela e todos os arquivos. Há {dados.dias_de_carencia} dias de carência
              para desistir; depois não há volta. Faça antes a cópia acima.
            </p>
            {!dados.pode_pedir.ok ? (
              <p className="text-sm text-atencao">
                {dados.pode_pedir.motivo}{' '}
                {/cobrança recorrente/.test(dados.pode_pedir.motivo) && (
                  <button className="underline" onClick={() => aoIr('ajuda', { aba: 'solicitacoes' })}>Abrir solicitação</button>
                )}
              </p>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!window.confirm(`Agendar a exclusão de “${dados.organizacao}”? Em ${dados.dias_de_carencia} dias tudo será apagado.`)) return;
                  agir(() => api.pedirExclusao(confirmacao, senha), 'Exclusão agendada.').then(() => { setConfirmacao(''); setSenha(''); });
                }}
              >
                <label className="block mb-3">
                  <span className="block text-[11px] uppercase tracking-wide text-texto-suave mb-1">Digite o nome da organização: {dados.organizacao}</span>
                  <input className="campo-caixa w-full" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} autoComplete="off" required />
                </label>
                <label className="block mb-3">
                  <span className="block text-[11px] uppercase tracking-wide text-texto-suave mb-1">Sua senha</span>
                  <input className="campo-caixa w-full" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" required />
                </label>
                <button type="submit" className="botao border-erro/60 text-erro" disabled={ocupado}>Agendar a exclusão</button>
              </form>
            )}
          </>
        )}
      </section>
      {erro && <p className="text-xs text-erro mt-4" role="alert">{erro}</p>}
      {aviso && <p className="text-xs text-ok mt-4" role="status">{aviso}</p>}
    </div>
  );
}
