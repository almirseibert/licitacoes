import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Archive, ArchiveRestore, Star, CheckCheck, RefreshCcw, PowerOff, ExternalLink, MessageSquareWarning } from 'lucide-react';
import { api } from '../servicos/api';
import { dataHora } from '../servicos/formato';

// O que cada situação do monitor quer dizer, em português claro.
const SITUACAO = {
  aguardando: { rotulo: 'aguardando a sessão', cor: 'text-texto-suave' },
  ok: { rotulo: 'lendo o chat', cor: 'text-voltagem' },
  bloqueado: { rotulo: 'portal bloqueado', cor: 'text-atencao' },
  sem_consulta: { rotulo: 'sem consulta pública', cor: 'text-texto-suave' },
  erro: { rotulo: 'falhou na última leitura', cor: 'text-erro' },
  encerrado: { rotulo: 'janela encerrada', cor: 'text-texto-suave' },
};

/**
 * O chat do pregão de UMA licitação (Seção 6): mensagens do pregoeiro, ligar
 * ou desligar o monitor, marcar lida/importante. Usado tanto pelo Monitor de
 * chat (lista de todos os editais monitorados) quanto pela aba "Chat" na
 * ficha da licitação (seção 11.2) — mesmo componente, sem duplicar.
 *
 * `aoFechar` é opcional: só aparece o botão de fechar quando faz sentido
 * fechar o painel sem sair da tela (o Monitor de chat passa; a ficha da
 * licitação, que já é uma aba entre outras, não precisa).
 */
