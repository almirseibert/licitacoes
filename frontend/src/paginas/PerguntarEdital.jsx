import { useEffect, useState } from 'react';
import { Loader2, MessageSquareText, Send, Star, AlertTriangle, Quote } from 'lucide-react';
import { api } from '../servicos/api';
import { dataHora } from '../servicos/formato';

/**
 * Pergunte ao Edital (Seção 5 do plano SaaS), aba do detalhe da licitação.
 *
 * A resposta é assíncrona: perguntar devolve o id na hora, e a tela consulta a
 * cada 2 s enquanto houver pergunta pendente. Erro do modelo aparece como
 * mensagem na própria pergunta — nunca um "digitando" eterno. Toda resposta já
 * passou pelo schema no servidor; a citação mostra arquivo e página do nosso
 * texto extraído, e a que o modelo parafraseou aparece como "trecho", não como
 * citação literal.
 */
const INTERVALO_MS = 2000;

export default function PerguntarEdital({ id }) {
  const [estado, setEstado] = useState(null);
  const [erro, setErro] = useState(null);
  const [texto, setTexto] = useState('');
  const [categoria, setCategoria] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [soSalvas, setSoSalvas] = useState(false);

  const carregar = () =>
    api
      .perguntasEdital(id)
      .then((r) => {
        setEstado(r);
        setErro(null);
      })
      .catch((e) => setErro(e.message));

  // Troca as perguntas dadas (pelo id) no estado, sem ir ao servidor de novo.
  const trocar = (novas) =>
    setEstado((atual) => atual && { ...atual, dados: atual.dados.map((p) => novas.find((n) => n.id === p.id) || p) });

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Consulta só as pendentes, uma a uma, enquanto houver alguma; uma falha de
  // rede não para o relógio (o intervalo segue até a pergunta terminar — o
  // servidor dá por interrompida a que passar do teto do modelo).
  const pendentes = estado ? estado.dados.filter((p) => p.situacao === 'pendente').map((p) => p.id) : [];
  const chavePendentes = pendentes.join(',');
  useEffect(() => {
    if (!chavePendentes) return undefined;
    const ids = chavePendentes.split(',').map(Number);
    const relogio = setInterval(async () => {
      const novas = await Promise.all(ids.map((pid) => api.perguntaEdital(id, pid).catch(() => null)));
      const prontas = novas.filter((n) => n && n.situacao !== 'pendente');
      // Nada terminou: não troca o estado, e a conversa não é desenhada de novo.
      if (prontas.length) trocar(prontas);
    }, INTERVALO_MS);
    return () => clearInterval(relogio);
  }, [id, chavePendentes]);

  const perguntar = async (corpo) => {
    setEnviando(true);
    setErro(null);
    try {
      await api.perguntarEdital(id, corpo);
      if (corpo.pergunta) setTexto('');
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const salvar = async (p) => {
    try {
      await api.salvarPerguntaEdital(id, p.id, !p.salva);
      trocar([{ ...p, salva: !p.salva }]);
    } catch (e) {
      setErro(e.message);
    }
  };

  if (!estado) return erro ? <p className="text-xs text-erro">{erro}</p> : null;

  const desligado = !estado.disponivel;
  const prontas = estado.prontas.filter((p) => !categoria || p.categoria === categoria);
  const lista = estado.dados.filter((p) => !soSalvas || p.salva);

  return (
    <div className="space-y-4">
      {desligado && (
        <p className="text-xs text-atencao border border-atencao/40 rounded px-3 py-2 flex items-start gap-2">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          {estado.motivo}
        </p>
      )}

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (texto.trim()) perguntar({ pergunta: texto });
        }}
      >
        <label className="text-xs text-texto-suave flex items-center gap-1.5" htmlFor="pergunta-edital">
          <MessageSquareText size={13} /> Pergunte sobre este edital — a resposta cita o trecho e a página
        </label>
        <div className="flex gap-2">
          <textarea
            id="pergunta-edital"
            className="campo flex-1 min-h-[2.5rem]"
            rows={2}
            maxLength={500}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ex.: Qual é a multa por atraso na entrega?"
            disabled={desligado}
          />
          <button
            type="submit"
            className="botao-primario flex items-center gap-1 self-start"
            disabled={desligado || enviando || texto.trim().length < 5}
            title={desligado ? estado.motivo : 'Perguntar'}
          >
            {enviando ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} perguntar
          </button>
        </div>
      </form>

      <section>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-texto-suave">Perguntas prontas:</span>
          {[['', 'todas'], ...Object.entries(estado.categorias)].map(([chave, rotulo]) => (
            <button
              key={chave || 'todas'}
              type="button"
              onClick={() => setCategoria(chave)}
              className={`px-2 py-0.5 rounded border ${
                categoria === chave ? 'border-texto text-texto' : 'border-borda text-texto-suave hover:text-texto'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2 max-h-48 overflow-y-auto">
          {prontas.map((p) => (
            <li key={p.codigo}>
              <button
                type="button"
                className="w-full text-left text-xs px-2 py-1 rounded hover:bg-superficie disabled:opacity-50"
                onClick={() => perguntar({ pronta: p.codigo })}
                disabled={desligado || enviando}
                title={desligado ? estado.motivo : 'Perguntar agora'}
              >
                {p.pergunta}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {erro && <p className="text-xs text-erro">{erro}</p>}

      <section className="space-y-3">
        <div className="flex items-center gap-3 text-xs">
          <h3 className="font-titulo text-sm">Conversa</h3>
          <label className="flex items-center gap-1 text-texto-suave">
            <input type="checkbox" checked={soSalvas} onChange={(e) => setSoSalvas(e.target.checked)} /> só as salvas
          </label>
        </div>
        {!lista.length && (
          <p className="text-xs text-texto-suave">
            {soSalvas ? 'Nenhuma pergunta salva nesta licitação.' : 'Nenhuma pergunta ainda.'}
          </p>
        )}
        {lista.map((p) => (
          <Pergunta key={p.id} p={p} aoSalvar={() => salvar(p)} />
        ))}
      </section>
    </div>
  );
}

function Pergunta({ p, aoSalvar }) {
  const r = p.resposta;
  const suspeitos = (r && r._meta && r._meta.suspeitos) || [];
  return (
    <article className="border border-borda rounded bg-superficie/40">
      <header className="px-3 py-2 border-b border-borda flex items-start gap-2">
        <p className="text-sm flex-1">{p.pergunta}</p>
        <span className="text-[11px] text-texto-suave whitespace-nowrap">
          {p.autor ? `${p.autor} · ` : ''}
          {dataHora(p.criado_em)}
        </span>
        <button
          type="button"
          onClick={aoSalvar}
          title={p.salva ? 'Tirar das salvas' : 'Salvar nesta licitação'}
          aria-label={p.salva ? 'Tirar das salvas' : 'Salvar pergunta'}
          className={p.salva ? 'text-voltagem' : 'text-texto-suave hover:text-texto'}
        >
          <Star size={14} fill={p.salva ? 'currentColor' : 'none'} />
        </button>
      </header>
      <div className="p-3 space-y-2 text-sm">
        {p.situacao === 'pendente' && (
          <p className="text-xs text-texto-suave flex items-center gap-1.5">
            <Loader2 size={12} className="animate-spin" /> procurando no edital e respondendo…
          </p>
        )}
        {p.situacao === 'erro' && <p className="text-xs text-erro">{p.erro}</p>}
        {p.situacao === 'respondida' && r && (
          <>
            <p>{r.resposta}</p>
            {suspeitos.length > 0 && (
              <p className="text-xs text-atencao flex items-start gap-1.5">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                O edital traz texto dirigido a uma IA ({suspeitos.join(', ')}). Ele foi tratado como conteúdo, não
                como instrução — vale ler esse trecho com atenção.
              </p>
            )}
            {!r.encontrado && r.citacoes && r.citacoes.length > 0 && (
              <p className="text-xs text-atencao flex items-start gap-1.5">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                A IA não sustentou a resposta com uma frase literal do edital. Leia os trechos abaixo antes de
                acreditar nela.
              </p>
            )}
            {r.citacoes && r.citacoes.length > 0 && (
              <ul className="space-y-1.5">
                {r.citacoes.map((c) => (
                  <li key={c.trecho} className="text-xs border-l-2 border-borda pl-2">
                    <span className="text-texto-suave flex items-center gap-1">
                      <Quote size={11} />
                      {c.arquivo || 'arquivo'} · {c.pagina ? `página ${c.pagina}` : 'página não identificada'}
                      {!c.literal && ' · trecho (a IA não citou literalmente)'}
                    </span>
                    <span className="italic">“{c.citacao}”</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-texto-suave">
              Sugestão da IA a partir do texto lido do edital — confira no documento antes de decidir.
              {p.cache ? ' Resposta recuperada sem custo novo.' : ''}
            </p>
          </>
        )}
      </div>
    </article>
  );
}
