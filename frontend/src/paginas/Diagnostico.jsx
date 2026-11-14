import { useEffect, useState } from 'react';
import { Loader2, CalendarX, ExternalLink } from 'lucide-react';
import { api } from '../servicos/api';
import { moeda, moedaExata, dataHora, resumir } from '../servicos/formato';

/**
 * Tela de diagnóstico de descarte (seção 20.2).
 *
 * O desenho é o da spec, e de propósito: uma lista com pontilhado até o número,
 * ordenada por quantas vezes o bloqueio apareceu. Nenhum gráfico — o que se faz
 * com esses números é ler a primeira linha e decidir o que resolver, e para
 * isso a barra colorida não ajuda.
 *
 * A coluna "resolver" é a tabela 20.3. É ela que transforma a lamentação em
 * conta: ao lado de "23 licitações, R$ 1.284.000", saber que o atestado sai de
 * um contrato pequeno por dispensa é o que faz a decisão acontecer.
 */
export default function Diagnostico({ aoAbrir }) {
  const [periodo, setPeriodo] = useState(90);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [aberto, setAberto] = useState(null);

  const carregar = async (dias = periodo) => {
    try {
      setDados(await api.diagnostico(dias));
      setErro(null);
    } catch (e) {
      setErro(e.message);
    }
  };

  useEffect(() => {
    carregar(periodo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo]);

  const fecharVencidas = async () => {
    setOcupado(true);
    setAviso(null);
    try {
      const r = await api.descartarVencidas();
      setAviso(r.mensagem);
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(false);
    }
  };

  if (erro && !dados) return <p className="m-4 text-sm text-erro">{erro}</p>;
  if (!dados) return <Loader2 size={16} className="animate-spin text-texto-suave m-4" />;

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-borda flex items-center gap-4 shrink-0 flex-wrap">
        <h1 className="font-titulo text-xl">Diagnóstico</h1>
        <div className="flex items-center gap-1">
          {dados.periodos.map((p) => (
            <button
              key={p.dias}
              onClick={() => setPeriodo(p.dias)}
              className={`px-2 py-0.5 text-xs border rounded ${
                periodo === p.dias
                  ? 'border-texto text-texto'
                  : 'border-borda text-texto-suave hover:text-texto'
              }`}
            >
              {p.rotulo}
            </button>
          ))}
        </div>
        <p className="text-xs text-texto-suave">
          {dados.total.descartadas} descartadas no período · {dados.total.analisadas} com motivo
        </p>
        <button
          className="botao flex items-center gap-1 ml-auto"
          onClick={fecharVencidas}
          disabled={ocupado}
          title="Fecha as licitações de pontuação baixa que venceram o prazo sem ninguém analisar (seção 20.4)."
        >
          {ocupado ? <Loader2 size={12} className="animate-spin" /> : <CalendarX size={12} />}
          fechar vencidas
        </button>
      </div>

      {erro && <p className="mx-4 mt-2 px-3 py-2 text-xs border border-erro/40 text-erro rounded bg-erro/5">{erro}</p>}
      {aviso && (
        <p className="mx-4 mt-2 px-3 py-2 text-xs border border-borda bg-superficie rounded text-texto-suave">
          {aviso}
        </p>
      )}

      <div className="flex-1 overflow-auto p-4 space-y-8">
        <section>
          <h2 className="font-titulo text-base mb-3">
            O que mais te barrou nos últimos {dados.periodo.rotulo}
          </h2>

          {dados.bloqueios.length === 0 ? (
            <p className="text-sm text-texto-suave max-w-2xl">
              Nenhum descarte com motivo no período. Esta tela se alimenta do que você responde ao soltar um
              card em “Descartada” no funil — e, quando o motivo é exigência ou documento, de qual código
              barrou. É esse campo que faz o ranking existir.
            </p>
          ) : (
            <ul className="space-y-1">
              {dados.bloqueios.map((b) => (
                <li key={b.chave}>
                  <button
                    className="w-full text-left flex items-baseline gap-2 py-1 hover:bg-realce/[0.03] px-1 -mx-1 rounded"
                    onClick={() => setAberto(aberto === b.chave ? null : b.chave)}
                  >
                    <span className="text-sm shrink-0">{b.rotulo}</span>
                    {/* O pontilhado até o número é o desenho da seção 20.2:
                        guia o olho da exigência para o valor sem precisar de
                        barra nem de cor. */}
                    <span className="flex-1 border-b border-dotted border-texto-suave/40 translate-y-[-3px]" />
                    <span className="font-mono text-sm shrink-0 w-28 text-right">
                      {b.licitacoes} licitaç{b.licitacoes === 1 ? 'ão' : 'ões'}
                    </span>
                    <span className="font-mono text-sm shrink-0 w-32 text-right text-voltagem">
                      {moeda(b.valor)}
                    </span>
                  </button>

                  {aberto === b.chave && (
                    <div className="ml-1 mb-2 pl-3 border-l border-borda space-y-2 py-2">
                      {b.resolver ? (
                        <p className="text-xs text-texto-suave max-w-2xl">
                          <span className="text-texto">Como resolver:</span> {b.resolver} ·{' '}
                          <span className="font-mono">custo {b.custo_rotulo.toLowerCase()}</span>
                          {b.nota && <span className="block mt-0.5">{b.nota}</span>}
                        </p>
                      ) : (
                        <p className="text-xs text-texto-suave">
                          Sem caminho padrão de solução — veja as licitações abaixo para entender o caso.
                        </p>
                      )}
                      <p className="text-xs text-texto-suave">
                        Valor disputável ao desconto mediano do grupo:{' '}
                        <span className="font-mono text-texto">{moedaExata(b.disputavel)}</span>
                        {b.com_referencia < b.licitacoes && (
                          <span>
                            {' '}
                            — {b.licitacoes - b.com_referencia} sem mediana medida, entrou pelo valor estimado
                          </span>
                        )}
                      </p>
                      <ul className="space-y-0.5">
                        {b.exemplos.map((e) => (
                          <li key={e.id} className="text-xs flex items-baseline gap-2">
                            <button
                              className="text-texto-suave hover:text-texto flex items-baseline gap-1 text-left"
                              onClick={() => aoAbrir && aoAbrir(e.id)}
                            >
                              <ExternalLink size={10} className="shrink-0 translate-y-0.5" />
                              {resumir(e.objeto, 90)}
                            </button>
                            <span className="font-mono text-texto-suave shrink-0 ml-auto">
                              {moeda(e.valor_estimado)}
                            </span>
                            <span className="font-mono text-texto-suave shrink-0 w-24 text-right">
                              {dataHora(e.descartado_em)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {dados.simulacoes.length > 0 && (
          <section>
            <h2 className="font-titulo text-base mb-3">Simulação</h2>
            <div className="space-y-4 max-w-3xl">
              {dados.simulacoes.map((s) => (
                <div key={s.chave} className="border border-borda rounded p-3 bg-superficie/40">
                  <p className="text-sm">
                    Se você tivesse <span className="uppercase tracking-wide">{s.rotulo}</span>,
                  </p>
                  <p className="text-sm text-texto-suave mt-1">
                    <span className="font-mono text-texto">{s.licitacoes}</span> licitaç
                    {s.licitacoes === 1 ? 'ão' : 'ões'} a mais {s.licitacoes === 1 ? 'teria' : 'teriam'} sido
                    elegíve{s.licitacoes === 1 ? 'l' : 'is'} —{' '}
                    <span className="font-mono text-texto">{moedaExata(s.valor)}</span> em valor estimado, e ao
                    desconto mediano do grupo, cerca de{' '}
                    <span className="font-mono text-voltagem">{moedaExata(s.disputavel)}</span> em contratos
                    disputáveis
                    {s.parcial && ' (parte do grupo ainda sem mediana medida)'}.
                  </p>
                  {s.resolver && (
                    <p className="text-xs text-texto-suave mt-2">
                      {s.resolver} · <span className="font-mono">custo {s.custo_rotulo.toLowerCase()}</span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="font-titulo text-base mb-2">Venceram sem análise</h2>
          <p className="text-sm text-texto-suave max-w-3xl">
            <span className="font-mono text-texto">{dados.nao_analisadas.licitacoes}</span> licitaç
            {dados.nao_analisadas.licitacoes === 1 ? 'ão' : 'ões'} de pontuação baixa venceram o prazo sem
            ninguém olhar, somando{' '}
            <span className="font-mono text-texto">{moedaExata(dados.nao_analisadas.valor)}</span> estimados.
            Não entram no ranking acima — nada barrou, ninguém analisou — e contam no total.
          </p>
          {dados.nao_analisadas.recado && (
            <p className="mt-2 px-3 py-2 text-xs border border-atencao/40 text-atencao rounded bg-atencao/5 max-w-3xl">
              {dados.nao_analisadas.recado}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
