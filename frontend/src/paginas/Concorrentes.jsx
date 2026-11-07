import { useEffect, useState } from 'react';
import { Loader2, RefreshCcw, ExternalLink, Building2 } from 'lucide-react';
import { api } from '../servicos/api';
import { moedaExata, resumir } from '../servicos/formato';

/**
 * Aba de concorrentes da licitação (seções 12 e 26).
 *
 * O que o painel tem hoje é o vencedor por item, que o PNCP publica em API
 * aberta. A lista completa das propostas é do Compras.gov.br e está atrás de
 * CAPTCHA (seção 5.2) — a tela diz isso em vez de mostrar uma aba vazia, e
 * entrega o link para abrir à mão.
 */
export default function Concorrentes({ id }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [buscando, setBuscando] = useState(false);

  const carregar = () =>
    api
      .concorrentesDa(id)
      .then((r) => {
        setDados(r);
        setErro(null);
      })
      .catch((e) => setErro(e.message));

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const buscar = async () => {
    setBuscando(true);
    try {
      const r = await api.buscarResultados(id);
      setAviso(r.mensagem);
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setBuscando(false);
    }
  };

  if (erro && !dados) return <p className="text-sm text-erro">{erro}</p>;
  if (!dados) return <Loader2 size={16} className="animate-spin text-texto-suave" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button className="botao flex items-center gap-1" onClick={buscar} disabled={buscando}>
          {buscando ? <Loader2 size={12} className="animate-spin" /> : <RefreshCcw size={12} />}
          buscar resultado no portal
        </button>
        {dados.link_propostas && (
          <a
            href={dados.link_propostas}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-voltagem flex items-center gap-1"
          >
            ver todas as propostas no portal <ExternalLink size={11} />
          </a>
        )}
        {dados.plataforma && (
          <span className="text-xs text-texto-suave ml-auto">disputa em {dados.plataforma}</span>
        )}
      </div>

      {erro && <p className="text-xs text-erro">{erro}</p>}
      {aviso && (
        <p className="px-3 py-2 text-xs border border-borda bg-superficie rounded text-texto-suave">{aviso}</p>
      )}
      {dados.aviso && !dados.dados.length && (
        <p className="text-sm text-texto-suave">{dados.aviso}</p>
      )}

      {dados.empresas.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wide text-texto-suave mb-2">
            Empresas ({dados.empresas.length})
          </h3>
          <ul className="space-y-1.5">
            {dados.empresas.map((e) => (
              <li key={e.cnpj || e.empresa} className="border border-borda rounded px-3 py-2">
                <div className="flex items-baseline gap-2">
                  <Building2 size={13} className="text-texto-suave shrink-0" />
                  <p className="text-sm flex-1">{e.empresa || '—'}</p>
                  <span className="font-mono text-sm text-voltagem">{moedaExata(e.total)}</span>
                </div>
                <p className="text-[11px] text-texto-suave mt-0.5 pl-5 font-mono">
                  {e.cnpj || 'sem CNPJ'} · {e.itens} item(ns)
                  {e.me_epp ? ' · ME/EPP' : ''}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {dados.dados.length > 0 && (
        <section>
          <h3 className="text-xs uppercase tracking-wide text-texto-suave mb-2">Por item</h3>
          <table className="w-full text-xs">
            <thead className="text-texto-suave border-b border-borda">
              <tr>
                <th className="text-left py-1 font-normal">Item</th>
                <th className="text-left py-1 font-normal">Fornecedor</th>
                <th className="text-right py-1 font-normal">Estimado</th>
                <th className="text-right py-1 font-normal">Homologado</th>
                <th className="text-right py-1 font-normal">Desconto</th>
              </tr>
            </thead>
            <tbody>
              {dados.dados.map((l) => {
                const estimado = Number(l.valor_unit_estimado);
                const fechado = Number(l.valor_negociado ?? l.valor_ofertado);
                const desconto =
                  Number.isFinite(estimado) && estimado > 0 && Number.isFinite(fechado)
                    ? ((estimado - fechado) / estimado) * 100
                    : null;
                return (
                  <tr key={l.id} className="border-b border-borda/40">
                    <td className="py-1 font-mono align-top">{l.item_numero}</td>
                    <td className="py-1 align-top">
                      <span>{l.empresa || '—'}</span>
                      <span className="block text-[11px] text-texto-suave font-mono">
                        {l.cnpj || '—'}
                        {l.me_epp ? ' · ME/EPP' : ''}
                        {l.situacao ? ` · ${l.situacao}` : ''}
                      </span>
                      {l.descricao && (
                        <span className="block text-[11px] text-texto-suave">{resumir(l.descricao, 70)}</span>
                      )}
                    </td>
                    <td className="py-1 text-right font-mono align-top">{moedaExata(l.valor_unit_estimado)}</td>
                    <td className="py-1 text-right font-mono align-top">{moedaExata(fechado)}</td>
                    <td
                      className={`py-1 text-right font-mono align-top ${
                        desconto === null ? '' : desconto > 0 ? 'text-ok' : 'text-atencao'
                      }`}
                    >
                      {desconto === null ? '—' : `${desconto.toFixed(0)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-[11px] text-texto-suave mt-2">
            Valores unitários, do resultado homologado do PNCP. O portal publica quem ficou com cada item —
            em registro de preços, mais de um fornecedor por item —, não as propostas que perderam.
          </p>
        </section>
      )}
    </div>
  );
}
