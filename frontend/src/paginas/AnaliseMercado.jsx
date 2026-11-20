import { useEffect, useState } from 'react';
import { Loader2, Info } from 'lucide-react';
import { api } from '../servicos/api';
import { moeda, moedaExata, data as comoData, resumir, LACUNA } from '../servicos/formato';
import GavetaFornecedor from '../componentes/GavetaFornecedor';

/**
 * Mercado e concorrentes — refeito em 20/11/2026. A versão anterior tinha seis cartões e seis gráficos do mesmo
 * GROUP BY e não respondia nada. Agora são quatro perguntas, na ordem em que se decide:
 *   1. O que está acontecendo neste segmento? (uma frase e quatro números)
 *   2. Quais contratos vencem logo? (recompra provável — onde a próxima disputa deve aparecer)
 *   3. Que atas aceitam adesão? (carona: compra sem licitação própria)
 *   4. Quem vende, e quanto do mercado cada um tem?
 * O recorte é do catálogo de segmentos (Área › Segmento), não só das palavras-chave da organização. O que o PNCP
 * não publica (desconto por contrato, valor e fornecedor da ata) não aparece — e a tela diz isso.
 */

const PERIODOS = [30, 90, 180, 365];
const VENCIMENTOS = [30, 90, 180];

const pctDe = (v) => (v === null || v === undefined ? '—' : `${(Number(v) * 100).toFixed(1).replace('.', ',')}%`);
const quando = (dias) => (dias <= 0 ? 'hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`);

function Secao({ titulo, subtitulo, acao, children }) {
  return (
    <section className="max-w-6xl">
      <div className="flex items-start gap-3 flex-wrap mb-2">
        <div className="min-w-0">
          <h2 className="font-titulo text-base">{titulo}</h2>
          {subtitulo && <p className="text-xs text-texto-suave max-w-3xl">{subtitulo}</p>}
        </div>
        {acao && <div className="ml-auto">{acao}</div>}
      </div>
      {children}
    </section>
  );
}

function Janelas({ valores, atual, aoMudar, sufixo = 'dias' }) {
  return (
    <div className="flex gap-1">
      {valores.map((v) => (
        <button
          key={v}
          onClick={() => aoMudar(v)}
          className={`px-2 py-0.5 text-xs border rounded ${atual === v ? 'border-texto text-texto' : 'border-borda text-texto-suave hover:text-texto'}`}
        >
          {v} {sufixo}
        </button>
      ))}
    </div>
  );
}

function Numero({ rotulo, valor }) {
  return (
    <div className="border border-borda rounded px-3 py-2 min-w-[7.5rem]">
      <p className="text-[11px] text-texto-suave">{rotulo}</p>
      <p className="font-mono text-lg">{valor}</p>
    </div>
  );
}

export default function AnaliseMercado() {
  const [filtros, setFiltros] = useState({ area: '', segmento: '', uf: '', dias: 90, vence: 90 });
  const [painel, setPainel] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [fornecedor, setFornecedor] = useState(null);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    api
      .painelMercado(filtros)
      .then((r) => {
        if (!vivo) return;
        setPainel(r);
        setErro(null);
      })
      .catch((e) => vivo && setErro(e.message))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [filtros]);

  const mudar = (campo) => (e) => setFiltros((f) => ({ ...f, [campo]: e.target.value }));
  const catalogo = (painel && painel.catalogo) || [];
  const area = catalogo.find((a) => a.area === filtros.area);
  const trocarArea = (e) => setFiltros((f) => ({ ...f, area: e.target.value, segmento: '' }));
  const trocarSegmento = (e) => {
    const nome = e.target.value;
    const dona = catalogo.find((a) => a.segmentos.some((x) => x.nome === nome));
    setFiltros((f) => ({ ...f, segmento: nome, area: dona ? dona.area : f.area }));
  };
  const rotulo = (x) => `${x.area ?? x.nome}${x.n ? ` (${x.n.toLocaleString('pt-BR')})` : ''}`;
  const alguma = Boolean(filtros.area || filtros.segmento || filtros.uf);

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-4 pt-3 pb-3 border-b border-borda">
        <h1 className="font-titulo text-xl">Mercado e concorrentes</h1>
        <p className="text-xs text-texto-suave max-w-3xl">
          O que se compra no seu segmento, quando os contratos vencem e voltam a ser disputados, e quem vende.
        </p>
        <div className="flex flex-wrap items-end gap-3 mt-3 text-sm">
          <label className="flex flex-col gap-0.5 text-[11px] text-texto-suave">
            Área
            <select className="campo-caixa" value={filtros.area} onChange={trocarArea}>
              <option value="">Todas as áreas</option>
              {catalogo.map((a) => (
                <option key={a.area} value={a.area}>{rotulo(a)}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] text-texto-suave">
            Segmento
            <select className="campo-caixa" value={filtros.segmento} onChange={trocarSegmento}>
              <option value="">{area ? `Toda a área ${area.area}` : 'Todos os segmentos'}</option>
              {area
                ? area.segmentos.map((x) => <option key={x.nome} value={x.nome}>{rotulo(x)}</option>)
                : catalogo.map((a) => (
                    <optgroup key={a.area} label={a.area}>
                      {a.segmentos.map((x) => <option key={x.nome} value={x.nome}>{rotulo(x)}</option>)}
                    </optgroup>
                  ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] text-texto-suave">
            UF
            <select className="campo-caixa" value={filtros.uf} onChange={mudar('uf')}>
              <option value="">Todas</option>
              {((painel && painel.ufs) || []).map((u) => <option key={u}>{u}</option>)}
            </select>
          </label>
          <div className="flex flex-col gap-0.5 text-[11px] text-texto-suave">
            Contratos assinados nos últimos
            <Janelas valores={PERIODOS} atual={Number(filtros.dias)} aoMudar={(v) => setFiltros((f) => ({ ...f, dias: v }))} />
          </div>
          {alguma && (
            <button
              type="button"
              className="text-[11px] text-texto-suave hover:text-texto underline pb-1.5"
              onClick={() => setFiltros((f) => ({ ...f, area: '', segmento: '', uf: '' }))}
            >
              limpar
            </button>
          )}
          {carregando && <Loader2 size={14} className="animate-spin text-texto-suave mb-2" />}
        </div>
      </div>

      <div className="p-4 space-y-8">
        {erro && <p className="text-sm text-erro">{erro}</p>}
        {!painel && !erro && <Loader2 size={16} className="animate-spin text-texto-suave" />}

        {painel && (
          <>
            {/* 1. O que está acontecendo */}
            <Secao titulo="O que está acontecendo">
              <p className="font-titulo text-lg leading-snug max-w-4xl" role="status">{painel.frase}</p>
              {painel.totais.contratos > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  <Numero rotulo="Contratos" valor={painel.totais.contratos.toLocaleString('pt-BR')} />
                  <Numero rotulo="Valor contratado" valor={moeda(painel.totais.valor)} />
                  <Numero rotulo="Órgãos" valor={painel.totais.orgaos.toLocaleString('pt-BR')} />
                  <Numero rotulo="Fornecedores" valor={painel.totais.fornecedores.toLocaleString('pt-BR')} />
                  <Numero
                    rotulo="Desconto típico (pregão)"
                    valor={painel.desconto && painel.desconto.mediano !== null ? pctDe(painel.desconto.mediano) : LACUNA}
                  />
                </div>
              )}
              {painel.compradores.length > 0 && (
                <div className="mt-3 max-w-3xl">
                  <p className="text-[11px] text-texto-suave mb-1">Quem mais comprou no período</p>
                  <ul className="text-sm divide-y divide-borda/40 border border-borda rounded">
                    {painel.compradores.map((c) => (
                      <li key={c.cnpj} className="flex items-baseline gap-3 px-3 py-1.5">
                        <span className="flex-1 min-w-0 truncate">{c.nome}</span>
                        <span className="font-mono text-xs text-texto-suave">{c.contratos} contr.</span>
                        <span className="font-mono">{moeda(c.valor)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Secao>

            {/* 2. Contratos que vencem */}
            <Secao
              titulo="Contratos que vencem — onde a próxima disputa deve aparecer"
              subtitulo={
                painel.vencendo.total
                  ? `${painel.vencendo.total.toLocaleString('pt-BR')} contratos (${moeda(painel.vencendo.valor)}) terminam nos próximos ${painel.recorte.vence} dias. ` +
                    'Quando o contrato acaba, o órgão costuma comprar de novo: é a hora de se preparar.'
                  : `Nenhum contrato deste recorte termina nos próximos ${painel.recorte.vence} dias entre os coletados.`
              }
              acao={<Janelas valores={VENCIMENTOS} atual={Number(filtros.vence)} aoMudar={(v) => setFiltros((f) => ({ ...f, vence: v }))} sufixo="dias" />}
            >
              {painel.vencendo.dados.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[720px]">
                    <thead className="text-xs uppercase tracking-wide text-texto-suave border-b border-borda">
                      <tr>
                        <th className="text-left py-2 font-normal">Vence</th>
                        <th className="text-left py-2 font-normal">Órgão</th>
                        <th className="text-left py-2 font-normal">Objeto</th>
                        <th className="text-right py-2 font-normal">Valor</th>
                        <th className="text-left py-2 pl-3 font-normal">Fornecedor atual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {painel.vencendo.dados.map((v) => (
                        <tr key={v.id} className="border-b border-borda/40 align-top">
                          <td className="py-1.5 pr-3 whitespace-nowrap">
                            {comoData(v.vigencia_fim)}
                            <span className="block text-[11px] text-texto-suave">{quando(v.dias)}</span>
                          </td>
                          <td className="py-1.5 pr-3 text-xs max-w-[14rem]">
                            {v.orgao_nome}
                            <span className="block text-texto-suave">{[v.municipio, v.uf].filter(Boolean).join(' · ')}</span>
                          </td>
                          <td className="py-1.5 pr-3 max-w-[24rem]">
                            <span className="line-clamp-2">{resumir(v.objeto, 160)}</span>
                            {v.segmento && <span className="text-[11px] text-texto-suave">{v.segmento}</span>}
                          </td>
                          <td className="py-1.5 text-right font-mono whitespace-nowrap">{v.valor_global === null ? LACUNA : moedaExata(v.valor_global)}</td>
                          <td className="py-1.5 pl-3 text-xs">
                            {String(v.fornecedor_ni || '').length === 14 ? (
                              <button className="text-left hover:text-voltagem" onClick={() => setFornecedor({ cnpj: v.fornecedor_ni, empresa: v.fornecedor_nome })}>
                                {v.fornecedor_nome || v.fornecedor_ni}
                              </button>
                            ) : (
                              <span>{v.fornecedor_nome || LACUNA}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {painel.vencendo.total > painel.vencendo.dados.length && (
                    <p className="mt-1 text-[11px] text-texto-suave">
                      Mostrando os {painel.vencendo.dados.length} que vencem primeiro, de {painel.vencendo.total.toLocaleString('pt-BR')}. Estreite pelo segmento ou pela UF.
                    </p>
                  )}
                </div>
              )}
            </Secao>

            {/* 3. Atas com adesão */}
            <Secao
              titulo="Atas vigentes que aceitam adesão (carona)"
              subtitulo={
                painel.atas.total
                  ? `${painel.atas.total.toLocaleString('pt-BR')} atas permitem que outros órgãos comprem pelo mesmo registro de preços, sem licitação própria. ` +
                    'O PNCP não publica o fornecedor nem o valor da ata: abra a ata no portal para ver.'
                  : 'Nenhuma ata vigente com adesão neste recorte entre as coletadas.'
              }
            >
              {painel.atas.dados.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead className="text-xs uppercase tracking-wide text-texto-suave border-b border-borda">
                      <tr>
                        <th className="text-left py-2 font-normal">Vigente até</th>
                        <th className="text-left py-2 font-normal">Órgão</th>
                        <th className="text-left py-2 font-normal">Objeto</th>
                        <th className="text-left py-2 font-normal pl-3">Fornecedor / valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {painel.atas.dados.map((a) => (
                        <tr key={a.id} className="border-b border-borda/40 align-top">
                          <td className="py-1.5 pr-3 whitespace-nowrap">
                            {comoData(a.vigencia_fim)}
                            <span className="block text-[11px] text-texto-suave">{quando(a.dias)}</span>
                          </td>
                          <td className="py-1.5 pr-3 text-xs max-w-[14rem]">
                            {a.orgao_nome}
                            <span className="block text-texto-suave">{[a.municipio, a.uf].filter(Boolean).join(' · ')}</span>
                          </td>
                          <td className="py-1.5 pr-3 max-w-[26rem]"><span className="line-clamp-2">{resumir(a.objeto, 160)}</span></td>
                          <td className="py-1.5 pl-3 text-xs text-texto-suave">{LACUNA}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Secao>

            {/* 4. Quem vende */}
            <Secao
              titulo="Quem vende neste recorte"
              subtitulo="Fornecedores por valor contratado no período, e a fatia de cada um. Clique no nome para ver onde mais vende. Só CNPJ: pessoa física não é agrupada."
            >
              {painel.concorrentes.length === 0 ? (
                <p className="text-sm text-texto-suave">Nenhum fornecedor com CNPJ neste recorte.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead className="text-xs uppercase tracking-wide text-texto-suave border-b border-borda">
                      <tr>
                        <th className="text-left py-2 font-normal">Empresa</th>
                        <th className="text-right py-2 font-normal">Contratos</th>
                        <th className="text-right py-2 font-normal">Valor</th>
                        <th className="text-right py-2 font-normal">Fatia</th>
                        <th className="text-right py-2 font-normal">Órgãos</th>
                        <th className="text-left py-2 pl-4 font-normal">UFs</th>
                        <th className="text-right py-2 font-normal">Último</th>
                      </tr>
                    </thead>
                    <tbody>
                      {painel.concorrentes.map((c) => (
                        <tr key={c.cnpj} className="border-b border-borda/40">
                          <td className="py-1.5 pr-3">
                            <button className="text-left hover:text-voltagem" onClick={() => setFornecedor({ cnpj: c.cnpj, empresa: c.empresa })}>
                              {c.empresa || c.cnpj}
                            </button>
                            {c.no_dossie && <span className="ml-1.5 text-[11px] text-texto-suave">no dossiê</span>}
                          </td>
                          <td className="py-1.5 text-right font-mono">{c.contratos}</td>
                          <td className="py-1.5 text-right font-mono whitespace-nowrap">{moeda(c.valor)}</td>
                          <td className="py-1.5 text-right font-mono">{pctDe(c.participacao)}</td>
                          <td className="py-1.5 text-right font-mono">{c.orgaos}</td>
                          <td className="py-1.5 pl-4 text-xs text-texto-suave max-w-[10rem] truncate">{c.ufs}</td>
                          <td className="py-1.5 text-right text-xs whitespace-nowrap">{comoData(c.ultimo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Secao>

            <p className="flex items-start gap-2 text-[11px] text-texto-suave max-w-4xl">
              <Info size={12} className="shrink-0 mt-0.5" />
              <span>
                Os números vêm da coleta do PNCP para as UFs configuradas; contrato anterior à primeira coleta não aparece. O segmento sai do
                texto do objeto (dicionário de termos, sem IA) e há contratos sem assunto reconhecido, que ficam de fora dos segmentos. Desconto por
                contrato, e fornecedor e valor da ata, o PNCP não publica. Seu histórico de perdas está em Desempenho.
              </span>
            </p>
          </>
        )}
      </div>

      <GavetaFornecedor fornecedor={fornecedor} aoFechar={() => setFornecedor(null)} />
    </div>
  );
}
