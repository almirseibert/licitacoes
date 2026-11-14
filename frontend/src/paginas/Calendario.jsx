import { useEffect, useState } from 'react';
import { Loader2, RefreshCcw, BellPlus, Info, Repeat, ChevronLeft, ChevronRight } from 'lucide-react';
import PorMim from '../componentes/PorMim';
import { api } from '../servicos/api';
import { moeda, data as formatarData, resumir, dataHora } from '../servicos/formato';

/**
 * Tela "Calendário" (Seção 8): a agenda de trabalho do mês — prazo e abertura
 * das licitações acompanhadas, prazo das tarefas e andamentos — com a agenda
 * do dia ao lado; e, na segunda aba, as recorrências da seção 24.4.
 */
export default function Calendario({ aoAbrir }) {
  const [aba, setAba] = useState('agenda');
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-borda flex items-center gap-4 shrink-0">
        <h1 className="font-titulo text-xl">Calendário</h1>
        <nav className="flex gap-3 text-xs">
          {[
            ['agenda', 'Agenda'],
            ['recorrencias', 'Recorrências'],
          ].map(([chave, rotulo]) => (
            <button
              key={chave}
              onClick={() => setAba(chave)}
              aria-pressed={aba === chave}
              className={`pb-1 border-b-2 ${aba === chave ? 'border-texto text-texto' : 'border-transparent text-texto-suave hover:text-texto'}`}
            >
              {rotulo}
            </button>
          ))}
        </nav>
      </div>
      <div className="flex-1 min-h-0">{aba === 'agenda' ? <Agenda aoAbrir={aoAbrir} /> : <Recorrencias />}</div>
    </div>
  );
}

