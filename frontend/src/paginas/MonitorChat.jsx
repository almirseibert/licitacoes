import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../servicos/api';
import { dataHora } from '../servicos/formato';
import Abas from '../componentes/Abas';
import ChatLicitacao from '../componentes/ChatLicitacao';

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
            <ChatLicitacao
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
