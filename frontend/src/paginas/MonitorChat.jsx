import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Archive, ArchiveRestore, Star, CheckCheck, RefreshCcw, PowerOff, ExternalLink, MessageSquareWarning } from 'lucide-react';
import { api } from '../servicos/api';
import { dataHora } from '../servicos/formato';
import Abas from '../componentes/Abas';

const ABAS = [
  ['todos', 'Todos'],
  ['nao_lidos', 'Não lidos'],
  ['importantes', 'Importantes'],
  ['arquivados', 'Arquivados'],
  ['portais', 'Portais compatíveis'],
];

// O que cada situação do monitor quer dizer, em português claro.
const SITUACAO = {
  aguardando: { rotulo: 'aguardando a sessão', cor: 'text-texto-suave' },
  ok: { rotulo: 'lendo o chat', cor: 'text-voltagem' },
  bloqueado: { rotulo: 'portal bloqueado', cor: 'text-atencao' },
  sem_consulta: { rotulo: 'sem consulta pública', cor: 'text-texto-suave' },
  erro: { rotulo: 'falhou na última leitura', cor: 'text-erro' },
  encerrado: { rotulo: 'janela encerrada', cor: 'text-texto-suave' },
};

const PORTAL = {
  bloqueada: { rotulo: 'bloqueado', cor: 'text-atencao' },
  nao_ha: { rotulo: 'não publica chat', cor: 'text-texto-suave' },
  nao_verificada: { rotulo: 'não conferido', cor: 'text-texto-suave' },
  configuravel: { rotulo: 'configurável', cor: 'text-voltagem' },
};

/**
 * Monitor de chat do pregão (Seção 6): as mensagens do pregoeiro, por edital,
 * nos portais que publicam o chat para quem não está logado. Onde o portal exige
 * login ou CAPTCHA, a tela diz isso — o painel nunca entra por você.
 */