const ROTULO_EVENTO = { prazo: 'fim das propostas', abertura: 'abertura', tarefa: 'tarefa', andamento: 'andamento' };
const COR_EVENTO = { prazo: 'bg-erro', abertura: 'bg-voltagem', tarefa: 'bg-atencao', andamento: 'bg-texto-suave' };
const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const doisDigitos = (n) => String(n).padStart(2, '0');
const chaveDia = (d) => `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;

function casasDoMes(mes) {
  const casas = [];
  const primeiro = new Date(mes);
  primeiro.setDate(1 - primeiro.getDay());
  const ultimo = new Date(mes.getFullYear(), mes.getMonth() + 1, 0);
  for (const d = new Date(primeiro); d <= ultimo || d.getDay() !== 0; d.setDate(d.getDate() + 1)) {
    casas.push(new Date(d));
  }
  return casas;
}

function Agenda({ aoAbrir }) {
  const hoje = chaveDia(new Date());
  const [mes, setMes] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [por, setPor] = useState('todos');
  const [eventos, setEventos] = useState(null);
  const [erro, setErro] = useState(null);
  const [diaEscolhido, setDiaEscolhido] = useState(hoje);

  // Grade de semanas: começa no domingo antes do dia 1 e vai até o sábado
  // depois do último — e a agenda pede a grade inteira, não só o mês, para a
  // casa do mês vizinho não aparecer vazia.
  const casas = casasDoMes(mes);
  const de = chaveDia(casas[0]);
  const ate = chaveDia(casas[casas.length - 1]);

  useEffect(() => {
    setEventos(null);
    api
      .agenda(de, ate, por)
      .then((r) => {
        setEventos(r.eventos);
        setErro(null);
      })
      .catch((e) => setErro(e.message));
  }, [de, ate, por]);

  const porDia = new Map();
  for (const e of eventos || []) {
    if (!porDia.has(e.dia)) porDia.set(e.dia, []);
    porDia.get(e.dia).push(e);
  }

  const doDia = porDia.get(diaEscolhido) || [];
  const andar = (n) => setMes((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));

  return (
    <div className="h-full overflow-auto p-4">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <button className="botao" onClick={() => andar(-1)} aria-label="Mês anterior"><ChevronLeft size={14} /></button>
        <p className="text-sm w-36 text-center">
          {(() => {
            const t = mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
            return t.charAt(0).toUpperCase() + t.slice(1);
          })()}
        </p>
        <button className="botao" onClick={() => andar(1)} aria-label="Próximo mês"><ChevronRight size={14} /></button>
        <PorMim valor={por} aoMudar={setPor} />
        <ul className="flex flex-wrap gap-3 text-[11px] text-texto-suave ml-auto">
          {Object.entries(ROTULO_EVENTO).map(([tipo, rotulo]) => (
            <li key={tipo} className="flex items-center gap-1">
              <span className={`inline-block w-2 h-2 rounded-full ${COR_EVENTO[tipo]}`} /> {rotulo}
            </li>
          ))}
        </ul>
      </div>
      {erro && <p className="text-xs text-erro mb-2">{erro}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-4">
        <div>
          <div className="grid grid-cols-7 text-[10px] uppercase tracking-wide text-texto-suave mb-1">
            {DIAS_SEMANA.map((d) => <span key={d} className="px-1">{d}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-px bg-borda border border-borda rounded overflow-hidden">
            {casas.map((d) => {
              const chave = chaveDia(d);
              const lista = porDia.get(chave) || [];
              const foraDoMes = d.getMonth() !== mes.getMonth();
              return (
                <button
                  key={chave}
                  onClick={() => setDiaEscolhido(chave)}
                  aria-label={`${d.toLocaleDateString('pt-BR')}: ${lista.length} evento(s)`}
                  aria-pressed={diaEscolhido === chave}
                  className={`min-h-[3.5rem] p-1 text-left bg-obsidiana hover:bg-superficie ${foraDoMes ? 'opacity-40' : ''} ${
                    diaEscolhido === chave ? 'ring-1 ring-inset ring-texto' : ''
                  }`}
                >
                  <span className={`text-[11px] font-mono ${chave === hoje ? 'text-voltagem font-bold' : 'text-texto-suave'}`}>
                    {d.getDate()}
                  </span>
                  <span className="flex flex-wrap gap-0.5 mt-1">
                    {lista.slice(0, 6).map((e, i) => (
                      <span key={i} className={`w-1.5 h-1.5 rounded-full ${COR_EVENTO[e.tipo]}`} />
                    ))}
                    {lista.length > 6 && <span className="text-[9px] text-texto-suave">+{lista.length - 6}</span>}
                  </span>
                </button>
              );
            })}
          </div>
          {!eventos && !erro && <Loader2 size={14} className="animate-spin text-texto-suave mt-2" />}
        </div>

        <section aria-label="Agenda do dia" className="border border-borda rounded">
          <h2 className="px-3 py-2 border-b border-borda text-sm">
            {diaEscolhido === hoje ? 'Agenda de hoje' : `Agenda de ${formatarData(diaEscolhido)}`}
          </h2>
          {doDia.length === 0 ? (
            <p className="px-3 py-3 text-xs text-texto-suave">Nada marcado neste dia.</p>
          ) : (
            <ul className="divide-y divide-borda">
              {doDia.map((e, i) => (
                <li key={i} className="px-3 py-2">
                  <p className="text-[11px] text-texto-suave flex items-center gap-1.5">
                    <span className={`inline-block w-2 h-2 rounded-full ${COR_EVENTO[e.tipo]}`} />
                    {ROTULO_EVENTO[e.tipo]}
                    {e.tipo !== 'tarefa' && ` · ${dataHora(e.quando).slice(-5)}`}
                    {e.concluida && ' · concluída'}
                  </p>
                  {e.licitacao_id ? (
                    <button className="text-left text-sm hover:underline" onClick={() => aoAbrir && aoAbrir(e.licitacao_id)}>
                      {resumir(e.titulo, 120)}
                    </button>
                  ) : (
                    <p className="text-sm">{resumir(e.titulo, 120)}</p>
                  )}
                  {e.detalhe && <p className="text-[11px] text-texto-suave">{e.detalhe}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * Recorrências (seção 24.4) — doze meses com as recorrências previstas.
 *
 * Serve para planejar o ano: em que mês vale ter certidão em dia e caixa para
 * garantia. Por isso os meses começam no corrente, e não em janeiro — ninguém
 * planeja o ano olhando para trás.
 *
 * A confiança aparece em todas as linhas, sem eufemismo: 0,5 é "aconteceu duas
 * vezes", não é promessa. Esconder isso faria a tela parecer um oráculo.
 */
function Recorrencias() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(null);
  const [confianca, setConfianca] = useState(0);

  const carregar = async (minima = confianca) => {
    try {
      setDados(await api.calendario(minima));
      setErro(null);
    } catch (e) {
      setErro(e.message);
    }
  };

  useEffect(() => {
    carregar(confianca);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confianca]);

  const detectar = async () => {
    setOcupado('detectar');
    setAviso(null);
    try {
      const r = await api.detectarRecorrencias();
      setAviso(r.mensagem);
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(null);
    }
  };

  const preparar = async (r) => {
    setOcupado(`preparar-${r.id}`);
    setAviso(null);
    try {
      const resposta = await api.prepararRecorrencia(r.id);
      setAviso(resposta.mensagem);
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(null);
    }
  };

  if (erro && !dados) return <p className="m-4 text-sm text-erro">{erro}</p>;
  if (!dados) return <Loader2 size={16} className="animate-spin text-texto-suave m-4" />;

  const comAlgo = dados.meses.filter((m) => m.recorrencias.length);

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-borda flex items-center gap-4 shrink-0 flex-wrap">
        <h2 className="text-sm">Recorrências previstas</h2>
        <p className="text-xs text-texto-suave">
          {dados.resumo.comprovadas} recorrência(s) com duas ocorrências ou mais ·{' '}
          {dados.resumo.previstas} com janela prevista
        </p>
        <div className="flex items-center gap-1">
          {[
            [0, 'todas'],
            [0.8, 'confiança ≥ 0,8'],
          ].map(([valor, rotulo]) => (
            <button
              key={rotulo}
              onClick={() => setConfianca(valor)}
              className={`px-2 py-0.5 text-xs border rounded ${
                confianca === valor ? 'border-texto text-texto' : 'border-borda text-texto-suave hover:text-texto'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <button className="botao flex items-center gap-1 ml-auto" onClick={detectar} disabled={Boolean(ocupado)}>
          {ocupado === 'detectar' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCcw size={12} />}
          recalcular
        </button>
      </div>

      {erro && <p className="mx-4 mt-2 px-3 py-2 text-xs border border-erro/40 text-erro rounded bg-erro/5">{erro}</p>}
      {aviso && (
        <p className="mx-4 mt-2 px-3 py-2 text-xs border border-borda bg-superficie rounded text-texto-suave">
          {aviso}
        </p>
      )}

      <div className="flex-1 overflow-auto p-4 space-y-5">
        <p className="flex items-start gap-2 text-xs text-texto-suave max-w-4xl">
          <Info size={13} className="shrink-0 mt-0.5" />
          {dados.ressalva}
        </p>

        {comAlgo.length === 0 ? (
          <p className="text-sm text-texto-suave max-w-2xl">
            Nenhuma recorrência prevista para os próximos doze meses. Ela nasce de duas contratações do
            mesmo órgão com o mesmo objeto em anos diferentes — quanto mais fundo for a amostra de
            encerradas, mais o calendário enxerga. Rode <span className="font-mono">coletar encerradas</span> em
            Preço de referência.
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {comAlgo.map((m) => (
              <section key={m.chave} className="border border-borda rounded bg-superficie/40">
                <header className="px-3 py-2 border-b border-borda flex items-baseline gap-2">
                  <h2 className="font-titulo text-sm capitalize">
                    {m.rotulo} <span className="text-texto-suave font-normal">{m.ano}</span>
                  </h2>
                  <span className="ml-auto font-mono text-xs text-voltagem">{moeda(m.valor)}</span>
                </header>
                <ul className="divide-y divide-borda/50">
                  {m.recorrencias.map((r) => (
                    <li key={r.id} className="px-3 py-2">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm flex-1">{resumir(r.objeto_exemplo || r.assinatura_objeto, 90)}</span>
                        <Confianca valor={r.confianca} ocorrencias={r.ocorrencias} />
                      </div>
                      <div className="mt-1 flex items-center gap-3 flex-wrap text-[11px] text-texto-suave">
                        <span>{r.orgao_nome || 'órgão não informado'}</span>
                        {r.uf && <span className="font-mono">{r.uf}</span>}
                        <span className="font-mono">{formatarData(r.proxima_prevista)}</span>
                        {r.valor_medio && <span className="font-mono">{moeda(r.valor_medio)} em média</span>}
                        {r.ultimo_vencedor && <span>último: {resumir(r.ultimo_vencedor, 30)}</span>}
                        <button
                          className="ml-auto flex items-center gap-1 hover:text-texto"
                          onClick={() => preparar(r)}
                          disabled={ocupado === `preparar-${r.id}`}
                          title="Cria o lembrete com o checklist para a janela prevista"
                        >
                          {ocupado === `preparar-${r.id}` ? (
                            <Loader2 size={10} className="animate-spin" />
                          ) : (
                            <BellPlus size={10} />
                          )}
                          preparar
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {dados.sem_previsao.length > 0 && (
          <section>
            <h2 className="font-titulo text-base mb-2">
              Repetem, mas sem janela nos próximos doze meses
            </h2>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-texto-suave border-b border-borda">
                <tr>
                  <th className="text-left py-2 font-normal">Órgão</th>
                  <th className="text-left py-2 font-normal">Objeto</th>
                  <th className="text-right py-2 font-normal">Vezes</th>
                  <th className="text-right py-2 font-normal">Intervalo</th>
                  <th className="text-right py-2 font-normal">Última</th>
                  <th className="text-right py-2 font-normal">Valor médio</th>
                  <th className="text-right py-2 font-normal pl-3">Confiança</th>
                </tr>
              </thead>
              <tbody>
                {dados.sem_previsao.map((r) => (
                  <tr key={r.id} className="border-b border-borda/40">
                    <td className="py-1.5">{resumir(r.orgao_nome, 35)}</td>
                    <td className="py-1.5">{resumir(r.objeto_exemplo || r.assinatura_objeto, 60)}</td>
                    <td className="py-1.5 text-right font-mono">{r.ocorrencias}</td>
                    <td className="py-1.5 text-right font-mono text-texto-suave">
                      {r.intervalo_medio_dias ? `${r.intervalo_medio_dias}d` : '—'}
                    </td>
                    <td className="py-1.5 text-right font-mono text-texto-suave">{formatarData(r.ultima_em)}</td>
                    <td className="py-1.5 text-right font-mono">{moeda(r.valor_medio)}</td>
                    <td className="py-1.5 text-right pl-3">
                      <Confianca valor={r.confianca} ocorrencias={r.ocorrencias} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  );
}

/** A confiança escrita como ela é: o número e de onde ele vem. */
function Confianca({ valor, ocorrencias }) {
  const n = Number(valor || 0);
  const cor = n >= 0.8 ? 'text-voltagem' : n >= 0.5 ? 'text-texto-suave' : 'text-texto-suave opacity-70';
  return (
    <span
      className={`shrink-0 flex items-center gap-1 font-mono text-[11px] ${cor}`}
      title={`${ocorrencias} ocorrência(s) do mesmo objeto neste órgão, em anos diferentes`}
    >
      <Repeat size={10} />
      {ocorrencias}× · {n.toFixed(2)}
    </span>
  );
}
