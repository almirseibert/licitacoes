import { useEffect, useState } from 'react';
import { Loader2, FileSpreadsheet, Info } from 'lucide-react';
import { api } from '../servicos/api';
import { moeda, moedaExata } from '../servicos/formato';

/**
 * Relatório mensal (Fase 14) — quantas disputei, quantas ganhei e o desconto
 * médio das minhas propostas.
 *
 * Três números por mês, e nada mais: é o relatório que responde se vale
 * continuar disputando aquele tipo de licitação, não um painel de indicadores.
 * O desconto é o da **sua** proposta contra o estimado do órgão — não o do
 * vencedor, que é outro número e mora na ficha do concorrente.
 */
export default function Relatorio() {
  const [meses, setMeses] = useState(12);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [baixando, setBaixando] = useState(false);

  useEffect(() => {
    api.relatorioMensal(meses).then(setDados).catch((e) => setErro(e.message));
  }, [meses]);

  const baixar = async () => {
    setBaixando(true);
    try {
      await api.exportarRelatorio(meses);
    } catch (e) {
      setErro(e.message);
    } finally {
      setBaixando(false);
    }
  };

  if (erro && !dados) return <p className="m-4 text-sm text-erro">{erro}</p>;
  if (!dados) return <Loader2 size={16} className="animate-spin text-texto-suave m-4" />;

  const pct = (v) => (v === null || v === undefined ? '—' : `${(Number(v) * 100).toFixed(1)}%`);

  const nomeDoMes = (chave) => {
    const [ano, mes] = String(chave).split('-');
    const d = new Date(Number(ano), Number(mes) - 1, 1);
    return d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-borda flex items-center gap-4 shrink-0 flex-wrap">
        <h1 className="font-titulo text-xl">Relatório mensal</h1>
        <div className="flex items-center gap-1">
          {[6, 12, 24].map((m) => (
            <button
              key={m}
              onClick={() => setMeses(m)}
              className={`px-2 py-0.5 text-xs border rounded ${
                meses === m ? 'border-texto text-texto' : 'border-borda text-texto-suave hover:text-texto'
              }`}
            >
              {m} meses
            </button>
          ))}
        </div>

        <div className="flex items-baseline gap-5 text-xs text-texto-suave">
          <span>
            disputei <span className="font-mono text-texto">{dados.total.disputei}</span>
          </span>
          <span>
            ganhei <span className="font-mono text-ok">{dados.total.ganhei}</span>
          </span>
          <span>
            perdi <span className="font-mono text-erro">{dados.total.perdi}</span>
          </span>
          <span>
            taxa <span className="font-mono text-texto">{pct(dados.total.taxa_vitoria)}</span>
          </span>
          <span className="font-mono text-voltagem">{moeda(dados.total.valor_ganho)} ganhos</span>
        </div>

        <button className="botao flex items-center gap-1 ml-auto" onClick={baixar} disabled={baixando}>
          {baixando ? <Loader2 size={12} className="animate-spin" /> : <FileSpreadsheet size={12} />}
          baixar em Excel
        </button>
      </div>

      {erro && <p className="mx-4 mt-2 px-3 py-2 text-xs border border-erro/40 text-erro rounded bg-erro/5">{erro}</p>}

      <div className="flex-1 overflow-auto p-4 space-y-3">
        <p className="flex items-start gap-2 text-xs text-texto-suave max-w-4xl">
          <Info size={13} className="shrink-0 mt-0.5" />
          {dados.ressalva}
        </p>

        {dados.meses.length === 0 ? (
          <p className="text-sm text-texto-suave max-w-2xl">
            Nenhuma disputa registrada nos últimos {meses} meses. O relatório conta o que passou pelo funil a
            partir de “Proposta enviada” — é o movimento do card que gera o número, não a coleta.
          </p>
        ) : (
          <table className="w-full text-sm max-w-5xl">
            <thead className="text-xs uppercase tracking-wide text-texto-suave border-b border-borda">
              <tr>
                <th className="text-left py-2 font-normal">Mês</th>
                <th className="text-right py-2 font-normal">Disputei</th>
                <th className="text-right py-2 font-normal">Ganhei</th>
                <th className="text-right py-2 font-normal">Perdi</th>
                <th className="text-right py-2 font-normal">Em andamento</th>
                <th className="text-right py-2 font-normal">Taxa</th>
                <th className="text-right py-2 font-normal">Valor ganho</th>
                <th className="text-right py-2 font-normal pl-3">Desconto médio</th>
              </tr>
            </thead>
            <tbody>
              {dados.meses.map((m) => (
                <tr key={m.mes} className="border-b border-borda/40">
                  <td className="py-1.5">{nomeDoMes(m.mes)}</td>
                  <td className="py-1.5 text-right font-mono">{m.disputei}</td>
                  <td className="py-1.5 text-right font-mono text-ok">{m.ganhei || ''}</td>
                  <td className="py-1.5 text-right font-mono text-erro">{m.perdi || ''}</td>
                  <td className="py-1.5 text-right font-mono text-texto-suave">{m.em_andamento || ''}</td>
                  <td className="py-1.5 text-right font-mono">{pct(m.taxa_vitoria)}</td>
                  <td className="py-1.5 text-right font-mono text-voltagem">
                    {m.valor_ganho ? moedaExata(m.valor_ganho) : '—'}
                  </td>
                  <td className="py-1.5 text-right font-mono pl-3">
                    {m.desconto_medio === null ? (
                      <span className="text-texto-suave">sem estimado</span>
                    ) : (
                      <>
                        <span className={m.desconto_medio < 0 ? 'text-atencao' : ''}>{pct(m.desconto_medio)}</span>
                        <span className="ml-1 text-[10px] text-texto-suave">({m.com_desconto})</span>
                        {m.acima_do_estimado > 0 && (
                          <span
                            className="ml-1 text-[10px] text-atencao"
                            title="propostas acima do valor estimado do órgão — entram como desconto negativo"
                          >
                            ↑{m.acima_do_estimado}
                          </span>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="text-[11px] text-texto-suave max-w-4xl">
          O número entre parênteses no desconto é quantas licitações daquele mês tinham os dois valores — sua
          proposta e o estimado do órgão, e a seta para cima é quantas foram acima do estimado, que entram
          como desconto negativo. Mês com poucas não sustenta média: dois registros fazem um desconto atípico
          parecer política de preço.
        </p>
      </div>
    </div>
  );
}
