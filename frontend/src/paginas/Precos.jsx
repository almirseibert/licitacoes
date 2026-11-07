import { useEffect, useState } from 'react';
import { Loader2, RefreshCcw, Download, Building2 } from 'lucide-react';
import { api } from '../servicos/api';
import { moedaExata, data } from '../servicos/formato';

/**
 * Tela de preço de referência e concorrentes (seção 12).
 *
 * Duas tabelas e nenhum gráfico, de propósito: o que se faz com estes números
 * é comparar linha por linha antes de montar preço. O grifo é só na coluna que
 * decide, a mediana.
 */
export default function Precos() {
  const [dados, setDados] = useState(null);
  const [concorrentes, setConcorrentes] = useState([]);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(null);

  const carregar = async () => {
    try {
      const [r, c] = await Promise.all([api.precosReferencia(), api.concorrentes({ limite: 30 })]);
      setDados(r);
      setConcorrentes(c.dados || []);
      setErro(null);
    } catch (e) {
      setErro(e.message);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const rodar = async (qual) => {
    setOcupado(qual);
    setAviso(null);
    try {
      const r = qual === 'coletar' ? await api.coletarEncerradas({ paginas: 2 }) : await api.recalcularPrecos();
      setAviso(r.mensagem);
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(null);
    }
  };

  if (erro && !dados) return <p className="m-4 text-sm text-erro">{erro}</p>;
  if (!dados) return <Loader2 size={16} className="animate-spin text-texto-suave m-4" />;

  const pct = (v) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(0)}%`);

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-borda flex items-center gap-4 shrink-0 flex-wrap">
        <h1 className="font-titulo text-xl">Preço de referência</h1>
        <p className="text-xs text-texto-suave">
          {dados.amostra.encerradas} contratações encerradas na amostra
          {dados.amostra.de && ` · de ${data(dados.amostra.de)} a ${data(dados.amostra.ate)}`}
          {dados.amostra.sem_homologacao
            ? ` · ${dados.amostra.sem_homologacao} desertas ou fracassadas`
            : ''}
        </p>
        <div className="ml-auto flex items-center gap-2">
          <button
            className="botao flex items-center gap-1"
            onClick={() => rodar('recalcular')}
            disabled={Boolean(ocupado)}
          >
            {ocupado === 'recalcular' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCcw size={12} />}
            recalcular
          </button>
          <button
            className="botao-primario flex items-center gap-1"
            onClick={() => rodar('coletar')}
            disabled={Boolean(ocupado)}
            title="Varre o PNCP por contratações encerradas. Leva minutos: a coleta anda devagar de propósito."
          >
            {ocupado === 'coletar' ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            coletar encerradas
          </button>
        </div>
      </div>

      {erro && <p className="mx-4 mt-2 px-3 py-2 text-xs border border-erro/40 text-erro rounded bg-erro/5">{erro}</p>}
      {aviso && (
        <p className="mx-4 mt-2 px-3 py-2 text-xs border border-borda bg-superficie rounded text-texto-suave">
          {aviso}
        </p>
      )}

      <div className="flex-1 overflow-auto p-4 space-y-6">
        <section>
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-texto-suave border-b border-borda">
              <tr>
                <th className="text-left py-2 font-normal">Grupo</th>
                <th className="text-left py-2 font-normal">Modalidade</th>
                <th className="text-right py-2 font-normal">Desconto mediano</th>
                <th className="text-right py-2 font-normal">1º quartil</th>
                <th className="text-right py-2 font-normal">3º quartil</th>
                <th className="text-right py-2 font-normal">Fechou acima</th>
                <th className="text-right py-2 font-normal">Desertas</th>
                <th className="text-right py-2 font-normal">Amostra</th>
                <th className="text-left py-2 font-normal pl-3">Origem</th>
              </tr>
            </thead>
            <tbody>
              {dados.dados.map((l) => (
                <tr key={l.id} className="border-b border-borda/40">
                  <td className="py-1.5">{l.grupo}</td>
                  <td className="py-1.5">{l.familia}</td>
                  <td className="py-1.5 text-right font-mono text-voltagem">{pct(l.desconto_mediano)}</td>
                  <td className="py-1.5 text-right font-mono">{pct(l.desconto_q1)}</td>
                  <td className="py-1.5 text-right font-mono">{pct(l.desconto_q3)}</td>
                  <td className="py-1.5 text-right font-mono">{pct(l.pct_acima_estimado)}</td>
                  <td className="py-1.5 text-right font-mono">{pct(l.pct_sem_homologacao)}</td>
                  <td
                    className={`py-1.5 text-right font-mono ${
                      l.origem === 'calculado' && l.amostra < dados.minimo ? 'text-atencao' : ''
                    }`}
                    title={
                      l.origem === 'calculado' && l.amostra < dados.minimo
                        ? `Abaixo do mínimo de ${dados.minimo}: o painel ainda usa o levantamento nesta linha.`
                        : undefined
                    }
                  >
                    {l.amostra || '—'}
                  </td>
                  <td className="py-1.5 pl-3 text-xs text-texto-suave">
                    {l.origem === 'estudo' ? 'levantamento' : 'medido aqui'}
                    {l.apurado_em && <span className="block">{data(l.apurado_em)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="mt-3 space-y-0.5 text-xs text-texto-suave">
            {dados.contexto.map((frase) => (
              <li key={frase}>· {frase}</li>
            ))}
            <li>
              · Linha de levantamento é o estudo de 10/10/2026 sobre 1.371 contratações; linha medida aqui sai
              da amostra do painel, e só passa a valer com {dados.minimo} contratações ou mais.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="font-titulo text-base mb-2">Quem você encontra</h2>
          {concorrentes.length === 0 ? (
            <p className="text-sm text-texto-suave">
              Nenhum concorrente registrado ainda. Abra uma licitação já homologada e use “buscar resultado no
              portal” na aba Concorrentes.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-texto-suave border-b border-borda">
                <tr>
                  <th className="text-left py-2 font-normal">Empresa</th>
                  <th className="text-left py-2 font-normal">CNPJ</th>
                  <th className="text-right py-2 font-normal">Licitações</th>
                  <th className="text-right py-2 font-normal">Levou</th>
                </tr>
              </thead>
              <tbody>
                {concorrentes.map((c) => (
                  <tr key={c.cnpj} className="border-b border-borda/40">
                    <td className="py-1.5">
                      <span className="flex items-center gap-1.5">
                        <Building2 size={12} className="text-texto-suave shrink-0" />
                        {c.empresa || '—'}
                        {c.me_epp ? <span className="text-[11px] text-texto-suave">ME/EPP</span> : null}
                      </span>
                    </td>
                    <td className="py-1.5 font-mono text-xs">{c.cnpj}</td>
                    <td className="py-1.5 text-right font-mono">{c.licitacoes}</td>
                    <td className="py-1.5 text-right font-mono">{moedaExata(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
