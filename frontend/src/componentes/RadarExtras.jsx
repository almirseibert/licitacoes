import { useEffect, useRef, useState } from 'react';
import { Bookmark, Copy, FileText, Link2, Loader2, Mic, MicOff, Printer, Trash2, X } from 'lucide-react';
import { api } from '../servicos/api';
import { dataHora, moeda } from '../servicos/formato';

const botao = 'p-1.5 rounded border border-borda text-texto-suave hover:text-texto disabled:opacity-60';
const LACUNA = '____________';

// Campos da tela que não são filtro: não vão para a pesquisa salva nem para o link.
const SO_DA_TELA = ['pagina', 'por_pagina', 'versao'];

/** Só http(s): link coletado de portal de terceiro pode vir como `javascript:`. */
function linkSeguro(url) {
  return /^https?:\/\//i.test(String(url || '')) ? url : null;
}

/** O link do portal da licitação (disputa ou página do PNCP), só se for http(s). */
export function linkDoPortal(l) {
  return linkSeguro(l.link_disputa) || linkSeguro(l.link_portal);
}

export function soFiltros(filtros) {
  return Object.fromEntries(Object.entries(filtros).filter(([k, v]) => !SO_DA_TELA.includes(k) && v !== '' && v !== null && v !== undefined));
}

/** Etiquetas de situação calculadas pelo backend na leitura (Seção 7). */
export function Etiquetas({ licitacao: l }) {
  const lista = l.etiquetas || [];
  if (!lista.length && !l.exige_garantia) return null;
  const tom = {
    vence_hoje: 'border-erro/50 text-erro',
    urgente: 'border-atencao/50 text-atencao',
    suspensa: 'border-atencao/50 text-atencao',
    revogada: 'border-erro/50 text-erro',
    prorrogada: 'border-atencao/40 text-atencao',
    adiada: 'border-atencao/40 text-atencao',
  };
  return (
    <span className="inline-flex flex-wrap gap-1">
      {lista.map((e) => (
        <span key={e.chave} className={`text-[10px] uppercase tracking-wide px-1 rounded border ${tom[e.chave] || 'border-borda text-texto-suave'}`}>
          {e.rotulo}
        </span>
      ))}
      {l.exige_garantia && (
        <span className="text-[10px] uppercase tracking-wide px-1 rounded border border-atencao/50 text-atencao" title="O edital lido pede garantia contratual (seguro garantia, caução ou fiança).">
          exige garantia
        </span>
      )}
    </span>
  );
}

