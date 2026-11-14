import { useEffect, useRef, useState } from 'react';
import { Loader2, Scale, Send, AlertTriangle, Quote, Plus, Trash2, BookOpen, Search } from 'lucide-react';
import { api } from '../servicos/api';
import { dataHora } from '../servicos/formato';
import Abas from '../componentes/Abas';

/**
 * Consultor jurídico e Jurídico Fácil (Seção 16 do plano SaaS).
 *
 * O chat responde sobre a Lei 14.133 citando o artigo; a resposta é assíncrona (a tela
 * consulta a cada 2 s enquanto houver pergunta pendente). O aviso "não substitui advogado"
 * fica fixo no alto e, enquanto a base não tiver revisor, a faixa de minuta também. A
 * biblioteca não usa IA: guias curtos e artigos, com busca e filtro por tema.
 */
const INTERVALO_MS = 2000;

function Avisos({ sobre }) {
  if (!sobre) return null;
  return (
    <div className="space-y-1.5 mb-4">
      <p className="text-xs border border-borda rounded px-3 py-2 flex items-start gap-2">
        <Scale size={13} className="shrink-0 mt-0.5" /> {sobre.aviso}
      </p>
      {sobre.aviso_minuta && (
        <p className="text-xs text-atencao border border-atencao/40 rounded px-3 py-2 flex items-start gap-2">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {sobre.aviso_minuta}
        </p>
      )}
      {sobre.revisado_por_advogado && sobre.revisor && (
        <p className="text-[11px] text-texto-suave">
          Base revisada por {sobre.revisor.nome} (OAB {sobre.revisor.oab}) em {sobre.revisor.revisado_em}.
        </p>
      )}
    </div>
  );
}

export default function Juridico({ aoIr }) {
  const [aba, setAba] = useState('consultor');
  const [sobre, setSobre] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    api.juridicoSobre().then(setSobre).catch((e) => setErro(e.message));
  }, []);

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 max-w-4xl">
      <h1 className="font-titulo text-xl mb-1 flex items-center gap-2">
        <Scale size={18} /> Jurídico
      </h1>
      <p className="text-xs text-texto-suave mb-4">Lei 14.133/2021 e LC 123/2006 em linguagem de quem vai licitar.</p>
      <Avisos sobre={sobre} />
      {erro && <p className="text-xs text-erro mb-3">{erro}</p>}
      <Abas abas={[['consultor', 'Consultor'], ['biblioteca', 'Jurídico Fácil']]} ativa={aba} aoMudar={setAba} />
      {aba === 'consultor' && sobre && <Consultor sobre={sobre} />}
      {aba === 'biblioteca' && sobre && <Biblioteca sobre={sobre} aoIr={aoIr} />}
    </div>
  );
}