export default function ChatLicitacao({ id, aoMudar = () => {}, aoFechar = null, aoAbrirLicitacao = null }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const painel = useRef(null);

  // No celular o painel fica abaixo da lista: traz para a vista ao escolher um edital.
  const carregado = dados !== null;
  useEffect(() => {
    if (aoFechar && carregado && painel.current && window.innerWidth < 1024) {
      painel.current.scrollIntoView({ block: 'start' });
    }
  }, [carregado, aoFechar]);

  const carregar = useCallback(
    () =>
      api
        .chatLicitacao(id)
        .then((r) => {
          setDados(r);
          setErro(null);
        })
        .catch((e) => setErro(e.message)),
    [id]
  );

  useEffect(() => {
    carregar();
  }, [carregar]);

  const executar = async (acao) => {
    setOcupado(true);
    try {
      await acao();
      await Promise.all([carregar(), aoMudar()]);
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(false);
    }
  };

  // Sem monitor ligado ainda, a mensagem do backend é "não está no monitor de
  // chat" (404) — a ação óbvia daqui é ligar, não só avisar que falhou.
  if (erro && !dados) {
    return (
      <div className="text-sm space-y-2">
        <p className="text-texto-suave">{erro}</p>
        <button
          className="botao-primario"
          disabled={ocupado}
          onClick={() => {
            setOcupado(true);
            api
              .chatLigar(id)
              .then(() => Promise.all([carregar(), aoMudar()]))
              .catch((e) => setErro(e.message))
              .finally(() => setOcupado(false));
          }}
        >
          Ligar o chat desta licitação
        </button>
      </div>
    );
  }
  if (!dados) return <Loader2 size={16} className="animate-spin text-texto-suave" />;

  const { licitacao, monitoramento: m, mensagens } = dados;
  const s = SITUACAO[m.chat_status] || SITUACAO.aguardando;
  const link = m.chat_link || (licitacao && (licitacao.link_disputa || licitacao.link_portal));

  return (
    <section ref={painel} className="border border-borda rounded bg-superficie self-start">
      <header className="p-3 border-b border-borda space-y-2">
        <div className="flex items-start gap-2">
          <p className="text-sm flex-1">{licitacao ? licitacao.objeto : 'Licitação'}</p>
          {aoFechar && (
            <button className="text-xs text-texto-suave hover:text-texto" onClick={aoFechar}>
              fechar
            </button>
          )}
        </div>
        <p className={`text-xs ${s.cor}`}>
          {m.chat_ativo ? s.rotulo : 'monitor desligado'}
          {m.chat_checado_em ? ` · última leitura ${dataHora(m.chat_checado_em)}` : ''}
        </p>

        {m.chat_aviso && (
          <p className="flex gap-2 px-3 py-2 text-xs border border-atencao/40 text-atencao rounded bg-atencao/5">
            <MessageSquareWarning size={14} className="shrink-0 mt-px" />
            <span>
              {m.chat_aviso}
              {link && (
                <>
                  {' '}
                  <a className="underline" href={link} target="_blank" rel="noreferrer noopener">
                    Abrir no portal
                  </a>
                </>
              )}
            </span>
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {m.chat_ativo && (
            <button className="botao flex items-center gap-1" disabled={ocupado} onClick={() => executar(() => api.chatChecar(id))}>
              <RefreshCcw size={12} /> ler agora
            </button>
          )}
          <button className="botao flex items-center gap-1" disabled={ocupado} onClick={() => executar(() => api.chatLerTodas(id))}>
            <CheckCheck size={12} /> marcar tudo como lido
          </button>
          <button
            className="botao flex items-center gap-1"
            disabled={ocupado}
            onClick={() => executar(() => api.chatArquivar(id, !m.chat_arquivado))}
          >
            {m.chat_arquivado ? <ArchiveRestore size={12} /> : <Archive size={12} />}
            {m.chat_arquivado ? 'desarquivar' : 'arquivar'}
          </button>
          {m.chat_ativo ? (
            <button className="botao flex items-center gap-1" disabled={ocupado} onClick={() => executar(() => api.chatDesativar(id))}>
              <PowerOff size={12} /> desativar
            </button>
          ) : (
            <button className="botao-primario" disabled={ocupado} onClick={() => executar(() => api.chatLigar(id))}>
              religar
            </button>
          )}
          {aoAbrirLicitacao && (
            <button className="botao flex items-center gap-1" onClick={() => aoAbrirLicitacao(id)}>
              <ExternalLink size={12} /> abrir licitação
            </button>
          )}
        </div>
        {erro && <p className="text-xs text-erro">{erro}</p>}
      </header>

      {mensagens.length === 0 ? (
        <p className="p-4 text-sm text-texto-suave">
          {m.chat_status === 'ok' ? 'O chat está aberto, mas ainda não há mensagens.' : 'Nenhuma mensagem lida deste chat.'}
        </p>
      ) : (
        <ul className="divide-y divide-borda max-h-[60vh] overflow-auto">
          {mensagens.map((msg) => (
            <li key={msg.id} className={`p-3 text-sm ${msg.lida ? '' : 'bg-voltagem/[0.05]'}`}>
              <div className="flex items-baseline gap-2 text-[11px] text-texto-suave">
                <b className="text-texto">{msg.autor || 'sem autor'}</b>
                <span>{dataHora(msg.enviada_em || msg.criado_em)}</span>
                {!msg.lida && <span className="text-voltagem">nova</span>}
                <span className="ml-auto flex gap-2">
                  <button
                    title={msg.importante ? 'tirar de importantes' : 'marcar como importante'}
                    aria-pressed={msg.importante}
                    className={msg.importante ? 'text-atencao' : 'hover:text-texto'}
                    onClick={() => executar(() => api.chatMarcar(msg.id, { importante: !msg.importante }))}
                  >
                    <Star size={13} fill={msg.importante ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    title={msg.lida ? 'marcar como não lida' : 'marcar como lida'}
                    aria-pressed={msg.lida}
                    className="hover:text-texto"
                    onClick={() => executar(() => api.chatMarcar(msg.id, { lida: !msg.lida }))}
                  >
                    <CheckCheck size={13} />
                  </button>
                </span>
              </div>
              {/* Texto do portal é dado de terceiro: entra como texto, nunca como HTML. */}
              <p className="mt-1 whitespace-pre-wrap break-words">{msg.texto}</p>
              {msg.destaques.length > 0 && (
                <p className="mt-1 flex flex-wrap gap-1">
                  {msg.destaques.map((d) => (
                    <span key={d} className="text-[11px] px-1.5 py-0.5 rounded border border-erro/40 text-erro">
                      {d}
                    </span>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
