import { useEffect, useState } from 'react';
import { Loader2, ExternalLink, X } from 'lucide-react';
import { api } from '../servicos/api';
import { moeda, resumir, faixaPontuacao } from '../servicos/formato';
import Contagem from '../componentes/Contagem';

/**
 * Funil em Kanban (seção 10): oito etapas fixas, arrastar e soltar.
 *
 * Cada etapa cobra o que precisa ao receber o card — preço na proposta,
 * vencedor na derrota, motivo no descarte. É chato no momento e é exatamente
 * isso que, meses depois, responde "o que mais me barra".
 */
export default function Funil({ aoAbrir }) {
  const [etapas, setEtapas] = useState([]);
  const [motivos, setMotivos] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [cards, setCards] = useState([]);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [arrastando, setArrastando] = useState(null);
  const [alvo, setAlvo] = useState(null);
  const [pedindo, setPedindo] = useState(null); // { licitacao, etapa, campos }

  const carregar = async () => {
    setCarregando(true);
    try {
      const filtros = await api.filtros();
      setEtapas(filtros.funil || []);
      setMotivos(filtros.motivos_descarte || []);
      setCatalogo(filtros.exigencias || []);

      // O funil mostra o que saiu da triagem, mais a triagem recente.
      // A API entrega no máximo 200 por página; o funil busca as duas primeiras.
      const base = { pontuacao_min: 0, incluir_descartadas: 1, por_pagina: 200, ordem: 'prazo' };
      const [p1, p2] = await Promise.all([
        api.licitacoes({ ...base, pagina: 1 }),
        api.licitacoes({ ...base, pagina: 2 }),
      ]);
      setCards([...(p1.dados || []), ...(p2.dados || [])]);
      setErro(null);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const mover = async (licitacao, etapa, extras = {}) => {
    try {
      const r = await api.atualizarLicitacao(licitacao.id, { etapa, ...extras });
      setAviso(r.mensagem || null);
      setErro(null);
      setCards((atual) => atual.map((c) => (c.id === licitacao.id ? { ...c, etapa, ...extras } : c)));
      setPedindo(null);
    } catch (e) {
      // Campo obrigatório faltando: a etapa abre o formulário em vez de recusar calada.
      if (/informe:/i.test(e.message)) {
        const definicao = etapas.find((x) => x.chave === etapa);
        setPedindo({ licitacao, etapa, campos: definicao ? definicao.pede : [], mensagem: e.message });
      } else {
        setErro(e.message);
      }
    }
  };

  const soltar = (etapa) => {
    setAlvo(null);
    if (!arrastando || arrastando.etapa === etapa) return;
    const definicao = etapas.find((x) => x.chave === etapa);
    if (definicao && definicao.pede.length) {
      setPedindo({ licitacao: arrastando, etapa, campos: definicao.pede });
    } else {
      mover(arrastando, etapa);
    }
    setArrastando(null);
  };

  if (erro && !etapas.length) return <p className="m-4 text-sm text-erro">{erro}</p>;

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-borda flex items-center gap-4 shrink-0">
        <h1 className="font-titulo text-xl">Funil</h1>
        <p className="text-xs text-texto-suave">
          {cards.length} licitações · arraste o card, ou use o seletor dentro dele
        </p>
        {carregando && <Loader2 size={14} className="animate-spin text-texto-suave" />}
      </div>

      {erro && <p className="mx-4 mt-2 px-3 py-2 text-xs border border-erro/40 text-erro rounded bg-erro/5">{erro}</p>}
      {aviso && (
        <p className="mx-4 mt-2 px-3 py-2 text-xs border border-borda bg-superficie rounded text-texto-suave">{aviso}</p>
      )}

      <div className="flex-1 overflow-x-auto overflow-y-hidden p-3">
        <div className="flex gap-3 h-full min-w-max">
          {etapas.map((etapa) => {
            const daEtapa = cards.filter((c) => (c.etapa || 'Triagem') === etapa.chave);
            return (
              <section
                key={etapa.chave}
                onDragOver={(e) => {
                  e.preventDefault();
                  setAlvo(etapa.chave);
                }}
                onDragLeave={() => setAlvo((a) => (a === etapa.chave ? null : a))}
                onDrop={() => soltar(etapa.chave)}
                className={`w-64 shrink-0 flex flex-col border rounded bg-superficie/40 transition-colors ${
                  alvo === etapa.chave ? 'border-voltagem' : 'border-borda'
                }`}
              >
                <header className="px-3 py-2 border-b border-borda">
                  <p className={`text-xs uppercase tracking-wide ${CORES[etapa.cor] || 'text-texto'}`}>
                    {etapa.chave}
                  </p>
                  <p className="text-[11px] text-texto-suave">
                    {daEtapa.length} · {etapa.descricao}
                  </p>
                </header>

                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {daEtapa.slice(0, 60).map((c) => (
                    <article
                      key={c.id}
                      draggable
                      onDragStart={() => setArrastando(c)}
                      onDragEnd={() => setArrastando(null)}
                      onClick={() => aoAbrir && aoAbrir(c.id)}
                      className="border border-borda bg-superficie rounded p-2 cursor-grab active:cursor-grabbing hover:border-texto-suave/40"
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className="font-mono text-xs shrink-0"
                          style={{ color: faixaPontuacao(c.pontuacao).cor }}
                        >
                          {c.pontuacao}
                        </span>
                        <p className="text-xs leading-snug">{resumir(c.objeto, 90)}</p>
                      </div>
                      <p className="text-[11px] text-texto-suave mt-1 truncate">{resumir(c.orgao_nome, 40)}</p>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-texto-suave">
                        <span className="font-mono">{moeda(c.valor_estimado)}</span>
                        <span className="ml-auto">
                          <Contagem fim={c.fim_propostas} />
                        </span>
                      </div>
                      {/* Arrastar é o caminho curto; o seletor existe para quem
                          usa teclado, toque, ou simplesmente prefere clicar. */}
                      <select
                        value={etapa.chave}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const destino = e.target.value;
                          const definicao = etapas.find((x) => x.chave === destino);
                          if (definicao && definicao.pede.length) setPedindo({ licitacao: c, etapa: destino, campos: definicao.pede });
                          else mover(c, destino);
                        }}
                        className="mt-1 w-full bg-transparent border border-transparent hover:border-borda rounded text-[11px] text-texto-suave px-1 py-0.5"
                      >
                        {etapas.map((x) => (
                          <option key={x.chave} value={x.chave}>
                            {x.chave}
                          </option>
                        ))}
                      </select>

                      {etapa.destacaLink && (c.link_disputa || c.link_portal) && (
                        <a
                          href={c.link_disputa || c.link_portal}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 flex items-center gap-1 text-[11px] text-voltagem"
                        >
                          abrir a sessão <ExternalLink size={10} />
                        </a>
                      )}
                    </article>
                  ))}

                  {daEtapa.length > 60 && (
                    <p className="text-[11px] text-texto-suave px-1">e mais {daEtapa.length - 60}…</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {pedindo && (
        <PedirCampos
          dados={pedindo}
          motivos={motivos}
          catalogo={catalogo}
          aoCancelar={() => setPedindo(null)}
          aoConfirmar={(extras) => mover(pedindo.licitacao, pedindo.etapa, extras)}
        />
      )}
    </div>
  );
}

// Tailwind só gera a classe que aparece escrita no código: nada de `text-${cor}`.
const CORES = {
  'texto-suave': 'text-texto-suave',
  texto: 'text-texto',
  voltagem: 'text-voltagem',
  atencao: 'text-atencao',
  ok: 'text-ok',
  erro: 'text-erro',
};

/** `2026-11-02T14:30` no fuso do navegador, que é o formato do datetime-local. */
function agoraLocal() {
  const d = new Date();
  const dois = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}T${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

const ROTULOS = {
  proposta_em: 'Data e hora do envio',
  valor_proposto: 'Valor proposto (R$)',
  valor_final: 'Valor final (R$)',
  vencedor: 'Quem venceu',
  motivo_descarte: 'Motivo do descarte',
};

/** O que a etapa pede, pedido na hora de soltar o card. */
/** Agrupa o catálogo pelos grupos do checklist, para o select não virar lista corrida. */
function porGrupo(catalogo) {
  return catalogo.reduce((mapa, e) => {
    (mapa[e.grupo] = mapa[e.grupo] || []).push(e);
    return mapa;
  }, {});
}

function PedirCampos({ dados, motivos, catalogo, aoConfirmar, aoCancelar }) {
  // "Mandei a proposta" quase sempre quer dizer agora: o campo já vem
  // preenchido com a hora corrente e você só corrige se foi outra.
  const [valores, setValores] = useState(() =>
    dados.campos.includes('proposta_em') ? { proposta_em: agoraLocal() } : {}
  );
  const motivo = motivos.find((m) => m.chave === valores.motivo_descarte);

  return (
    <div className="fixed inset-0 bg-obsidiana/80 flex items-start justify-center p-10 z-20">
      <div className="bg-superficie border border-borda rounded w-full max-w-md">
        <div className="px-4 py-3 border-b border-borda flex items-center gap-2">
          <h2 className="font-titulo text-base">Mover para “{dados.etapa}”</h2>
          <button className="ml-auto text-texto-suave hover:text-texto" onClick={aoCancelar}>
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-texto-suave">{resumir(dados.licitacao.objeto, 140)}</p>

          {dados.campos.map((campo) => (
            <label key={campo} className="block">
              <span className="text-[11px] uppercase tracking-wide text-texto-suave">
                {ROTULOS[campo] || campo}
              </span>
              {campo === 'motivo_descarte' ? (
                <select
                  className="campo-caixa w-full mt-1"
                  value={valores[campo] || ''}
                  onChange={(e) => setValores({ ...valores, [campo]: e.target.value })}
                >
                  <option value="">escolha…</option>
                  {motivos.map((m) => (
                    <option key={m.chave} value={m.chave}>
                      {m.rotulo}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="campo-caixa w-full mt-1"
                  type={campo === 'proposta_em' ? 'datetime-local' : campo.startsWith('valor') ? 'number' : 'text'}
                  step={campo.startsWith('valor') ? '0.01' : undefined}
                  value={valores[campo] || ''}
                  onChange={(e) => setValores({ ...valores, [campo]: e.target.value })}
                />
              )}
            </label>
          ))}

          {motivo && motivo.pedeCodigo && (
            <label className="block">
              <span className="text-[11px] uppercase tracking-wide text-texto-suave">
                Qual exigência barrou (código)
              </span>
              <select
                className="campo-caixa w-full mt-1"
                value={valores.codigo_barrou || ''}
                onChange={(e) => setValores({ ...valores, codigo_barrou: e.target.value })}
              >
                <option value="">escolha a exigência…</option>
                {Object.entries(porGrupo(catalogo)).map(([grupo, lista]) => (
                  <optgroup key={grupo} label={grupo}>
                    {lista.map((e) => (
                      <option key={e.codigo} value={e.codigo}>
                        {e.rotulo}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <span className="text-[11px] text-texto-suave">
                É isso que, lá na frente, mostra qual exigência mais te barra.
              </span>
            </label>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              className="botao-primario"
              onClick={() => {
                const limpo = { ...valores };
                if (limpo.proposta_em) limpo.proposta_em = limpo.proposta_em.replace('T', ' ');
                aoConfirmar(limpo);
              }}
            >
              Mover
            </button>
            <button className="botao" onClick={aoCancelar}>
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
