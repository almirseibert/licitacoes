import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ExternalLink, Gavel, LayoutGrid, List, Loader2, RefreshCw, Star, Download, FileSpreadsheet, Trash2,
} from 'lucide-react';
import { api } from '../servicos/api';
import { moeda, dataHora, resumir, faixaPontuacao } from '../servicos/formato';
import Anel from '../componentes/Anel';
import Contagem from '../componentes/Contagem';
import Filtros, { BotaoFiltros, usePainelFiltros } from '../componentes/Filtros';
import { Etiquetas, ExpansaoDoCartao, linkDoPortal, PesquisasSalvas, SaidasDoRadar } from '../componentes/RadarExtras';
import Detalhe from './Detalhe';
import PorMim from '../componentes/PorMim';

const CHAVE_FILTROS = 'licitacoes.filtros';

const FILTROS_PADRAO = {
  busca: '',
  grupo: '',
  uf: '',
  modalidade: '',
  pontuacao_min: 30,
  prazo_dias: '',
  valor_max: '',
  exclusivo_me: '',
  novas_24h: '',
  favorito: '',
  // Seção 8: "por mim / por todos" e as listas do trabalho.
  por: 'todos',
  lista: '',
  em_aberto: '1',
  ordem: 'relevancia',
  pagina: 1,
  por_pagina: 20,
  // Versão 2 = Seção 7 (20 por página). Filtro salvo antes disso volta a 20 uma vez.
  versao: 2,
};

function lerFiltrosSalvos() {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE_FILTROS) || 'null');
    if (salvo && salvo.versao !== 2) Object.assign(salvo, { por_pagina: 20, versao: 2 });
    return salvo ? { ...FILTROS_PADRAO, ...salvo, pagina: 1 } : FILTROS_PADRAO;
  } catch {
    return FILTROS_PADRAO;
  }
}