export default function MonitorChat({ aoAbrir }) {
  const [aba, setAba] = useState('todos');
  const [lista, setLista] = useState(null);
  const [aberto, setAberto] = useState(null); // id da licitação
  const [erro, setErro] = useState(null);

  const carregar = useCallback(
    () =>
      api
        .chatMonitores(aba === 'portais' ? 'todos' : aba)
        .then((r) => {
          setLista(r);
          setErro(null);
        })
        .catch((e) => setErro(e.message)),
    [aba]
  );

  useEffect(() => {
    carregar();
  }, [carregar]);

  const abas = lista ? ABAS.map(([c, r]) => [c, lista.abas[c] !== undefined ? `${r} (${lista.abas[c]})` : r]) : ABAS;

  return (
    <div className="h-full overflow-auto">
      <div className="px-4 py-3 border-b border-borda flex flex-wrap items-center gap-x-4 gap-y-1">
        <h1 className="font-titulo text-xl">Monitor de chat</h1>
        {lista && (
          <p className="text-xs text-texto-suave">
            {lista.vagas.usados} de {lista.vagas.limite === null ? 'sem limite' : lista.vagas.limite} monitor(es) de chat em uso
          </p>
        )}
      </div>

      <div className="px-4 pt-3">
        <Abas abas={abas} ativa={aba} aoMudar={(a) => { setAba(a); setAberto(null); }} />
      </div>

      {erro && <p className="mx-4 mb-3 px-3 py-2 text-xs border border-erro/40 text-erro rounded bg-erro/5">{erro}</p>}

      {aba === 'portais' ? (
        <PortaisCompativeis />
      ) : !lista ? (
        <Loader2 size={16} className="animate-spin text-texto-suave m-4" />
      ) : (
        <div className="px-4 pb-6 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <ListaDeEditais dados={lista.dados} aba={aba} aberto={aberto} aoEscolher={setAberto} />
          {aberto ? (
            <Mensagens
              key={aberto}
              id={aberto}
              aoMudar={carregar}
              aoFechar={() => setAberto(null)}
              aoAbrirLicitacao={aoAbrir}
            />
          ) : (
            <p className="text-sm text-texto-suave border border-dashed border-borda rounded p-6 self-start">
              Escolha um edital para ler as mensagens do pregoeiro.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ListaDeEditais({ dados, aba, aberto, aoEscolher }) {
  if (!dados.length) {
    return (
      <div className="text-sm text-texto-suave border border-dashed border-borda rounded p-6 self-start space-y-2">
        <p>
          {aba === 'todos'
            ? 'Nenhum chat sendo monitorado.'
            : 'Nada nesta aba.'}
        </p>
        {aba === 'todos' && (
          <p className="text-xs">
            Abra uma licitação no Radar, vá em “Linha do tempo” e use <b>chat do pregão</b>. O painel só lê o chat de portais
            que o publicam sem login — veja a aba “Portais compatíveis”.
          </p>
        )}
      </div>
    );
  }
  return (
    <ul className="space-y-2 self-start">
      {dados.map((d) => {
        const s = SITUACAO[d.chat_status] || SITUACAO.aguardando;
        return (
          <li key={d.licitacao_id}>
            <button
              onClick={() => aoEscolher(d.licitacao_id)}
              className={`w-full text-left border rounded p-3 bg-superficie hover:border-texto-suave ${
                aberto === d.licitacao_id ? 'border-texto' : 'border-borda'
              }`}
            >
              <div className="flex items-start gap-2">
                <p className="text-sm flex-1 line-clamp-2">{d.objeto || 'Sem objeto informado'}</p>
                {d.nao_lidas > 0 && (
                  <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded-full bg-erro text-white" title="mensagens não lidas">
                    {d.nao_lidas}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-texto-suave mt-1">
                {d.orgao_nome || 'órgão não informado'}
                {d.uf ? ` · ${d.uf}` : ''} · sessão {dataHora(d.fim_propostas)}
              </p>
              <p className="text-[11px] mt-1 flex flex-wrap gap-x-3">
                <span className={s.cor}>{d.chat_ativo ? s.rotulo : 'desligado'}</span>
                <span className="text-texto-suave">{d.total} mensagem(ns)</span>
                {d.importantes > 0 && <span className="text-atencao">{d.importantes} importante(s)</span>}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Mensagens({ id, aoMudar, aoFechar, aoAbrirLicitacao }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const painel = useRef(null);

  // No celular o painel fica abaixo da lista: traz para a vista ao escolher um edital.
  const carregado = dados !== null;
  useEffect(() => {
    if (carregado && painel.current && window.innerWidth < 1024) painel.current.scrollIntoView({ block: 'start' });
  }, [carregado]);

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

  if (erro && !dados) return <p className="text-sm text-erro">{erro}</p>;
  if (!dados) return <Loader2 size={16} className="animate-spin text-texto-suave" />;

  const { licitacao, monitoramento: m, mensagens } = dados;
  const s = SITUACAO[m.chat_status] || SITUACAO.aguardando;
  const link = m.chat_link || (licitacao && (licitacao.link_disputa || licitacao.link_portal));

  return (
    <section ref={painel} className="border border-borda rounded bg-superficie self-start">
      <header className="p-3 border-b border-borda space-y-2">
        <div className="flex items-start gap-2">
          <p className="text-sm flex-1">{licitacao ? licitacao.objeto : 'Licitação'}</p>
          <button className="text-xs text-texto-suave hover:text-texto" onClick={aoFechar}>
            fechar
          </button>
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

/** Portal a portal: o que se sabe, e o que o painel mediu nas suas leituras. */
function PortaisCompativeis() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    api.chatPortais().then(setDados).catch((e) => setErro(e.message));
  }, []);

  if (erro) return <p className="m-4 text-sm text-erro">{erro}</p>;
  if (!dados) return <Loader2 size={16} className="animate-spin text-texto-suave m-4" />;

  return (
    <div className="px-4 pb-6 space-y-4">
      <p className="text-xs text-texto-suave max-w-3xl">
        O painel só lê o chat de um portal que o publica <b>para quem não está logado</b>. Ele nunca entra no portal com a sua senha,
        nunca guarda certificado e nunca resolve CAPTCHA. Onde não há consulta pública, o chat precisa ser acompanhado no próprio portal.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm tabela-densa">
          <thead>
            <tr>
              <th>Portal</th>
              <th className="w-40">Consulta pública</th>
              <th>O que se sabe</th>
            </tr>
          </thead>
          <tbody>
            {dados.catalogo.map((p) => {
              const s = PORTAL[p.situacao] || PORTAL.nao_verificada;
              return (
                <tr key={p.portal}>
                  <td>{p.portal}</td>
                  <td className={s.cor}>{s.rotulo}</td>
                  <td className="text-xs text-texto-suave">{p.detalhe || p.explicacao}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="text-sm mb-1">O que o painel mediu nas suas licitações</h2>
        {dados.medido.length === 0 ? (
          <p className="text-xs text-texto-suave">Ainda nenhuma leitura. Ligue o chat de uma licitação para começar a medir.</p>
        ) : (
          <ul className="text-xs space-y-1">
            {dados.medido.map((m) => {
              const s = SITUACAO[m.status] || SITUACAO.aguardando;
              return (
                <li key={`${m.fonte}-${m.status}`}>
                  <b>{m.fonte}</b> — {m.chats} chat(s) <span className={s.cor}>{s.rotulo}</span>
                  {m.aviso && m.status !== 'ok' ? <span className="text-texto-suave"> · {m.aviso}</span> : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