// ---------------------------------------------------------------- consultor
function Consultor({ sobre }) {
  const [conversas, setConversas] = useState([]);
  const [atual, setAtual] = useState(null); // { id, titulo, mensagens }
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const fim = useRef(null);

  const carregarLista = () => api.juridicoConversas().then((r) => setConversas(r.dados)).catch((e) => setErro(e.message));
  useEffect(() => {
    carregarLista();
  }, []);

  const abrir = (id) =>
    api
      .juridicoConversa(id)
      .then((c) => {
        setAtual(c);
        setErro(null);
      })
      .catch((e) => setErro(e.message));

  // Consulta só as pendentes enquanto houver alguma.
  const conversaId = atual ? atual.id : null;
  const chave = atual ? atual.mensagens.filter((m) => m.situacao === 'pendente').map((m) => m.id).join(',') : '';
  const totalDeMensagens = atual ? atual.mensagens.length : 0;
  useEffect(() => {
    if (!chave || !conversaId) return undefined;
    const ids = chave.split(',').map(Number);
    const relogio = setInterval(async () => {
      const novas = await Promise.all(ids.map((mid) => api.juridicoMensagem(conversaId, mid).catch(() => null)));
      const prontas = novas.filter((n) => n && n.situacao !== 'pendente');
      if (prontas.length) {
        setAtual((a) => a && { ...a, mensagens: a.mensagens.map((m) => prontas.find((n) => n.id === m.id) || m) });
        carregarLista();
      }
    }, INTERVALO_MS);
    return () => clearInterval(relogio);
  }, [chave, conversaId]);

  useEffect(() => {
    if (fim.current && fim.current.scrollIntoView) fim.current.scrollIntoView({ block: 'end' });
  }, [totalDeMensagens]);

  const novoChat = () => {
    setAtual(null);
    setTexto('');
    setErro(null);
  };

  const perguntar = async (pergunta) => {
    setEnviando(true);
    setErro(null);
    try {
      let id = atual && atual.id;
      if (!id) id = (await api.juridicoNovaConversa()).id;
      await api.juridicoPerguntar(id, pergunta);
      setTexto('');
      await abrir(id);
      carregarLista();
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const apagar = async (id) => {
    if (!window.confirm('Apagar esta conversa?')) return;
    try {
      await api.juridicoApagarConversa(id);
      if (atual && atual.id === id) novoChat();
      carregarLista();
    } catch (e) {
      setErro(e.message);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
      <aside className="min-w-0">
        <button type="button" className="botao-primario w-full flex items-center justify-center gap-1 mb-2" onClick={novoChat}>
          <Plus size={12} /> novo chat
        </button>
        <ul className="space-y-0.5 max-h-72 overflow-y-auto">
          {conversas.map((c) => (
            <li key={c.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => abrir(c.id)}
                className={`flex-1 min-w-0 text-left text-xs px-2 py-1.5 rounded truncate ${
                  atual && atual.id === c.id ? 'bg-superficie text-texto' : 'text-texto-suave hover:text-texto'
                }`}
                title={c.titulo || 'Conversa'}
              >
                {c.titulo || 'Nova conversa'}
              </button>
              <button type="button" onClick={() => apagar(c.id)} aria-label="Apagar conversa" className="text-texto-suave hover:text-erro">
                <Trash2 size={12} />
              </button>
            </li>
          ))}
          {!conversas.length && <li className="text-xs text-texto-suave px-2">Nenhuma conversa ainda.</li>}
        </ul>
      </aside>

      <section className="min-w-0 space-y-3">
        {!sobre.ia_disponivel && (
          <p className="text-xs text-atencao border border-atencao/40 rounded px-3 py-2 flex items-start gap-2">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {sobre.motivo_ia}
          </p>
        )}
        {!atual && (
          <div className="text-xs text-texto-suave space-y-1.5">
            <p>Pergunte sobre prazos, recursos, garantias, sanções, ME e EPP… A resposta cita o artigo da lei.</p>
            <ul className="flex flex-wrap gap-1.5">
              {sobre.exemplos.map((e) => (
                <li key={e}>
                  <button type="button" className="px-2 py-1 rounded border border-borda hover:text-texto" disabled={enviando} onClick={() => perguntar(e)}>
                    {e}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {atual && atual.mensagens.map((m) => <Troca key={m.id} m={m} />)}
        <div ref={fim} />
        {erro && <p className="text-xs text-erro">{erro}</p>}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (texto.trim().length >= 8) perguntar(texto);
          }}
        >
          <label htmlFor="pergunta-juridica" className="sr-only">Pergunta jurídica</label>
          <textarea
            id="pergunta-juridica"
            className="campo flex-1 min-h-[2.5rem]"
            rows={2}
            maxLength={500}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ex.: Quanto o órgão pode exigir de garantia do contrato?"
          />
          <button type="submit" className="botao-primario flex items-center gap-1 self-start" disabled={enviando || texto.trim().length < 8}>
            {enviando ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} perguntar
          </button>
        </form>
        <p className="text-[11px] text-texto-suave">Não substitui advogado. Confira o artigo citado antes de agir.</p>
      </section>
    </div>
  );
}

function Troca({ m }) {
  const r = m.resposta;
  const artigos = (r && r._meta && r._meta.artigos) || [];
  return (
    <article className="border border-borda rounded bg-superficie/40">
      <header className="px-3 py-2 border-b border-borda flex items-start gap-2">
        <p className="text-sm flex-1">{m.pergunta}</p>
        <span className="text-[11px] text-texto-suave whitespace-nowrap">{dataHora(m.criado_em)}</span>
      </header>
      <div className="p-3 space-y-2 text-sm">
        {m.situacao === 'pendente' && (
          <p className="text-xs text-texto-suave flex items-center gap-1.5">
            <Loader2 size={12} className="animate-spin" /> procurando o artigo e respondendo…
          </p>
        )}
        {m.situacao === 'erro' && <p className="text-xs text-erro">{m.erro}</p>}
        {m.situacao === 'respondida' && r && (
          <>
            <p>{r.resposta}</p>
            {!r.encontrado && r.citacoes && r.citacoes.length > 0 && (
              <p className="text-xs text-atencao flex items-start gap-1.5">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                A IA não sustentou a resposta com uma frase literal do artigo. Leia o texto abaixo antes de acreditar nela.
              </p>
            )}
            {r.citacoes && r.citacoes.length > 0 && (
              <ul className="space-y-1.5">
                {r.citacoes.map((c) => (
                  <li key={c.trecho} className="text-xs border-l-2 border-borda pl-2">
                    <span className="text-texto-suave flex items-center gap-1">
                      <Quote size={11} /> {c.arquivo}
                      {!c.literal && ' · trecho (a IA não citou literalmente)'}
                    </span>
                    <span className="italic">“{c.citacao}”</span>
                  </li>
                ))}
              </ul>
            )}
            {artigos.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-texto-suave">
                  Artigos da base consultados ({artigos.length})
                </summary>
                <ul className="mt-1.5 space-y-1.5">
                  {artigos.map((a) => (
                    <li key={a.id} className="border-l-2 border-borda pl-2">
                      <span className="font-mono">{a.rotulo}</span> — {a.titulo}
                      <p className="text-texto-suave">{a.texto}</p>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <p className="text-[11px] text-texto-suave">
              Sugestão da IA a partir de um resumo da lei escrito para este painel.{m.cache ? ' Resposta recuperada sem custo novo.' : ''}
            </p>
          </>
        )}
      </div>
    </article>
  );
}

// -------------------------------------------------------------- biblioteca
function Biblioteca({ sobre }) {
  const [q, setQ] = useState('');
  const [tema, setTema] = useState('');
  const [dados, setDados] = useState(null);
  const [guia, setGuia] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    const espera = setTimeout(() => {
      api.juridicoBiblioteca(q, tema).then((r) => setDados(r.dados)).catch((e) => setErro(e.message));
    }, 200);
    return () => clearTimeout(espera);
  }, [q, tema]);

  const abrir = (id) => api.juridicoGuia(id).then(setGuia).catch((e) => setErro(e.message));

  if (guia) {
    return (
      <article className="space-y-3">
        <button type="button" className="text-xs text-texto-suave hover:text-texto" onClick={() => setGuia(null)}>← voltar à biblioteca</button>
        <h2 className="font-titulo text-lg">{guia.titulo}</h2>
        <p className="text-[11px] text-texto-suave">{guia.tema_nome}</p>
        {guia.corpo.map((p) => (
          <p key={p} className="text-sm">{p}</p>
        ))}
        <section>
          <h3 className="text-xs text-texto-suave mb-1">Artigos em que se apoia</h3>
          <ul className="space-y-1.5">
            {guia.artigos.map((a) => (
              <li key={a.id} className="text-xs border-l-2 border-borda pl-2">
                <span className="font-mono">{a.rotulo}</span> — {a.titulo}
                <p className="text-texto-suave">{a.texto}</p>
              </li>
            ))}
          </ul>
        </section>
        <p className="text-[11px] text-texto-suave">Conteúdo do painel, escrito em linguagem simples. Não substitui advogado.</p>
      </article>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap items-center">
        <label className="flex items-center gap-1.5 flex-1 min-w-[12rem]">
          <Search size={13} className="text-texto-suave" />
          <span className="sr-only">Buscar na biblioteca</span>
          <input className="campo flex-1" placeholder="Buscar: recurso, multa, garantia…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select className="campo" value={tema} onChange={(e) => setTema(e.target.value)} aria-label="Tema">
          <option value="">Todos os temas</option>
          {Object.entries(sobre.temas).map(([chave, rotulo]) => (
            <option key={chave} value={chave}>{rotulo}</option>
          ))}
        </select>
      </div>
      {erro && <p className="text-xs text-erro">{erro}</p>}
      {dados && !dados.length && <p className="text-xs text-texto-suave">Nenhum guia encontrado. Tente outra palavra ou pergunte ao consultor.</p>}
      <ul className="grid gap-2 sm:grid-cols-2">
        {(dados || []).map((g) => (
          <li key={g.id}>
            <button type="button" onClick={() => abrir(g.id)} className="w-full h-full text-left border border-borda rounded p-3 hover:bg-superficie">
              <span className="text-[11px] text-texto-suave flex items-center gap-1"><BookOpen size={11} /> {sobre.temas[g.tema]}</span>
              <span className="block text-sm mt-0.5">{g.titulo}</span>
              <span className="block text-xs text-texto-suave mt-0.5">{g.resumo}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
