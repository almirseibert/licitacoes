import { useEffect, useState } from 'react';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../servicos/api';
import { data as formatarData, dataHora, resumir } from '../servicos/formato';

const ROTULO_EVENTO = { prazo: 'fim das propostas', abertura: 'abertura', tarefa: 'tarefa', andamento: 'andamento' };
const COR_EVENTO = { prazo: 'bg-erro', abertura: 'bg-voltagem', tarefa: 'bg-atencao', andamento: 'bg-texto-suave' };
const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

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

/**
 * Versão compacta da Agenda (Seção 8) para o Dashboard: mês atual, com o
 * dia selecionado ao lado. "Ver agenda completa" leva à tela Calendário,
 * que tem a navegação entre meses e as recorrências.
 */
export default function AgendaResumo({ aoAbrir, aoVerCalendario }) {
  const hoje = chaveDia(new Date());
  const [mes, setMes] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [eventos, setEventos] = useState(null);
  const [erro, setErro] = useState(null);
  const [diaEscolhido, setDiaEscolhido] = useState(hoje);

  const casas = casasDoMes(mes);
  const de = chaveDia(casas[0]);
  const ate = chaveDia(casas[casas.length - 1]);

  useEffect(() => {
    setEventos(null);
    api
      .agenda(de, ate, 'todos')
      .then((r) => { setEventos(r.eventos); setErro(null); })
      .catch((e) => setErro(e.message));
  }, [de, ate]);

  const porDia = new Map();
  for (const e of eventos || []) {
    if (!porDia.has(e.dia)) porDia.set(e.dia, []);
    porDia.get(e.dia).push(e);
  }
  const doDia = porDia.get(diaEscolhido) || [];
  const andar = (n) => setMes((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));

  const tituloMes = (() => {
    const t = mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  })();

  return (
    <section aria-labelledby="titulo-agenda" className="border border-borda rounded bg-superficie/40 p-3">
      <div className="flex items-center gap-2 mb-2">
        <h2 id="titulo-agenda" className="text-sm">Agenda</h2>
        <button onClick={() => andar(-1)} aria-label="Mês anterior" className="ml-auto text-texto-suave hover:text-texto">
          <ChevronLeft size={14} />
        </button>
        <p className="text-xs w-28 text-center">{tituloMes}</p>
        <button onClick={() => andar(1)} aria-label="Próximo mês" className="text-texto-suave hover:text-texto">
          <ChevronRight size={14} />
        </button>
      </div>

      {erro && <p className="text-xs text-erro mb-2">{erro}</p>}

      <div className="grid grid-cols-[1fr_11rem] gap-3">
        <div>
          <div className="grid grid-cols-7 text-[9px] uppercase text-texto-suave">
            {DIAS_SEMANA.map((d, i) => <span key={i} className="text-center">{d}</span>)}
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
                  className={`min-h-[2.2rem] p-0.5 text-left bg-obsidiana hover:bg-superficie ${foraDoMes ? 'opacity-30' : ''} ${
                    diaEscolhido === chave ? 'ring-1 ring-inset ring-texto' : ''
                  }`}
                >
                  <span className={`text-[10px] font-mono ${chave === hoje ? 'text-voltagem font-bold' : 'text-texto-suave'}`}>
                    {d.getDate()}
                  </span>
                  <span className="flex flex-wrap gap-0.5">
                    {lista.slice(0, 3).map((e, i) => (
                      <span key={i} className={`w-1 h-1 rounded-full ${COR_EVENTO[e.tipo]}`} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
          {!eventos && !erro && <Loader2 size={13} className="animate-spin text-texto-suave mt-2" />}
          <ul className="flex flex-wrap gap-2 mt-2 text-[10px] text-texto-suave">
            {Object.entries(ROTULO_EVENTO).map(([tipo, rotulo]) => (
              <li key={tipo} className="flex items-center gap-1">
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${COR_EVENTO[tipo]}`} /> {rotulo}
              </li>
            ))}
          </ul>
        </div>

        <div className="border-l border-borda pl-3">
          <p className="text-xs mb-1">
            {diaEscolhido === hoje ? 'Agenda de hoje' : formatarData(diaEscolhido)}
          </p>
          {doDia.length === 0 ? (
            <p className="text-[11px] text-texto-suave">Nada marcado.</p>
          ) : (
            <ul className="space-y-1.5 max-h-32 overflow-auto">
              {doDia.map((e, i) => (
                <li key={i} className="text-[11px]">
                  <p className="text-texto-suave flex items-center gap-1">
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${COR_EVENTO[e.tipo]}`} />
                    {ROTULO_EVENTO[e.tipo]}{e.tipo !== 'tarefa' && ` · ${dataHora(e.quando).slice(-5)}`}
                  </p>
                  {e.licitacao_id ? (
                    <button className="text-left hover:underline" onClick={() => aoAbrir && aoAbrir(e.licitacao_id)}>
                      {resumir(e.titulo, 60)}
                    </button>
                  ) : (
                    <p>{resumir(e.titulo, 60)}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <button onClick={aoVerCalendario} className="text-[11px] text-voltagem hover:underline mt-2">
            Ver agenda completa
          </button>
        </div>
      </div>
    </section>
  );
}
