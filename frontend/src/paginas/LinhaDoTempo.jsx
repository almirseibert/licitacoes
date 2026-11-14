import { useEffect, useState } from 'react';
import { Loader2, Eye, EyeOff, RefreshCcw, AlertTriangle, FileDiff, CalendarClock, Trophy, RotateCcw, Flag, MessageSquareText, Plus, Trash2 } from 'lucide-react';
import { api } from '../servicos/api';
import { dataHora } from '../servicos/formato';

/**
 * Aba "Linha do tempo" (seção 21.4): publicação → alterações → sessão →
 * resultado, com data e hora de cada evento.
 *
 * É também a prova documental do que aconteceu, útil se houver recurso — por
 * isso nenhum evento é editável aqui, e nenhum some. O que o painel observou,
 * ficou observado.
 */

const ICONES = {
  publicacao: CalendarClock,
  edital_alterado: FileDiff,
  data_alterada: CalendarClock,
  situacao: Flag,
  resultado: Trophy,
  reaberta: RotateCcw,
  andamento: MessageSquareText,
};

const CORES = {
  edital_alterado: 'text-erro',
  data_alterada: 'text-atencao',
  resultado: 'text-voltagem',
  reaberta: 'text-atencao',
};

export default function LinhaDoTempo({ id }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(null);

  // Andamentos (Seção 8): o que a equipe registrou do processo, na mesma linha
  // dos eventos que o monitor observou. Registrado à mão, e assinado.
  const [andamentos, setAndamentos] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [novo, setNovo] = useState({ tipo: 'esclarecimento', texto: '', ocorrido_em: '' });
  const [erroAndamentos, setErroAndamentos] = useState(null);

  const carregar = () =>
    Promise.all([
      api.linhaDoTempo(id),
      // Sem andamentos (plano sem gestão, falha) a linha do tempo do monitor
      // continua; a tela diz por que os andamentos não aparecem.
      api.andamentos(id).then(
        (a) => {
          setErroAndamentos(null);
          return a;
        },
        (e) => {
          setErroAndamentos(e.message);
          return { dados: [], tipos: [] };
        }
      ),
    ])
      .then(([r, a]) => {
        setDados(r);
        setAndamentos(a.dados || []);
        setTipos(a.tipos || []);
        setErro(null);
      })
      .catch((e) => setErro(e.message));

  const apagarAndamento = async (andamentoId) => {
    if (!window.confirm('Apagar este andamento?')) return;
    try {
      await api.apagarAndamento(andamentoId);
      await carregar();
    } catch (e) {
      setErro(e.message);
    }
  };

  const registrar = async (e) => {
    e.preventDefault();
    if (!novo.texto.trim()) return;
    setOcupado('andamento');
    try {
      // datetime-local é a hora de quem digita; vai ao backend como instante.
      const ocorrido = novo.ocorrido_em ? new Date(novo.ocorrido_em).toISOString() : '';
      await api.registrarAndamento({ ...novo, ocorrido_em: ocorrido, licitacao_id: id });
      setNovo((n) => ({ ...n, texto: '', ocorrido_em: '' }));
      await carregar();
    } catch (e2) {
      setErro(e2.message);
    } finally {
      setOcupado(null);
    }
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const acao = async (qual) => {
    setOcupado(qual);
    setAviso(null);
    try {
      const r = await api.monitorar(id, qual);
      setAviso(r.mensagem);
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(null);
    }
  };

  if (erro && !dados) return <p className="text-sm text-erro">{erro}</p>;
  if (!dados) return <Loader2 size={16} className="animate-spin text-texto-suave" />;

  const m = dados.monitoramento;
  const vigiando = m && m.ativo;

  // A publicação não é um evento gravado: é o nascimento da licitação na base,
  // e a linha do tempo começa por ela para não abrir no vazio.
  const linhas = [
    {
      id: 'publicacao',
      tipo: 'publicacao',
      descricao: 'Licitação entrou no painel pela coleta.',
      ocorrido_em: dados.licitacao.criado_em,
    },
    ...dados.eventos,
    ...andamentos.map((a) => ({
      id: `andamento-${a.id}`,
      tipo: 'andamento',
      descricao: `${(tipos.find((t) => t.chave === a.tipo) || {}).rotulo || a.tipo}: ${a.texto}`,
      ocorrido_em: a.ocorrido_em,
      autor: a.autor_nome,
      andamentoId: a.id,
    })),
  ].sort((x, y) => new Date(x.ocorrido_em) - new Date(y.ocorrido_em));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs flex items-center gap-1.5 ${vigiando ? 'text-voltagem' : 'text-texto-suave'}`}>
          {vigiando ? <Eye size={13} /> : <EyeOff size={13} />}
          {vigiando
            ? `vigiando · ${m.checagens} checagem(ns) · próxima ${dataHora(m.proxima_checagem)}`
            : 'não está sendo vigiada'}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            className="botao flex items-center gap-1"
            onClick={() => acao('checar')}
            disabled={Boolean(ocupado)}
            title="Vai ao portal agora, sem esperar a cadência"
          >
            {ocupado === 'checar' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCcw size={12} />}
            checar agora
          </button>
          <button
            className={vigiando ? 'botao' : 'botao-primario'}
            onClick={() => acao(vigiando ? 'desligar' : 'ligar')}
            disabled={Boolean(ocupado)}
          >
            {vigiando ? 'parar de vigiar' : 'vigiar'}
          </button>
        </div>
      </div>

      {m && m.ultimo_erro && (
        <p className="text-xs text-atencao">Última checagem falhou: {m.ultimo_erro}</p>
      )}
      {erro && <p className="text-xs text-erro">{erro}</p>}
      {aviso && (
        <p className="px-3 py-2 text-xs border border-borda bg-superficie rounded text-texto-suave">{aviso}</p>
      )}

      {dados.licitacao.reaberta_como && (
        <p className="px-3 py-2 text-xs border border-atencao/40 text-atencao rounded bg-atencao/5">
          O órgão reabriu este objeto na licitação {dados.licitacao.reaberta_como}.
        </p>
      )}

      {erroAndamentos && <p className="text-xs text-atencao">Andamentos indisponíveis: {erroAndamentos}</p>}
      {!erroAndamentos && tipos.length > 0 && (
      <form onSubmit={registrar} className="flex flex-wrap gap-2 items-center">
        <select
          className="campo-caixa"
          aria-label="Tipo de andamento"
          value={novo.tipo}
          onChange={(e) => setNovo({ ...novo, tipo: e.target.value })}
        >
          {tipos.map((t) => (
            <option key={t.chave} value={t.chave}>{t.rotulo}</option>
          ))}
        </select>
        <input
          className="campo-caixa flex-1 min-w-[12rem]"
          placeholder="adicionar andamento (ex.: órgão respondeu o esclarecimento)"
          aria-label="Andamento"
          value={novo.texto}
          onChange={(e) => setNovo({ ...novo, texto: e.target.value })}
        />
        <input
          type="datetime-local"
          className="campo-caixa"
          aria-label="Quando aconteceu (vazio = agora)"
          title="Quando aconteceu (vazio = agora)"
          value={novo.ocorrido_em}
          onChange={(e) => setNovo({ ...novo, ocorrido_em: e.target.value })}
        />
        <button className="botao-primario flex items-center gap-1" disabled={Boolean(ocupado)}>
          {ocupado === 'andamento' ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Adicionar
        </button>
      </form>
      )}

      <ul className="space-y-0">
        {linhas.map((e, i) => {
          const Icone = ICONES[e.tipo] || Flag;
          const ultimo = i === linhas.length - 1;
          return (
            <li key={e.id} className="flex gap-3">
              <div className="flex flex-col items-center shrink-0">
                <span className={`mt-0.5 ${CORES[e.tipo] || 'text-texto-suave'}`}>
                  <Icone size={14} />
                </span>
                {!ultimo && <span className="flex-1 w-px bg-borda my-1" />}
              </div>
              <div className={`pb-4 ${ultimo ? 'pb-0' : ''}`}>
                <p className={`text-sm ${CORES[e.tipo] || ''}`}>
                  {e.tipo === 'edital_alterado' && (
                    <AlertTriangle size={12} className="inline mr-1 -translate-y-px" />
                  )}
                  {e.descricao}
                </p>
                <p className="text-[11px] text-texto-suave">
                  {dataHora(e.ocorrido_em)}
                  {e.autor ? ` · ${e.autor}` : ''}
                  {e.andamentoId && (
                    <button
                      type="button"
                      className="ml-2 align-middle hover:text-erro"
                      aria-label="Apagar andamento"
                      title="Apagar andamento (só quem registrou ou um administrador)"
                      onClick={() => apagarAndamento(e.andamentoId)}
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </p>
                {e.dados && <Detalhes dados={e.dados} />}
              </div>
            </li>
          );
        })}
      </ul>

      {dados.eventos.length === 0 && andamentos.length === 0 && (
        <p className="text-sm text-texto-suave">
          Nenhuma mudança observada ainda. O painel compara a lista de arquivos e as datas a cada checagem;
          se o edital mudar, aparece aqui e o alerta sai em vermelho.
        </p>
      )}
    </div>
  );
}

/** O que mudou, em miúdos — só quando há o que mostrar. */
function Detalhes({ dados }) {
  const listas = [
    ['novos', 'arquivo novo'],
    ['trocados', 'substituído'],
    ['sumidos', 'removido do portal'],
  ].filter(([chave]) => Array.isArray(dados[chave]) && dados[chave].length);

  if (!listas.length) return null;

  return (
    <ul className="mt-1 space-y-0.5">
      {listas.map(([chave, rotulo]) =>
        dados[chave].map((a) => (
          <li key={`${chave}-${a.sequencial}`} className="text-[11px] text-texto-suave">
            · {a.titulo || `documento ${a.sequencial}`} <span className="opacity-70">({rotulo})</span>
          </li>
        ))
      )}
    </ul>
  );
}