/** Pesquisas salvas do Radar: aplicar, salvar a atual, apagar. */
export function PesquisasSalvas({ filtros, onAplicar, onAviso }) {
  const [aberto, setAberto] = useState(false);
  const [lista, setLista] = useState([]);
  const [nome, setNome] = useState('');

  const carregar = () => api.pesquisas().then((r) => setLista(r.dados)).catch((e) => onAviso(e.message));
  useEffect(() => {
    if (aberto) carregar();
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  const salvar = async (e) => {
    e.preventDefault();
    try {
      await api.salvarPesquisa(nome, soFiltros(filtros));
      setNome('');
      onAviso(`Pesquisa "${nome}" salva.`);
      carregar();
    } catch (erro) {
      onAviso(erro.message);
    }
  };

  const apagar = async (p) => {
    if (!window.confirm(`Apagar a pesquisa "${p.nome}"?`)) return;
    try {
      await api.apagarPesquisa(p.id);
      carregar();
    } catch (erro) {
      onAviso(erro.message);
    }
  };

  return (
    <div className="relative">
      <button onClick={() => setAberto(!aberto)} className={botao} title="Pesquisas salvas" aria-expanded={aberto}>
        <Bookmark size={14} />
      </button>
      {aberto && (
        <div className="absolute right-0 z-30 mt-1 w-72 bg-superficie border border-borda rounded shadow p-3 text-sm">
          <p className="text-[11px] uppercase tracking-wide text-texto-suave mb-2">Pesquisas salvas</p>
          {lista.length === 0 && <p className="text-xs text-texto-suave mb-2">Nenhuma ainda.</p>}
          <ul className="mb-3 max-h-56 overflow-auto">
            {lista.map((p) => (
              <li key={p.id} className="flex items-center gap-2 py-1">
                <button
                  className="flex-1 text-left hover:text-voltagem truncate"
                  onClick={() => {
                    onAplicar(p.filtros);
                    setAberto(false);
                  }}
                >
                  {p.nome}
                </button>
                <button onClick={() => apagar(p)} className="text-texto-suave hover:text-erro" title="Apagar" aria-label={`Apagar ${p.nome}`}>
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={salvar} className="flex gap-1">
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome para os filtros atuais"
              maxLength={80}
              className="flex-1 bg-obsidiana border border-borda rounded px-2 py-1 text-xs"
            />
            <button disabled={!nome.trim()} className="text-xs px-2 rounded bg-voltagem text-obsidiana disabled:opacity-50">
              salvar
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/** Exportar em Word, imprimir e compartilhar por link com validade. */
export function SaidasDoRadar({ filtros, onAviso }) {
  const [gerando, setGerando] = useState(false);
  const [compartilhar, setCompartilhar] = useState(false);

  const word = async () => {
    setGerando(true);
    try {
      await api.exportarRadar(soFiltros(filtros), 'docx');
    } catch (e) {
      onAviso(e.message);
    } finally {
      setGerando(false);
    }
  };

  return (
    <>
      <button onClick={word} disabled={gerando} className={botao} title="Baixar esta lista em Word (.docx)">
        {gerando ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
      </button>
      <button onClick={() => window.print()} className={botao} title="Imprimir esta página da lista">
        <Printer size={14} />
      </button>
      <button onClick={() => setCompartilhar(true)} className={botao} title="Compartilhar por link de leitura">
        <Link2 size={14} />
      </button>
      {compartilhar && <Compartilhar filtros={filtros} onFechar={() => setCompartilhar(false)} />}
    </>
  );
}

function Compartilhar({ filtros, onFechar }) {
  const [dias, setDias] = useState(7);
  const [nome, setNome] = useState('');
  const [link, setLink] = useState(null);
  const [erro, setErro] = useState(null);
  const [links, setLinks] = useState([]);

  const carregar = () => api.compartilhados().then((r) => setLinks(r.dados.filter((l) => l.valido))).catch(() => {});
  useEffect(() => {
    carregar();
  }, []);

  const criar = async () => {
    setErro(null);
    try {
      const r = await api.compartilharRadar(soFiltros(filtros), dias, nome);
      setLink({ ...r, url: `${window.location.origin}${r.caminho}` });
      carregar();
    } catch (e) {
      setErro(e.message);
    }
  };

  const revogar = async (id) => {
    await api.revogarLink(id).catch((e) => setErro(e.message));
    carregar();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onFechar}>
      <div role="dialog" aria-label="Compartilhar lista" className="w-full max-w-md bg-superficie border border-borda rounded p-4 text-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center mb-3">
          <h2 className="font-titulo text-base">Compartilhar esta lista</h2>
          <button onClick={onFechar} className="ml-auto text-texto-suave hover:text-texto" aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-texto-suave mb-3">
          Quem tiver o link vê a lista com os filtros atuais, só leitura e sem login: objeto, órgão, valor e prazo.
          Pontuação, etapa, preço e anotações da sua equipe não vão junto.
        </p>
        {!link ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex-1 min-w-[10rem]">
              <span className="block text-[11px] uppercase tracking-wide text-texto-suave mb-1">Nome (opcional)</span>
              <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} className="w-full bg-obsidiana border border-borda rounded px-2 py-1" />
            </label>
            <label>
              <span className="block text-[11px] uppercase tracking-wide text-texto-suave mb-1">Vale por</span>
              <select value={dias} onChange={(e) => setDias(Number(e.target.value))} className="bg-obsidiana border border-borda rounded px-2 py-1">
                {[1, 3, 7, 15, 30].map((d) => <option key={d} value={d}>{d} dia{d > 1 ? 's' : ''}</option>)}
              </select>
            </label>
            <button onClick={criar} className="px-3 py-1.5 rounded bg-voltagem text-obsidiana font-medium">Gerar link</button>
          </div>
        ) : (
          <div>
            <div className="flex gap-1">
              <input readOnly value={link.url} className="flex-1 bg-obsidiana border border-borda rounded px-2 py-1 font-mono text-xs" onFocus={(e) => e.target.select()} />
              <button onClick={() => navigator.clipboard && navigator.clipboard.writeText(link.url)} className={botao} title="Copiar">
                <Copy size={14} />
              </button>
            </div>
            <p className="text-xs text-texto-suave mt-1">Vale até {dataHora(link.expira_em)}. Guarde agora: o link não é mostrado de novo.</p>
          </div>
        )}
        {erro && <p className="text-xs text-erro mt-2">{erro}</p>}
        {links.length > 0 && (
          <div className="mt-4">
            <p className="text-[11px] uppercase tracking-wide text-texto-suave mb-1">Links válidos</p>
            <ul className="max-h-40 overflow-auto">
              {links.map((l) => (
                <li key={l.id} className="flex items-center gap-2 py-0.5 text-xs">
                  <span className="flex-1 truncate">{l.nome || `link nº ${l.id}`}</span>
                  <span className="text-texto-suave">{l.acessos} acesso{l.acessos === 1 ? '' : 's'} · até {dataHora(l.expira_em)}</span>
                  <button onClick={() => revogar(l.id)} className="text-texto-suave hover:text-erro">revogar</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/** "Ver itens", "mais informações" e anotação com ditado, dentro do cartão. */
export function ExpansaoDoCartao({ licitacao: l }) {
  const [aba, setAba] = useState(null);
  const alternar = (nome) => (e) => {
    e.stopPropagation();
    setAba(aba === nome ? null : nome);
  };
  const classe = (nome) => `text-[11px] underline decoration-dotted ${aba === nome ? 'text-texto' : 'text-texto-suave hover:text-texto'}`;

  return (
    <div className="mt-2 imprimir-oculto" onClick={(e) => e.stopPropagation()}>
      <div className="flex gap-3">
        <button className={classe('itens')} onClick={alternar('itens')}>ver itens ({l.total_itens || 0})</button>
        <button className={classe('info')} onClick={alternar('info')}>mais informações</button>
        <button className={classe('nota')} onClick={alternar('nota')}>anotar</button>
      </div>
      {aba === 'itens' && <Itens id={l.id} />}
      {aba === 'info' && <MaisInformacoes id={l.id} />}
      {aba === 'nota' && <Anotacao id={l.id} />}
    </div>
  );
}

function Itens({ id }) {
  const [itens, setItens] = useState(null);
  const [erro, setErro] = useState(null);
  useEffect(() => {
    api.itensDaLicitacao(id).then((r) => setItens(r.dados)).catch((e) => setErro(e.message));
  }, [id]);
  if (erro) return <p className="text-xs text-erro mt-2">{erro}</p>;
  if (!itens) return <Loader2 size={12} className="animate-spin mt-2" />;
  if (!itens.length) return <p className="text-xs text-texto-suave mt-2">Os itens ainda não foram lidos do portal.</p>;
  return (
    <ul className="mt-2 max-h-48 overflow-auto text-xs divide-y divide-borda">
      {itens.map((i) => (
        <li key={i.id} className="py-1 flex gap-2">
          <span className="font-mono text-texto-suave w-6 shrink-0">{i.numero_item}</span>
          <span className="flex-1">{(i.descricao || '').slice(0, 160)}</span>
          <span className="font-mono shrink-0 text-right">
            {i.quantidade ? Number(i.quantidade).toLocaleString('pt-BR') : LACUNA} {i.unidade || ''}
            <br />
            {i.valor_total_estimado ? moeda(i.valor_total_estimado) : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

function MaisInformacoes({ id }) {
  const [l, setL] = useState(null);
  const [erro, setErro] = useState(null);
  useEffect(() => {
    api.licitacao(id).then(setL).catch((e) => setErro(e.message));
  }, [id]);
  if (erro) return <p className="text-xs text-erro mt-2">{erro}</p>;
  if (!l) return <Loader2 size={12} className="animate-spin mt-2" />;
  // Telefone e site do órgão não vêm do PNCP: a lacuna fica visível, nunca inventada.
  const linhas = [
    ['Nº do edital', l.numero_compra],
    ['Processo', l.processo],
    ['Unidade', l.unidade],
    ['Esfera', l.esfera],
    ['Situação', l.situacao],
    ['Abertura', l.abertura_propostas && dataHora(l.abertura_propostas)],
    ['Observação', l.informacao_complementar],
    ['Telefone', null],
    ['Site', linkDoPortal(l)],
  ];
  return (
    <dl className="mt-2 grid grid-cols-[7rem_1fr] gap-x-2 gap-y-0.5 text-xs">
      {linhas.map(([rotulo, valor]) => (
        <div key={rotulo} className="contents">
          <dt className="text-texto-suave">{rotulo}</dt>
          <dd className="break-words">
            {rotulo === 'Site' && valor ? <a href={valor} target="_blank" rel="noreferrer" className="underline">{valor}</a> : valor || LACUNA}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// Ditado pelo próprio navegador (Web Speech API). O painel não recebe áudio:
// só o texto que o navegador devolve entra na caixa.
const Reconhecimento = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

function Anotacao({ id }) {
  const [texto, setTexto] = useState('');
  const [ouvindo, setOuvindo] = useState(false);
  const [aviso, setAviso] = useState(null);
  const reconhecimento = useRef(null);

  useEffect(() => () => reconhecimento.current && reconhecimento.current.abort(), []);

  const ditar = () => {
    if (ouvindo) {
      reconhecimento.current.stop();
      return;
    }
    const r = new Reconhecimento();
    r.lang = 'pt-BR';
    r.interimResults = false;
    r.onresult = (e) => {
      const falado = Array.from(e.results).map((res) => res[0].transcript).join(' ');
      setTexto((atual) => `${atual}${atual ? ' ' : ''}${falado}`);
    };
    r.onerror = (e) => setAviso(e.error === 'not-allowed' ? 'O navegador não deu acesso ao microfone.' : 'O ditado parou. Tente de novo.');
    r.onend = () => setOuvindo(false);
    reconhecimento.current = r;
    setAviso(null);
    setOuvindo(true);
    r.start();
  };

  const salvar = async () => {
    try {
      await api.anotar(id, texto.trim());
      setTexto('');
      setAviso('Anotação salva no histórico da licitação.');
    } catch (e) {
      setAviso(e.message);
    }
  };

  return (
    <div className="mt-2">
      <div className="flex gap-1">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={2}
          placeholder="Anotação para a equipe…"
          className="flex-1 bg-obsidiana border border-borda rounded px-2 py-1 text-xs"
        />
        {Reconhecimento && (
          <button
            onClick={ditar}
            className={`${botao} self-start ${ouvindo ? 'text-erro border-erro/50' : ''}`}
            title={ouvindo ? 'Parar o ditado' : 'Ditar por voz (o navegador transcreve; nenhum áudio vai ao painel)'}
          >
            {ouvindo ? <MicOff size={14} /> : <Mic size={14} />}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 mt-1">
        <button onClick={salvar} disabled={!texto.trim()} className="text-xs px-2 py-0.5 rounded bg-voltagem text-obsidiana disabled:opacity-50">
          salvar anotação
        </button>
        {aviso && <span className="text-[11px] text-texto-suave">{aviso}</span>}
      </div>
    </div>
  );
}
