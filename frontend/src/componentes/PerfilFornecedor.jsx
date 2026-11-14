import { useEffect, useState } from 'react';
import { Loader2, Info } from 'lucide-react';
import { api } from '../servicos/api';
import { moeda, moedaExata, data as comoData, resumir, LACUNA } from '../servicos/formato';
import Barras from './Barras';

/**
 * Perfil por CNPJ no mercado (Seção 13): contratos que a empresa assinou no
 * PNCP, por UF, modalidade e órgão. Disputas perdidas, itens não vencidos e
 * motivos de desclassificação NÃO são públicos no PNCP — a tela diz "não
 * disponível", nunca zero.
 */
export default function PerfilFornecedor({ cnpj }) {
  const [p, setP] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    setP(null);
    setErro(null);
    api.perfilFornecedor(cnpj).then(setP).catch((e) => setErro(e.message));
  }, [cnpj]);

  if (erro) return <p className="text-sm text-erro">{erro}</p>;
  if (!p) return <Loader2 size={16} className="animate-spin text-texto-suave" />;

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <Campo rotulo="Contratos no PNCP" valor={p.contratos} />
        <Campo rotulo="Licitações vencidas" valor={p.vencidas} />
        <Campo rotulo="Valor ganho" valor={moeda(p.valor_ganho)} />
        <Campo rotulo="Disputas" valor="não disponível" nota={p.itens.nota} />
        <Campo rotulo="Itens vencidos (editais lidos)" valor={p.itens.vencidos} />
        <Campo rotulo="Itens não vencidos" valor={p.itens.nao_vencidos ?? 'não disponível'} nota={p.itens.nota} />
        <Campo rotulo="Primeiro contrato" valor={p.primeiro ? comoData(p.primeiro) : LACUNA} />
        <Campo rotulo="Último contrato" valor={p.ultimo ? comoData(p.ultimo) : LACUNA} />
      </dl>

      <p className="flex items-start gap-2 text-[11px] text-texto-suave">
        <Info size={12} className="shrink-0 mt-0.5" />
        <span>
          <strong className="font-normal text-texto">Desclassificação e inabilitação: não disponível.</strong>{' '}
          {p.desclassificacao.motivo}
        </span>
      </p>

      {p.contratos === 0 ? (
        <p className="text-sm text-texto-suave">Nenhum contrato deste CNPJ no banco do mercado (PNCP, RS).</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Barras titulo="Contratos por UF" linhas={p.por_uf} />
            <Barras titulo="Por modalidade" linhas={p.por_modalidade} />
          </div>
          <Barras titulo="Órgãos que mais contrataram" linhas={p.por_orgao} />
          <section>
            <h3 className="text-[11px] uppercase tracking-wide text-texto-suave mb-1.5">Contratos recentes</h3>
            <ul className="space-y-1">
              {p.recentes.map((c) => (
                <li key={c.numero_controle} className="text-xs flex items-baseline gap-2">
                  <span className="font-mono text-texto-suave shrink-0">{comoData(c.data_assinatura)}</span>
                  <span className="flex-1 min-w-0 truncate" title={c.objeto}>
                    {resumir(c.objeto, 70)} <span className="text-texto-suave">· {c.orgao_nome}</span>
                  </span>
                  <span className="font-mono shrink-0">{c.valor_global === null ? LACUNA : moedaExata(c.valor_global)}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function Campo({ rotulo, valor, nota }) {
  return (
    <div className="flex items-baseline gap-2 border-b border-borda/40 py-1" title={nota || undefined}>
      <dt className="text-[11px] uppercase tracking-wide text-texto-suave flex-1">{rotulo}</dt>
      <dd className={`font-mono text-sm ${valor === 'não disponível' ? 'text-texto-suave' : ''}`}>{valor ?? '—'}</dd>
    </div>
  );
}
