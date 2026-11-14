import { useEffect, useMemo, useState } from 'react';
import { Loader2, ChevronLeft, ChevronRight, CheckCheck, Plus, Trash2, Save, X, ExternalLink, Mail, MailX } from 'lucide-react';
import { api } from '../servicos/api';
import { moeda, dataHora, resumir } from '../servicos/formato';

/**
 * Tela "Boletins" (Seção 4 do PLANO_SAAS_CONLICITACAO.md).
 *
 * Duas abas: o calendário do mês, com os boletins numerados por dia e a
 * legenda não lido / lido / lido por outro membro; e "Meus filtros", que são
 * os perfis de busca que geram o boletim. O filtro roda no nosso banco, sobre
 * o objeto e o texto do edital — a tela só configura.
 */
const STATUS = {
  nao_lido: { rotulo: 'não lido', classe: 'bg-voltagem/15 border-voltagem/60 text-voltagem' },
  lido: { rotulo: 'lido', classe: 'border-borda text-texto-suave' },
  lido_outro: { rotulo: 'lido por outro membro', classe: 'bg-atencao/10 border-atencao/60 text-atencao' },
};
const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function mesAtual() {
  return new Date().toISOString().slice(0, 7);
}

function deslocarMes(mes, n) {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

function nomeDoMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export default function Boletins() {
  const [aba, setAba] = useState('boletins');
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-borda flex items-center gap-4 shrink-0 flex-wrap">
        <h1 className="font-titulo text-xl">Boletins</h1>
        <div className="flex items-center gap-1">
          {[
            ['boletins', 'Calendário'],
            ['filtros', 'Meus filtros'],
          ].map(([chave, rotulo]) => (
            <button
              key={chave}
              onClick={() => setAba(chave)}
              className={`px-2 py-0.5 text-xs border rounded ${
                aba === chave ? 'border-texto text-texto' : 'border-borda text-texto-suave hover:text-texto'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>
      {aba === 'boletins' ? <Calendario /> : <Filtros />}
    </div>
  );
}

// ------------------------------------------------------------------ calendário

function Calendario() {
  const [mes, setMes] = useState(mesAtual);
  const [filtro, setFiltro] = useState({ perfil_id: '', status: '', uf: '' });
  const [perfis, setPerfis] = useState([]);
  const [lista, setLista] = useState(null);
  const [aberto, setAberto] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const consulta = useMemo(() => ({ mes, ...filtro }), [mes, filtro]);

  const carregar = async () => {
    try {
      const r = await api.boletins(consulta);
      setLista(r.dados);
      setErro(null);
    } catch (e) {
      setErro(e.message);
    }
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consulta]);

  useEffect(() => {
    api.perfisBoletim().then((r) => setPerfis(r.dados)).catch(() => {});
  }, []);

  const abrir = async (b) => {
    try {
      setAberto(await api.boletim(b.id));
      if (b.status !== 'lido') {
        await api.marcarBoletim(b.id, true);
        carregar();
      }
    } catch (e) {
      setErro(e.message);
    }
  };

  const marcarTodos = async () => {
    setOcupado(true);
    try {
      const r = await api.marcarBoletinsLidos(consulta);
      setAviso(`${r.marcados} boletim(ns) marcado(s) como lido(s).`);
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(false);
    }
  };

  // Grade do mês: domingo a sábado, com vazio antes do dia 1.
  const dias = useMemo(() => {
    const [a, m] = mes.split('-').map(Number);
    const primeiro = new Date(Date.UTC(a, m - 1, 1)).getUTCDay();
    const total = new Date(Date.UTC(a, m, 0)).getUTCDate();
    const porDia = {};
    for (const b of lista || []) (porDia[b.data] ||= []).push(b);
    return [
      ...Array.from({ length: primeiro }, () => null),
      ...Array.from({ length: total }, (_, i) => {
        const chave = `${mes}-${String(i + 1).padStart(2, '0')}`;
        return { dia: i + 1, chave, boletins: porDia[chave] || [] };
      }),
    ];
  }, [mes, lista]);

  const hoje = new Date().toLocaleDateString('en-CA');

  return (
    <div className="flex-1 overflow-auto p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button className="botao px-1.5" onClick={() => setMes(deslocarMes(mes, -1))} aria-label="Mês anterior">
          <ChevronLeft size={14} />
        </button>
        <span className="font-titulo text-base capitalize w-40 text-center">{nomeDoMes(mes)}</span>
        <button className="botao px-1.5" onClick={() => setMes(deslocarMes(mes, 1))} aria-label="Próximo mês">
          <ChevronRight size={14} />
        </button>
        <select
          className="campo-caixa text-xs"
          value={filtro.perfil_id}
          onChange={(e) => setFiltro({ ...filtro, perfil_id: e.target.value })}
        >
          <option value="">todos os filtros</option>
          {perfis.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
        <select
          className="campo-caixa text-xs"
          value={filtro.status}
          onChange={(e) => setFiltro({ ...filtro, status: e.target.value })}
        >
          <option value="">todos os status</option>
          {Object.entries(STATUS).map(([chave, s]) => (
            <option key={chave} value={chave}>
              {s.rotulo}
            </option>
          ))}
        </select>
        <input
          className="campo-caixa text-xs w-16 uppercase"
          placeholder="UF"
          maxLength={2}
          value={filtro.uf}
          onChange={(e) => setFiltro({ ...filtro, uf: e.target.value.toUpperCase() })}
        />
        <button className="botao flex items-center gap-1 sm:ml-auto" onClick={marcarTodos} disabled={ocupado}>
          {ocupado ? <Loader2 size={12} className="animate-spin" /> : <CheckCheck size={12} />}
          marcar boletins do filtro como lidos
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-[11px] text-texto-suave">
        {Object.entries(STATUS).map(([chave, s]) => (
          <span key={chave} className="flex items-center gap-1">
            <span className={`inline-block w-3 h-3 rounded-sm border ${s.classe}`} />
            {s.rotulo}
          </span>
        ))}
      </div>

      {erro && <p className="px-3 py-2 text-xs border border-erro/40 text-erro rounded bg-erro/5">{erro}</p>}
      {aviso && <p className="px-3 py-2 text-xs border border-borda bg-superficie rounded text-texto-suave">{aviso}</p>}

      {!lista ? (
        <Loader2 size={16} className="animate-spin text-texto-suave" />
      ) : (
        <div className="grid grid-cols-7 gap-px bg-borda border border-borda rounded overflow-hidden">
          {DIAS_SEMANA.map((d) => (
            <div key={d} className="bg-navy text-texto-suave text-[10px] uppercase tracking-wide px-1.5 py-1">
              {d}
            </div>
          ))}
          {dias.map((d, i) =>
            d ? (
              <div key={d.chave} className={`bg-superficie min-h-[64px] p-1 ${d.chave === hoje ? 'ring-1 ring-inset ring-voltagem/60' : ''}`}>
                <div className="text-[10px] font-mono text-texto-suave">{d.dia}</div>
                <div className="flex flex-wrap gap-0.5 mt-0.5">
                  {d.boletins.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => abrir(b)}
                      title={`Boletim nº ${b.numero} — ${b.perfil}, ${b.horario}h: ${b.total_itens} licitação(ões) · ${STATUS[b.status].rotulo}${b.lido_por ? ` (${b.lido_por})` : ''}`}
                      className={`px-1 rounded-sm border text-[10px] font-mono leading-4 ${STATUS[b.status].classe}`}
                    >
                      nº{b.numero}·{b.total_itens}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div key={`vazio-${i}`} className="bg-obsidiana" />
            )
          )}
        </div>
      )}

      {lista && lista.length === 0 && (
        <p className="text-sm text-texto-suave max-w-2xl">
          Nenhum boletim neste mês com esse filtro. O boletim sai nos horários de cada filtro (padrão 7h, 12h e
          18h) quando há licitação nova que casa com ele — configure em <em>Meus filtros</em>.
        </p>
      )}

      {aberto && <Detalhe boletim={aberto} onFechar={() => setAberto(null)} />}
    </div>
  );
}

function Detalhe({ boletim, onFechar }) {
  const [a, m, d] = boletim.data.split('-');
  return (
    <section className="border border-borda rounded bg-superficie/40">
      <header className="px-3 py-2 border-b border-borda flex items-baseline gap-2 flex-wrap">
        <h2 className="font-titulo text-sm">
          Boletim nº {boletim.numero} de {d}/{m}/{a}, {String(boletim.horario).padStart(2, '0')}h — {boletim.perfil}
        </h2>
        <span className="text-[11px] text-texto-suave">
          {boletim.total_itens} licitação(ões) · e-mail: {boletim.email_status || '—'}
          {boletim.leituras.length > 0 && ` · lido por ${boletim.leituras.map((l) => l.nome).join(', ')}`}
        </span>
        <button className="ml-auto text-texto-suave hover:text-texto" onClick={onFechar} aria-label="Fechar">
          <X size={14} />
        </button>
      </header>
      <ul className="divide-y divide-borda/50">
        {boletim.itens.map((i) => (
          <li key={i.id} className="px-3 py-2">
            <div className="text-sm">{resumir(i.objeto, 220)}</div>
            <div className="mt-1 flex items-center gap-3 flex-wrap text-[11px] text-texto-suave">
              <span>{i.orgao_nome || '____________'}</span>
              <span className="font-mono">
                {i.municipio || '____________'}/{i.uf || '--'}
              </span>
              <span className="font-mono">
                {i.orcamento_sigiloso ? 'sigiloso' : Number(i.valor_estimado) > 0 ? moeda(i.valor_estimado) : '____________'}
              </span>
              <span className="font-mono">até {i.fim_propostas ? dataHora(i.fim_propostas) : '____________'}</span>
              {i.palavra && (
                <span>
                  “{i.palavra}” no {i.onde === 'edital' ? 'edital' : 'objeto'}
                </span>
              )}
              {i.link_portal && (
                <a className="flex items-center gap-1 hover:text-texto ml-auto" href={i.link_portal} target="_blank" rel="noreferrer">
                  portal <ExternalLink size={10} />
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// --------------------------------------------------------------- meus filtros

const listaEmTexto = (v) => (v || []).join('\n');
const textoEmLista = (t) =>
  String(t || '')
    .split(/[\n,;]/)
    .map((x) => x.trim())
    .filter(Boolean);

function paraFormulario(p) {
  return {
    ...p,
    palavras: listaEmTexto(p.palavras),
    exclusoes: listaEmTexto(p.exclusoes),
    municipios: listaEmTexto(p.municipios),
    ufs: (p.ufs || []).join(', '),
    horarios: (p.horarios || []).join(', '),
    valor_minimo: p.valor_minimo ?? '',
    valor_maximo: p.valor_maximo ?? '',
    nota_minima: p.nota_minima ?? '',
  };
}

function paraApi(f) {
  return {
    nome: f.nome,
    palavras: textoEmLista(f.palavras),
    exclusoes: textoEmLista(f.exclusoes),
    municipios: textoEmLista(f.municipios),
    ufs: textoEmLista(f.ufs),
    modalidades: f.modalidades || [],
    horarios: String(f.horarios || '')
      .split(/[,;\s]+/)
      .filter(Boolean),
    valor_minimo: f.valor_minimo === '' ? null : f.valor_minimo,
    valor_maximo: f.valor_maximo === '' ? null : f.valor_maximo,
    nota_minima: f.nota_minima === '' ? null : f.nota_minima,
    ativo: Boolean(f.ativo),
    enviar_email: Boolean(f.enviar_email),
  };
}

function Filtros() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);

  const carregar = async () => {
    try {
      setDados(await api.perfisBoletim());
      setErro(null);
    } catch (e) {
      setErro(e.message);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const novo = async () => {
    try {
      const nomes = new Set(dados.dados.map((p) => p.nome));
      let n = dados.dados.length + 1;
      while (nomes.has(`Filtro ${n}`)) n += 1;
      await api.criarPerfilBoletim({ nome: `Filtro ${n}`, palavras: [] });
      await carregar();
    } catch (e) {
      setErro(e.message);
    }
  };

  if (!dados) return erro ? <p className="m-4 text-sm text-erro">{erro}</p> : <Loader2 size={16} className="animate-spin text-texto-suave m-4" />;

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4">
      <div className="flex items-start gap-3 flex-wrap">
        <p className="text-xs text-texto-suave max-w-3xl">
          Cada filtro gera o seu boletim nos horários escolhidos, só com licitação nova que casa com ele — a mesma
          licitação nunca vem duas vezes no mesmo filtro. A palavra vale no objeto e no texto do edital já lido;
          a exclusão vale só no objeto.
        </p>
        <button className="botao flex items-center gap-1 sm:ml-auto" onClick={novo}>
          <Plus size={12} /> novo filtro
        </button>
      </div>
      {erro && <p className="px-3 py-2 text-xs border border-erro/40 text-erro rounded bg-erro/5">{erro}</p>}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {dados.dados.map((p) => (
          <FormularioFiltro
            key={`${p.id}-${p.atualizado_em}`}
            perfil={p}
            modalidades={dados.modalidades}
            podeApagar={dados.dados.length > 1}
            onMudou={carregar}
          />
        ))}
      </div>
    </div>
  );
}

function Campo({ rotulo, dica, children }) {
  return (
    <label className="block">
      <span className="text-[11px] text-texto-suave">{rotulo}</span>
      {children}
      {dica && <span className="block text-[10px] text-texto-suave mt-0.5">{dica}</span>}
    </label>
  );
}

function FormularioFiltro({ perfil, modalidades, podeApagar, onMudou }) {
  const [f, setF] = useState(() => paraFormulario(perfil));
  const [erro, setErro] = useState(null);
  const [salvo, setSalvo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const mudar = (campo) => (e) => {
    setSalvo(false);
    setF({ ...f, [campo]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  };

  const salvar = async () => {
    setOcupado(true);
    try {
      await api.salvarPerfilBoletim(perfil.id, paraApi(f));
      setErro(null);
      setSalvo(true);
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(false);
    }
  };

  const apagar = async () => {
    if (!window.confirm(`Apagar o filtro "${perfil.nome}" e os boletins dele?`)) return;
    try {
      await api.apagarPerfilBoletim(perfil.id);
      onMudou();
    } catch (e) {
      setErro(e.message);
    }
  };

  const alternarEmail = async () => {
    try {
      await api.receberBoletim(perfil.id, perfil.descadastrado);
      onMudou();
    } catch (e) {
      setErro(e.message);
    }
  };

  const alternarModalidade = (m) => {
    setSalvo(false);
    const atual = f.modalidades || [];
    setF({ ...f, modalidades: atual.includes(m) ? atual.filter((x) => x !== m) : [...atual, m] });
  };

  const semPalavra = textoEmLista(f.palavras).length === 0;

  return (
    <section className="border border-borda rounded bg-superficie/40">
      <header className="px-3 py-2 border-b border-borda flex items-center gap-2 flex-wrap">
        <input className="campo-caixa text-sm font-titulo flex-1 min-w-[10rem]" value={f.nome} onChange={mudar('nome')} aria-label="Nome do filtro" />
        <label className="flex items-center gap-1 text-xs text-texto-suave">
          <input type="checkbox" checked={Boolean(f.ativo)} onChange={mudar('ativo')} /> ativo
        </label>
        <span className="text-[11px] text-texto-suave">{perfil.boletins} boletim(ns)</span>
      </header>
      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo rotulo="Palavras (uma por linha)" dica="Casa no começo da palavra: “monitor” pega “monitores”.">
          <textarea className="campo-caixa w-full h-24 font-mono text-xs" value={f.palavras} onChange={mudar('palavras')} />
        </Campo>
        <Campo rotulo="Exclusões (uma por linha)" dica="Se aparecer no objeto, a licitação fica de fora.">
          <textarea className="campo-caixa w-full h-24 font-mono text-xs" value={f.exclusoes} onChange={mudar('exclusoes')} />
        </Campo>
        <Campo rotulo="UFs" dica="Siglas separadas por vírgula; vazio = todas.">
          <input className="campo-caixa w-full uppercase" value={f.ufs} onChange={mudar('ufs')} placeholder="RS, SC" />
        </Campo>
        <Campo rotulo="Municípios (um por linha)" dica="Vazio = todos.">
          <textarea className="campo-caixa w-full h-10 text-xs" value={f.municipios} onChange={mudar('municipios')} />
        </Campo>
        <Campo rotulo="Valor estimado (R$)" dica="Sem valor informado ou sigiloso, a licitação entra.">
          <div className="flex gap-2">
            <input className="campo-caixa w-full font-mono" type="number" min="0" placeholder="mínimo" value={f.valor_minimo} onChange={mudar('valor_minimo')} />
            <input className="campo-caixa w-full font-mono" type="number" min="0" placeholder="máximo" value={f.valor_maximo} onChange={mudar('valor_maximo')} />
          </div>
        </Campo>
        <div className="flex gap-2">
          <Campo rotulo="Nota mínima" dica="0 a 100; vazio = qualquer.">
            <input className="campo-caixa w-full font-mono" type="number" min="0" max="100" value={f.nota_minima} onChange={mudar('nota_minima')} />
          </Campo>
          <Campo rotulo="Horários" dica="Horas cheias, ex.: 7, 12, 18.">
            <input className="campo-caixa w-full font-mono" value={f.horarios} onChange={mudar('horarios')} />
          </Campo>
        </div>
        {modalidades.length > 0 && (
          <div className="sm:col-span-2">
            <span className="text-[11px] text-texto-suave">Modalidades (nenhuma marcada = todas)</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {modalidades.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => alternarModalidade(m)}
                  className={`px-2 py-0.5 text-[11px] border rounded ${
                    (f.modalidades || []).includes(m) ? 'border-voltagem/60 text-voltagem' : 'border-borda text-texto-suave'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {semPalavra && (
        <p className="mx-3 mb-2 px-3 py-2 text-xs border border-atencao/50 text-atencao rounded bg-atencao/5">
          Sem palavra este filtro não gera boletim — um filtro vazio mandaria o catálogo inteiro.
        </p>
      )}
      {erro && <p className="mx-3 mb-2 px-3 py-2 text-xs border border-erro/40 text-erro rounded bg-erro/5">{erro}</p>}
      <footer className="px-3 py-2 border-t border-borda flex items-center gap-2 flex-wrap">
        <label className="flex items-center gap-1 text-xs text-texto-suave">
          <input type="checkbox" checked={Boolean(f.enviar_email)} onChange={mudar('enviar_email')} /> enviar por e-mail à equipe
        </label>
        <button className="botao flex items-center gap-1" onClick={alternarEmail} title="Vale só para você">
          {perfil.descadastrado ? <MailX size={12} /> : <Mail size={12} />}
          {perfil.descadastrado ? 'você não recebe — voltar a receber' : 'você recebe — parar de receber'}
        </button>
        {salvo && <span className="text-xs text-ok">salvo</span>}
        {podeApagar && (
          <button className="botao flex items-center gap-1 ml-auto" onClick={apagar}>
            <Trash2 size={12} /> apagar
          </button>
        )}
        <button className={`botao-primario flex items-center gap-1 ${podeApagar ? '' : 'ml-auto'}`} onClick={salvar} disabled={ocupado}>
          {ocupado ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} salvar
        </button>
      </footer>
    </section>
  );
}
