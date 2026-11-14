import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Check, RotateCcw } from 'lucide-react';
import { api } from '../servicos/api';
import { data } from '../servicos/formato';
import PorMim from '../componentes/PorMim';

/**
 * Tarefas da equipe (Seção 8): quem faz o quê, até quando.
 *
 * Duas formas: a tela inteira (visões atrasadas / hoje / futuras / concluídas,
 * por mim ou por todos) e a aba dentro da licitação (`licitacaoId`), que mostra
 * todas as daquela licitação numa lista só.
 */
const VISOES = [
  ['atrasadas', 'Atrasadas'],
  ['hoje', 'Hoje'],
  ['futuras', 'Futuras'],
  ['concluidas', 'Concluídas'],
];

const COR_VISAO = { atrasadas: 'text-erro', hoje: 'text-atencao' };

// `equipe` ({ membros, eu }) vem de quem já buscou — o Detalhe — para não
// pedir a mesma lista de novo a cada troca de aba.
export default function Tarefas({ licitacaoId = null, aoAbrir, equipe = null }) {
  const naLicitacao = Boolean(licitacaoId);
  const [visao, setVisao] = useState(naLicitacao ? '' : 'hoje');
  const [por, setPor] = useState('todos');
  const [dados, setDados] = useState(null);
  const [totais, setTotais] = useState({});
  const [buscada, setBuscada] = useState(null);
  const { membros, eu } = equipe || buscada || { membros: [], eu: null };
  const [erro, setErro] = useState(null);
  const [novo, setNovo] = useState({ titulo: '', prazo: '', responsavel_id: '' });
  const [salvando, setSalvando] = useState(false);

  const carregar = () =>
    api
      .tarefas({ visao, por, licitacao_id: licitacaoId })
      .then((r) => {
        setDados(r.dados);
        setTotais(r.totais || {});
        setErro(null);
      })
      .catch((e) => setErro(e.message));

  useEffect(() => {
    if (equipe) return;
    api
      .membros()
      .then((r) => setBuscada({ membros: r.dados, eu: r.eu }))
      .catch(() => {});
  }, [equipe]);

  // Quem cria a tarefa é o responsável sugerido.
  useEffect(() => {
    if (eu) setNovo((n) => ({ ...n, responsavel_id: n.responsavel_id || String(eu) }));
  }, [eu]);

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visao, por, licitacaoId]);

  const criar = async (e) => {
    e.preventDefault();
    if (!novo.titulo.trim()) return;
    setSalvando(true);
    try {
      await api.criarTarefa({ ...novo, licitacao_id: licitacaoId || undefined });
      setNovo((n) => ({ ...n, titulo: '', prazo: '' }));
      await carregar();
    } catch (e2) {
      setErro(e2.message);
    } finally {
      setSalvando(false);
    }
  };

  const mudar = async (tarefa, campos) => {
    try {
      await api.salvarTarefa(tarefa.id, campos);
      await carregar();
    } catch (e) {
      setErro(e.message);
    }
  };

  const apagar = async (tarefa) => {
    if (!window.confirm(`Apagar a tarefa "${tarefa.titulo}"?`)) return;
    try {
      await api.apagarTarefa(tarefa.id);
      await carregar();
    } catch (e) {
      setErro(e.message);
    }
  };

  const corpo = (
    <div className="space-y-3">
      <form onSubmit={criar} className="flex flex-wrap gap-2 items-end">
        <input
          className="campo-caixa flex-1 min-w-[12rem]"
          placeholder="nova tarefa (ex.: pedir atestado ao cliente)"
          aria-label="Título da tarefa"
          value={novo.titulo}
          onChange={(e) => setNovo({ ...novo, titulo: e.target.value })}
        />
        <input
          type="date"
          className="campo-caixa"
          aria-label="Prazo"
          value={novo.prazo}
          onChange={(e) => setNovo({ ...novo, prazo: e.target.value })}
        />
        <select
          className="campo-caixa"
          aria-label="Responsável"
          value={novo.responsavel_id}
          onChange={(e) => setNovo({ ...novo, responsavel_id: e.target.value })}
        >
          <option value="">sem responsável</option>
          {membros.map((m) => (
            <option key={m.id} value={m.id}>{m.id === eu ? `${m.nome} (eu)` : m.nome}</option>
          ))}
        </select>
        <button className="botao-primario flex items-center gap-1" disabled={salvando}>
          {salvando ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Criar
        </button>
      </form>

      {erro && <p className="text-xs text-erro">{erro}</p>}
      {!dados ? (
        <Loader2 size={16} className="animate-spin text-texto-suave" />
      ) : dados.length === 0 ? (
        <p className="text-sm text-texto-suave">Nenhuma tarefa aqui.</p>
      ) : (
        <ul className="divide-y divide-borda border border-borda rounded">
          {dados.map((t) => (
            <li key={t.id} className="px-3 py-2 flex items-start gap-3">
              <button
                type="button"
                onClick={() => mudar(t, { status: t.status === 'concluida' ? 'aberta' : 'concluida' })}
                className="mt-0.5 text-texto-suave hover:text-texto"
                title={t.status === 'concluida' ? 'Reabrir' : 'Concluir'}
                aria-label={t.status === 'concluida' ? `Reabrir ${t.titulo}` : `Concluir ${t.titulo}`}
              >
                {t.status === 'concluida' ? <RotateCcw size={14} /> : <Check size={14} />}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${t.status === 'concluida' ? 'line-through text-texto-suave' : ''}`}>{t.titulo}</p>
                <p className="text-[11px] text-texto-suave flex flex-wrap gap-x-3">
                  <span className={`font-mono ${COR_VISAO[t.visao] || ''}`}>
                    {t.prazo ? `até ${data(t.prazo)}` : 'sem prazo'}
                    {t.visao === 'atrasadas' && ' · atrasada'}
                  </span>
                  <span>{t.responsavel_nome || 'sem responsável'}</span>
                  {!naLicitacao && t.licitacao_id && (
                    <button type="button" className="underline truncate max-w-[24rem]" onClick={() => aoAbrir && aoAbrir(t.licitacao_id)}>
                      {t.licitacao_orgao || 'licitação'} — {t.licitacao_objeto}
                    </button>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => apagar(t)}
                className="text-texto-suave hover:text-erro"
                aria-label={`Apagar ${t.titulo}`}
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  if (naLicitacao) return corpo;

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-borda flex flex-wrap items-center gap-4 shrink-0">
        <h1 className="font-titulo text-xl">Tarefas</h1>
        <nav className="flex gap-3 text-xs" aria-label="Visões">
          {VISOES.map(([chave, rotulo]) => (
            <button
              key={chave}
              onClick={() => setVisao(chave)}
              aria-pressed={visao === chave}
              className={`pb-1 border-b-2 ${visao === chave ? 'border-texto text-texto' : 'border-transparent text-texto-suave hover:text-texto'}`}
            >
              {rotulo} <span className={`font-mono ${COR_VISAO[chave] || ''}`}>{totais[chave] ?? 0}</span>
            </button>
          ))}
        </nav>
        <div className="ml-auto">
          <PorMim valor={por} aoMudar={setPor} />
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">{corpo}</div>
    </div>
  );
}
