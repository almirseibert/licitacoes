import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ExternalLink, Gavel, LayoutGrid, List, Loader2, RefreshCw, Star, Download, FileSpreadsheet,
} from 'lucide-react';
import { api } from '../servicos/api';
import { moeda, dataHora, resumir, faixaPontuacao } from '../servicos/formato';
import Anel from '../componentes/Anel';
import Contagem from '../componentes/Contagem';
import Filtros from '../componentes/Filtros';
import { Etiquetas, ExpansaoDoCartao, linkDoPortal, PesquisasSalvas, SaidasDoRadar } from '../componentes/RadarExtras';
import Detalhe from './Detalhe';

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

export default function Radar({ abrir = null, aoAbrir = null }) {
  const [filtros, setFiltros] = useState(lerFiltrosSalvos);
  const [opcoes, setOpcoes] = useState({});
  const [resumo, setResumo] = useState(null);
  const [dados, setDados] = useState([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [visao, setVisao] = useState(() => localStorage.getItem('licitacoes.visao') || 'tabela');
  const [aberta, setAberta] = useState(null);

  // O sino de alertas e o funil pedem para abrir uma licitação específica.
  useEffect(() => {
    if (abrir) setAberta(abrir);
  }, [abrir]);
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
    [resumo, visao, carregando, coletando, carregar, exportar, exportando, filtros]
  );

  return (
    <div className="flex flex-col h-full">
      {cabecalho}
      <Filtros
        valores={filtros}
        opcoes={opcoes}
        onMudar={setFiltros}
        onLimpar={() => setFiltros(FILTROS_PADRAO)}
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
          <Tabela dados={dados} onAbrir={setAberta} onFavorito={alternarFavorito} />
        )}

        {dados.length > 0 && visao === 'cards' && (
          <div className="p-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {dados.map((l) => (
              <Card key={l.id} licitacao={l} onAbrir={setAberta} onFavorito={alternarFavorito} />
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

function Tabela({ dados, onAbrir, onFavorito }) {
  return (
    <table className="w-full text-sm tabela-densa">
      <thead>
        <tr>
          <th className="w-12">Pont.</th>
          <th>Objeto</th>
          <th className="w-48">Órgão</th>
          <th className="w-24">Cidade/UF</th>
          <th className="w-32">Modalidade</th>
          <th className="w-28 text-right">Valor</th>
          <th className="w-24">Fecha em</th>
          <th className="w-28">Plataforma</th>
          <th className="w-16"></th>
        </tr>
      </thead>
      <tbody>
        {dados.map((l) => {
          return (
            <tr key={l.id} className="cursor-pointer" onClick={() => onAbrir(l.id)}>
              <td><Anel pontuacao={l.pontuacao} tamanho={34} /></td>
              <td>
                <div className="flex items-start gap-2">
                  <span className="text-texto leading-snug">{resumir(l.objeto, 150)}</span>
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
              <td className="text-texto-suave text-xs">{resumir(l.orgao_nome, 60)}</td>
              <td className="text-texto-suave text-xs">
                {l.municipio ? `${l.municipio}/${l.uf || ''}` : l.uf || '—'}
              </td>
              <td className="text-texto-suave text-xs">{l.modalidade || '—'}</td>
              <td className="text-right font-mono text-xs">{moeda(l.valor_estimado)}</td>
              <td><Contagem fim={l.fim_propostas} /></td>
              <td className="text-texto-suave text-xs">{resumir(l.plataforma_disputa, 22)}</td>
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

function Card({ licitacao: l, onAbrir, onFavorito }) {
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
        <button
          onClick={(e) => { e.stopPropagation(); onFavorito(l); }}
          className={l.favorito ? 'text-atencao' : 'text-texto-suave hover:text-texto'}
        >
          <Star size={14} fill={l.favorito ? 'currentColor' : 'none'} />
        </button>
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
