import { useEffect, useState } from 'react';
import { Loader2, Info, Lightbulb } from 'lucide-react';
import { api } from '../servicos/api';
import { moeda, moedaExata, resumir, LACUNA } from '../servicos/formato';

/**
 * "Por que perdi": motivo, recomendação, quem venceu, diferença de preço e o que mais impediu de disputar.
 * Vivia na aba "Meu histórico" de Mercado e concorrentes; em 20/11/2026 foi para Meu desempenho e se fundiu à antiga
 * tabela "Por que perdi" (mesma regra de motivo). O período é o da página — `de`/`ate` —, para os números concordarem
 * com os cartões de cima; sem eles, últimos 12 meses.
 */
const pct = (v, casas = 1) => (v === null || v === undefined ? '—' : `${(Number(v) * 100).toFixed(casas)}%`);

export default function HistoricoDePerdas({ de = null, ate = null, aoFornecedor, aoAbrir }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let vivo = true;
    setDados(null);
    api
      .historicoPerdas({ de, ate })
      .then((r) => vivo && (setDados(r), setErro(null)))
      .catch((e) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, [de, ate]);

  const t = dados && dados.total;

  return (
    <div className="space-y-4 max-w-5xl">
      {erro && <p className="text-sm text-erro">{erro}</p>}
      {!dados && !erro && <Loader2 size={16} className="animate-spin text-texto-suave" />}
      {dados && (
      <>

      {t.perdidas === 0 ? (
        <p className="text-sm text-texto-suave max-w-2xl">
          Nenhuma licitação em “Perdemos” no período. O histórico conta o que você moveu no funil — é o card que gera o número.
        </p>
      ) : (
        <>
          {dados.principal && (
            <div className="flex items-start gap-2 border border-voltagem/40 rounded p-3 text-sm">
              <Lightbulb size={14} className="shrink-0 mt-0.5 text-voltagem" />
              <p>
                <strong className="font-normal">Motivo mais frequente: {dados.principal.rotulo.toLowerCase()}</strong> (
                {dados.principal.quantidade} de {t.perdidas}). {dados.principal.recomendacao}
              </p>
            </div>
          )}

          <section>
            <h2 className="text-sm mb-2">Motivos de perda</h2>
            <ul className="space-y-2">
              {dados.motivos.map((m) => (
                <li key={m.motivo} className="border border-borda rounded p-2.5">
                  <div className="flex items-baseline gap-2 text-sm">
                    <span className="flex-1">{m.rotulo}</span>
                    <span className="font-mono">{m.quantidade}</span>
                    <span className="font-mono text-texto-suave w-14 text-right">{m.percentual}%</span>
                  </div>
                  <span className="block h-1.5 mt-1">
                    <span className="block h-1.5 rounded-r bg-voltagem" style={{ width: `${Math.max(1, m.percentual)}%` }} />
                  </span>
                  <p className="text-xs text-texto-suave mt-1.5">
                    {m.diferenca_media !== null && <>Diferença média para o vencedor: {pct(m.diferenca_media)}. </>}
                    {m.recomendacao}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {dados.quem_mais_venceu.length > 0 && (
            <section>
              <h2 className="text-sm mb-2">Quem mais me venceu</h2>
              <ul className="text-sm space-y-1">
                {dados.quem_mais_venceu.map((v) => (
                  <li key={v.cnpj || v.empresa} className="flex items-baseline gap-2">
                    {v.cnpj && String(v.cnpj).replace(/\D/g, '').length === 14 ? (
                      <button className="text-left hover:text-voltagem flex-1" onClick={() => aoFornecedor({ cnpj: v.cnpj, empresa: v.empresa })}>
                        {v.empresa || v.cnpj}
                      </button>
                    ) : (
                      <span className="flex-1">{v.empresa || LACUNA}</span>
                    )}
                    <span className="font-mono">{v.vezes}×</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="overflow-x-auto">
            <h2 className="text-sm mb-2">Licitações perdidas</h2>
            <table className="w-full text-sm min-w-[640px]">
              <thead className="text-xs uppercase tracking-wide text-texto-suave border-b border-borda">
                <tr>
                  <th className="text-left py-2 font-normal">Objeto</th>
                  <th className="text-right py-2 font-normal">Minha proposta</th>
                  <th className="text-right py-2 font-normal">Vencedor</th>
                  <th className="text-right py-2 font-normal">Diferença</th>
                  <th className="text-left py-2 font-normal pl-3">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {dados.perdas.map((p) => (
                  <tr key={p.id} className="border-b border-borda/40">
                    <td className="py-1.5 pr-2">
                      <button className="text-left hover:text-voltagem" onClick={() => aoAbrir && aoAbrir(p.id)}>
                        {resumir(p.objeto, 60)}
                      </button>
                      <span className="block text-[11px] text-texto-suave">{p.orgao_nome}</span>
                    </td>
                    <td className="py-1.5 text-right font-mono whitespace-nowrap">{p.valor_proposto === null ? LACUNA : moedaExata(p.valor_proposto)}</td>
                    <td className="py-1.5 text-right font-mono whitespace-nowrap">{p.valor_final === null ? LACUNA : moedaExata(p.valor_final)}</td>
                    <td className="py-1.5 text-right font-mono">{p.diferenca === null ? '—' : pct(p.diferenca)}</td>
                    <td className="py-1.5 pl-3 text-xs">{p.rotulo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}

      {dados.bloqueios.length > 0 && (
        <section>
          <h2 className="text-sm mb-1">O que mais me impediu de disputar (últimos 90 dias)</h2>
          <p className="text-[11px] text-texto-suave mb-2">Do diagnóstico de descarte — o detalhe e a simulação ficam na tela Diagnóstico.</p>
          <ul className="space-y-1.5 text-sm">
            {dados.bloqueios.map((b) => (
              <li key={b.rotulo} className="border-b border-borda/40 pb-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="flex-1">{b.rotulo}</span>
                  <span className="font-mono">{b.licitacoes}</span>
                  <span className="font-mono text-texto-suave">{moeda(b.valor)}</span>
                </div>
                {b.resolver && (
                  <p className="text-xs text-texto-suave">
                    {b.resolver}
                    {b.custo_rotulo && <> · custo {b.custo_rotulo}</>}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="flex items-start gap-2 text-[11px] text-texto-suave">
        <Info size={12} className="shrink-0 mt-0.5" />
        <span>
          <strong className="font-normal text-texto">Motivos de desclassificação e inabilitação: não disponível.</strong>{' '}
          {dados.desclassificacao.motivo} Por isso “não foi preço” não diz qual documento faltou.
        </span>
      </p>
      </>
      )}
    </div>
  );
}