export default function Radar({ abrir = null, aoAbrir = null, aoIr = null, filtroInicial = null }) {
  const [filtros, setFiltros] = useState(lerFiltrosSalvos);
  const [opcoes, setOpcoes] = useState({});
  const [resumo, setResumo] = useState(null);
  const [dados, setDados] = useState([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [visao, setVisao] = useState(() => localStorage.getItem('licitacoes.visao') || 'tabela');
  const [aberta, setAberta] = useState(null);
  const [painelAberto, alternarPainel] = usePainelFiltros();

  // O sino de alertas e o funil pedem para abrir uma licitação específica.
  useEffect(() => {
    if (abrir) setAberta(abrir);
  }, [abrir]);

  // O Dashboard manda um filtro pronto (mapa por UF, listas do card de
  // gestão): substitui a busca salva, com "em aberto" e nota mínima
  // liberados — são recortes explícitos, a tela não deve escondê-los de
  // novo pelos padrões do Radar livre.
  useEffect(() => {
    if (!filtroInicial || Object.keys(filtroInicial).length === 0) return;
    setFiltros((f) => ({ ...f, em_aberto: '', pontuacao_min: 0, uf: '', lista: '', etapa: '', ...filtroInicial, pagina: 1 }));
  }, [filtroInicial]);
  const [coletando, setColetando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [avisosFiltro, setAvisosFiltro] = useState([]);

  useEffect(() => {
    localStorage.setItem(CHAVE_FILTROS, JSON.stringify(filtros));
  }, [filtros]);

  useEffect(() => {
    localStorage.setItem('licitacoes.visao', visao);
  }, [visao]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [lista, resumoNovo] = await Promise.all([api.licitacoes(filtros), api.resumo()]);
      setDados(lista.dados);
      setTotal(lista.total);
      setAvisosFiltro(lista.avisos || []);
      setResumo(resumoNovo);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, [filtros]);

  useEffect(() => {
    const atraso = setTimeout(carregar, filtros.busca ? 350 : 0);
    return () => clearTimeout(atraso);
  }, [carregar, filtros.busca]);

  useEffect(() => {
    api.filtros().then(setOpcoes).catch(() => {});
  }, []);

  const paginas = Math.max(1, Math.ceil(total / (filtros.por_pagina || 20)));

  const alternarFavorito = async (licitacao) => {
    const novo = licitacao.favorito ? 0 : 1;
    setDados((atual) => atual.map((l) => (l.id === licitacao.id ? { ...l, favorito: novo } : l)));
    try {
      await api.atualizarLicitacao(licitacao.id, { favorito: Boolean(novo) });
    } catch (e) {
      setAviso(e.message);
      setDados((atual) => atual.map((l) => (l.id === licitacao.id ? { ...l, favorito: licitacao.favorito } : l)));
    }
  };

  // Descarte rápido do Radar (seção 10): um clique, sem perguntar motivo — usa
  // o motivo coringa "outro" para a licitação continuar valendo no ranking de
  // bloqueios (seção 20) e aparecer certo no Funil, em vez de ficar sem motivo.
  const descartar = async (licitacao) => {
    setDados((atual) => atual.filter((l) => l.id !== licitacao.id));
    try {
      await api.atualizarLicitacao(licitacao.id, { etapa: 'Descartada', motivo_descarte: 'outro' });
    } catch (e) {
      setAviso(e.message);
      setDados((atual) => {
        if (atual.some((l) => l.id === licitacao.id)) return atual;
        return [...atual, licitacao];
      });
    }
  };

  // Exporta exatamente o que está na tela: os mesmos filtros, a mesma
  // ordenação. Exportar coisa diferente do que se vê seria a pior armadilha
  // possível aqui.
  const exportar = useCallback(async () => {
    setExportando(true);
    setAviso(null);
    try {
      await api.exportarRadar({ ...filtros, pagina: undefined, por_pagina: undefined });
    } catch (e) {
      setAviso(e.message);
    } finally {
      setExportando(false);
    }
  }, [filtros]);

  const coletarAgora = async () => {
    setColetando(true);
    setAviso(null);
    try {
      const r = await api.coletarTudo(true);
      setAviso(r.mensagem || 'Coleta enfileirada. O worker vai processar em instantes.');
    } catch (e) {
      setAviso(e.message);
    } finally {
      setColetando(false);
    }
  };

  const cabecalho = useMemo(
    () => (
      <div className="px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-borda">
        <h1 className="font-titulo text-xl">Radar</h1>
        {resumo && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-texto-suave">
            <Numero rotulo="em aberto" valor={resumo.total} />
            <Numero rotulo="novas 24 h" valor={resumo.novas_24h} />
            <Numero rotulo="prioridade alta" valor={resumo.prioridade_alta} destaque />
            <Numero rotulo="fecham em 48 h" valor={resumo.fecham_48h} />
            <Numero rotulo="exclusivas ME/EPP" valor={resumo.exclusivas_me} />
            <span className="font-mono">{moeda(resumo.valor_em_jogo)} em jogo</span>
            <span>última coleta: {dataHora(resumo.ultima_coleta)}</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <PorMim valor={filtros.por} aoMudar={(por) => setFiltros({ ...filtros, por, pagina: 1 })} />
          <select
            className="campo-caixa text-xs"
            aria-label="Lista"
            value={filtros.lista}
            // Favoritas, gerenciadas e finalizadas são escolha da equipe: a
            // nota mínima e o "em aberto" esconderiam justamente o que se pediu.
            onChange={(e) =>
              setFiltros({
                ...filtros,
                lista: e.target.value,
                ...(e.target.value ? { pontuacao_min: 0, em_aberto: '' } : {}),
                pagina: 1,
              })
            }
          >
            <option value="">todas as listas</option>
            <option value="favoritas">favoritas</option>
            <option value="gerenciadas">gerenciadas</option>
            <option value="finalizadas">finalizadas</option>
          </select>
          <BotaoFiltros valores={filtros} aberto={painelAberto} onAlternar={alternarPainel} />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setVisao(visao === 'tabela' ? 'cards' : 'tabela')}
            className="p-1.5 rounded border border-borda text-texto-suave hover:text-texto"
            title={visao === 'tabela' ? 'Ver como cards' : 'Ver como tabela'}
          >
            {visao === 'tabela' ? <LayoutGrid size={14} /> : <List size={14} />}
          </button>
          <button
            onClick={carregar}
            className="p-1.5 rounded border border-borda text-texto-suave hover:text-texto"
            title="Recarregar"
          >
            <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} />
          </button>
          <PesquisasSalvas
            filtros={filtros}
            onAplicar={(salvos) => setFiltros({ ...FILTROS_PADRAO, ...salvos, pagina: 1, por_pagina: filtros.por_pagina })}
            onAviso={setAviso}
          />
          <button
            onClick={exportar}
            disabled={exportando}
            className="p-1.5 rounded border border-borda text-texto-suave hover:text-texto disabled:opacity-60"
            title="Baixar esta lista em Excel, com os filtros que estão aplicados"
          >
            {exportando ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
          </button>
          <SaidasDoRadar filtros={filtros} onAviso={setAviso} />
          <button
            onClick={coletarAgora}
            disabled={coletando}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-voltagem text-obsidiana font-medium hover:brightness-110 disabled:opacity-60"
          >
            {coletando ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            Coletar agora
          </button>
        </div>
      </div>
    ),
    [resumo, visao, carregando, coletando, carregar, exportar, exportando, filtros, painelAberto, alternarPainel]
  );

  return (
    <div className="flex flex-col h-full">
      {cabecalho}
      <Filtros
        valores={filtros}
        opcoes={opcoes}
        onMudar={setFiltros}
        onLimpar={() => setFiltros(FILTROS_PADRAO)}
        painelAberto={painelAberto}
      />

      {avisosFiltro.map((a) => (
        <div key={a} className="mx-4 mt-3 px-3 py-2 text-xs border border-atencao/40 bg-superficie rounded text-atencao">{a}</div>
      ))}

      {aviso && (
        <div className="mx-4 mt-3 px-3 py-2 text-xs border border-borda bg-superficie rounded text-texto-suave">
          {aviso}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {erro && (
          <p className="m-4 text-sm text-erro">
            {erro}
          </p>
        )}

        {!erro && !carregando && dados.length === 0 && (
          <div className="m-4 p-6 border border-borda rounded bg-superficie text-sm text-texto-suave">
            <p className="mb-2 text-texto">Nenhuma licitação com esses filtros.</p>
            <p>
              Se o painel acabou de subir, rode <span className="font-mono">Coletar agora</span> e aguarde o worker
              processar a fila. A primeira varredura do PNCP leva alguns minutos.
            </p>
          </div>
        )}

        {dados.length > 0 && visao === 'tabela' && (
          <Tabela dados={dados} onAbrir={setAberta} onFavorito={alternarFavorito} onDescartar={descartar} />
        )}

        {dados.length > 0 && visao === 'cards' && (
          <div className="p-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {dados.map((l) => (
              <Card key={l.id} licitacao={l} onAbrir={setAberta} onFavorito={alternarFavorito} onDescartar={descartar} />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-borda px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-texto-suave imprimir-oculto">
        <span className="font-mono">
          {total} licitaç{total === 1 ? 'ão' : 'ões'} · página {filtros.pagina} de {paginas}
        </span>
        <div className="flex items-center gap-2">
          <select
            aria-label="Resultados por página"
            value={filtros.por_pagina || 20}
            onChange={(e) => setFiltros({ ...filtros, por_pagina: Number(e.target.value), pagina: 1 })}
            className="bg-superficie border border-borda rounded px-1 py-1"
          >
            {[20, 50, 100].map((n) => <option key={n} value={n}>{n} por página</option>)}
          </select>
          <button
            disabled={filtros.pagina <= 1}
            onClick={() => setFiltros({ ...filtros, pagina: filtros.pagina - 1 })}
            className="px-2 py-1 border border-borda rounded disabled:opacity-40 hover:text-texto"
          >
            anterior
          </button>
          <label className="flex items-center gap-1">
            ir para
            <input
              type="number"
              min={1}
              max={paginas}
              aria-label="Página"
              key={filtros.pagina}
              defaultValue={filtros.pagina}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const n = Math.min(Math.max(Number(e.target.value) || 1, 1), paginas);
                setFiltros({ ...filtros, pagina: n });
              }}
              className="w-14 bg-superficie border border-borda rounded px-1 py-1 font-mono"
            />
          </label>
          <button
            disabled={filtros.pagina >= paginas}
            onClick={() => setFiltros({ ...filtros, pagina: filtros.pagina + 1 })}
            className="px-2 py-1 border border-borda rounded disabled:opacity-40 hover:text-texto"
          >
            próxima
          </button>
        </div>
      </div>

      {aberta && (
        <Detalhe
          id={aberta}
          aoIr={aoIr}
          onFechar={() => {
            setAberta(null);
            if (aoAbrir) aoAbrir(null);
          }}
        />
      )}
    </div>
  );
}

function Numero({ rotulo, valor, destaque }) {
  return (
    <span className="flex items-baseline gap-1">
      <strong className={`font-mono text-sm ${destaque ? 'text-voltagem' : 'text-texto'}`}>{valor ?? 0}</strong>
      {rotulo}
    </span>
  );
}

function SeloBeneficio({ valor }) {
  if (!valor || valor === 'nenhum') return null;
  const texto = valor === 'exclusivo' ? 'ME/EPP exclusivo' : 'cota ME/EPP';
  return (
    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 border border-ok/40 text-ok rounded">
      {texto}
    </span>
  );
}

// Um par rótulo/valor da tabela do Radar: rótulo pequeno em cima, valor
// cortado com "..." (o texto inteiro fica no title).
function Dado({ rotulo, titulo, linhas = 1, children }) {
  return (
    <div className="leading-tight mb-1 last:mb-0">
      <div className="text-[9px] uppercase tracking-wide text-texto-suave/70">{rotulo}</div>
      <div className={`text-xs text-texto-suave break-words ${linhas > 1 ? 'line-clamp-2' : 'truncate'}`} title={titulo}>
        {children}
      </div>
    </div>
  );
}

function Tabela({ dados, onAbrir, onFavorito, onDescartar }) {
  return (
    <table className="w-full text-sm tabela-densa table-fixed">
      <thead>
        <tr>
          <th className="w-12">Pont.</th>
          <th>Objeto</th>
          {/* Os seis dados em 2 colunas × 3 linhas, rótulo em cima de cada
              valor — o Objeto fica com a largura que sobra. */}
          <th className="w-52"></th>
          <th className="w-36"></th>
          <th className="w-20"></th>
        </tr>
      </thead>
      <tbody>
        {dados.map((l) => {
          return (
            <tr key={l.id} className="cursor-pointer" onClick={() => onAbrir(l.id)}>
              <td><Anel pontuacao={l.pontuacao} tamanho={30} /></td>
              <td className="overflow-hidden">
                <div className="flex items-start gap-2">
                  <span className="text-texto leading-snug line-clamp-4 break-words" title={l.objeto}>
                    {l.objeto}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                  <Etiquetas licitacao={l} />
                  {l.grupo && <span className="text-[10px] text-texto-suave">{l.grupo}</span>}
                  <SeloBeneficio valor={l.beneficio_me} />
                  {l.orcamento_sigiloso === 1 && (
                    <span className="text-[10px] text-atencao">orçamento sigiloso</span>
                  )}
                </div>
              </td>
              <td className="align-top overflow-hidden">
                <Dado rotulo="Órgão" titulo={l.orgao_nome} linhas={2}>{l.orgao_nome || '—'}</Dado>
                <Dado rotulo="Cidade/UF">{l.municipio ? `${l.municipio}/${l.uf || ''}` : l.uf || '—'}</Dado>
                <Dado rotulo="Modalidade" titulo={l.modalidade}>{l.modalidade || '—'}</Dado>
              </td>
              <td className="align-top overflow-hidden">
                <Dado rotulo="Valor"><span className="font-mono text-texto">{moeda(l.valor_estimado)}</span></Dado>
                <Dado rotulo="Fecha em"><Contagem fim={l.fim_propostas} /></Dado>
                <Dado rotulo="Plataforma" titulo={l.plataforma_disputa}>{l.plataforma_disputa || '—'}</Dado>
              </td>
              <td>
                <div className="flex items-center gap-1.5 justify-end" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => onFavorito(l)}
                    title={l.favorito ? 'Remover dos favoritos' : 'Favoritar'}
                    className={l.favorito ? 'text-atencao' : 'text-texto-suave hover:text-texto'}
                  >
                    <Star size={14} fill={l.favorito ? 'currentColor' : 'none'} />
                  </button>
                  <a
                    href={linkDoPortal(l) || undefined}
                    target="_blank"
                    rel="noreferrer"
                    title="Abrir no portal"
                    className="text-texto-suave hover:text-texto"
                  >
                    <ExternalLink size={14} />
                  </a>
                  <button
                    onClick={() => onDescartar(l)}
                    title="Descartar — não interessa"
                    className="text-texto-suave hover:text-erro"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Estado da documentação no card (seção 7.3): quem já tem edital na mão. */
function SeloDocumentos({ status }) {
  const estados = {
    na_fila: ['na fila', 'text-texto-suave'],
    baixando: ['baixando', 'text-texto-suave'],
    ok: ['edital baixado', 'text-ok'],
    parcial: ['edital parcial', 'text-atencao'],
    sem_arquivo: ['sem arquivo', 'text-texto-suave'],
    grande_demais: ['acima de 300 MB', 'text-atencao'],
  };
  const estado = estados[status];
  if (!estado) return null;
  return <span className={`text-[10px] uppercase tracking-wide ${estado[1]}`}>· {estado[0]}</span>;
}

function Card({ licitacao: l, onAbrir, onFavorito, onDescartar }) {
  const faixa = faixaPontuacao(l.pontuacao);
  return (
    <div
      onClick={() => onAbrir(l.id)}
      className="border border-borda bg-superficie rounded p-3 cursor-pointer hover:border-texto-suave/40 transition-colors"
    >
      <div className="flex items-start gap-3">
        <Anel pontuacao={l.pontuacao} />
        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug">{resumir(l.objeto, 140)}</p>
          <p className="text-xs text-texto-suave mt-1">{resumir(l.orgao_nome, 50)}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); onFavorito(l); }}
            title={l.favorito ? 'Remover dos favoritos' : 'Favoritar'}
            className={l.favorito ? 'text-atencao' : 'text-texto-suave hover:text-texto'}
          >
            <Star size={14} fill={l.favorito ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDescartar(l); }}
            title="Descartar — não interessa"
            className="text-texto-suave hover:text-erro"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-y-1 text-xs text-texto-suave">
        <span>{l.municipio ? `${l.municipio}/${l.uf || ''}` : l.uf || '—'}</span>
        <span className="text-right font-mono text-texto">{moeda(l.valor_estimado)}</span>
        <span className="flex items-center gap-1"><Gavel size={11} /> {resumir(l.modalidade, 24)}</span>
        <span className="text-right"><Contagem fim={l.fim_propostas} /></span>
      </div>

      <div className="mt-2"><Etiquetas licitacao={l} /></div>

      <div className="mt-2 flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide" style={{ color: faixa.cor }}>{faixa.rotulo}</span>
        <SeloBeneficio valor={l.beneficio_me} />
        <SeloDocumentos status={l.arquivos_status} />
        <a
          href={linkDoPortal(l) || undefined}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="ml-auto text-texto-suave hover:text-texto flex items-center gap-1 text-[11px]"
        >
          abrir no portal <ExternalLink size={11} />
        </a>
      </div>

      <ExpansaoDoCartao licitacao={l} />
    </div>
  );
}
