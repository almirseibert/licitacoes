import { useCallback, useEffect, useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import { api } from '../servicos/api';
import { data as formatarData } from '../servicos/formato';

// Os limites que aparecem no cartão de cada plano (o resto fica no "Uso").
const LIMITES_NO_CARTAO = ['usuarios', 'palavras_chave', 'ia_resumos_mes', 'cofre_gb'];
const ROTULO_LIMITE = {
  usuarios: 'usuários',
  palavras_chave: 'palavras-chave',
  ia_resumos_mes: 'leituras por IA/mês',
  cofre_gb: 'GB no cofre',
};
const SITUACAO = {
  teste: { rotulo: 'Teste grátis', cor: 'text-voltagem' },
  ativa: { rotulo: 'Ativa', cor: 'text-ok' },
  teste_vencido: { rotulo: 'Teste encerrado', cor: 'text-atencao' },
  vencida: { rotulo: 'Vencida', cor: 'text-atencao' },
  suspensa: { rotulo: 'Suspensa', cor: 'text-erro' },
};

function reais(centavos) {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function numero(v) {
  return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

/** Barra de uso: só cor de estado, o número vai escrito ao lado (não depende da cor). */
function Medidor({ usado, limite }) {
  if (limite === null) return <span className="text-[11px] text-texto-suave">sem limite</span>;
  if (limite === 0) return <span className="text-[11px] text-texto-suave">não incluído no plano</span>;
  const fracao = Math.min(usado / limite, 1);
  const cor = fracao >= 1 ? 'bg-erro' : fracao >= 0.8 ? 'bg-atencao' : 'bg-voltagem';
  return (
    <div className="h-1.5 w-full rounded-full bg-borda overflow-hidden" role="presentation">
      <div className={`h-full ${cor}`} style={{ width: `${Math.max(fracao * 100, usado > 0 ? 2 : 0)}%` }} />
    </div>
  );
}

/**
 * Assinatura e Uso do plano (Seção 3): o plano da organização, quanto falta
 * do teste, quanto se usa de cada limite e o pedido de troca. Com o provedor
 * manual, o pedido avisa a Studio Mythos, que ativa depois do pagamento.
 */
export default function Assinatura({ aba = 'assinatura' }) {
  const [dados, setDados] = useState(null);
  const [uso, setUso] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ciclo, setCiclo] = useState('mensal');
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(() => {
    Promise.all([api.assinatura(), api.usoDoPlano()])
      .then(([a, u]) => {
        setDados(a);
        setUso(u);
      })
      .catch((e) => setErro(e.message));
  }, []);
  useEffect(carregar, [carregar]);

  const pedir = async (plano) => {
    setOcupado(true);
    setErro(null);
    try {
      const r = await api.pedirPlano(plano, ciclo);
      setAviso(r.mensagem);
      carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(false);
    }
  };

  if (!dados || !uso) {
    return (
      <div className="p-6 text-sm text-texto-suave">
        {erro || (
          <span className="flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" /> carregando a assinatura…
          </span>
        )}
      </div>
    );
  }

  const s = SITUACAO[dados.situacao.codigo] || { rotulo: dados.situacao.codigo, cor: '' };
  const pedido = dados.assinatura.pedido;
  const ehDono = dados.papel === 'dono';

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <header className="mb-5">
        <h1 className="font-titulo text-xl">{aba === 'uso' ? 'Uso do plano' : 'Assinatura'}</h1>
        <p className="text-xs text-texto-suave">
          {aba === 'uso' ? `Quanto esta organização usa de cada limite em ${uso.mes}.` : 'O plano desta organização e o que ele inclui.'}
        </p>
      </header>

      {erro && <p className="text-xs text-erro mb-3" role="alert">{erro}</p>}
      {aviso && <p className="text-xs text-ok mb-3" role="status">{aviso}</p>}

      <section className="border border-borda rounded bg-superficie mb-5 p-4 flex flex-wrap gap-x-8 gap-y-3 items-baseline">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-texto-suave">Plano</p>
          <p className="font-titulo text-lg">{dados.isenta ? 'Operadora (sem limite)' : (dados.plano && dados.plano.nome) || '—'}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-texto-suave">Situação</p>
          <p className={`text-sm ${s.cor}`}>{s.rotulo}</p>
        </div>
        {dados.situacao.codigo === 'teste' && dados.situacao.dias_restantes !== null && (
          <div>
            <p className="text-[11px] uppercase tracking-wide text-texto-suave">Teste termina em</p>
            <p className="text-sm font-mono">
              {formatarData(dados.organizacao.teste_ate)} · {dados.situacao.dias_restantes} dia(s)
            </p>
          </div>
        )}
        {dados.assinatura.pago_ate && (
          <div>
            <p className="text-[11px] uppercase tracking-wide text-texto-suave">Pago até</p>
            <p className="text-sm font-mono">{formatarData(dados.assinatura.pago_ate)} · {dados.assinatura.ciclo}</p>
          </div>
        )}
        {dados.situacao.mensagem && <p className="basis-full text-xs text-texto-suave">{dados.situacao.mensagem}</p>}
        {pedido && (
          <p className="basis-full text-xs text-atencao">
            Pedido em andamento: plano {pedido.plano}, {pedido.ciclo} — a ativação acontece quando o pagamento cair.
          </p>
        )}
      </section>

      {aba === 'uso' && (
        <section className="border border-borda rounded bg-superficie">
          <ul>
            {uso.itens.map((i) => (
              <li key={i.chave} className="px-3 py-2.5 border-b border-borda last:border-b-0 grid grid-cols-[1fr_auto] md:grid-cols-[14rem_1fr_8rem] gap-x-4 gap-y-1 items-center text-sm">
                <span>{i.nome}</span>
                <span className="font-mono text-xs text-right md:order-3">
                  {numero(i.usado)}{i.limite !== null && ` / ${numero(i.limite)}`}
                </span>
                <div className="col-span-2 md:col-span-1 md:order-2">
                  <Medidor usado={i.usado} limite={i.limite} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {aba === 'assinatura' && !dados.isenta && (
        <>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-xs uppercase tracking-wide text-texto-suave">Planos</h2>
            <div className="flex border border-borda rounded overflow-hidden text-xs" role="group" aria-label="Ciclo de cobrança">
              {['mensal', 'anual'].map((c) => (
                <button
                  key={c}
                  onClick={() => setCiclo(c)}
                  aria-pressed={ciclo === c}
                  className={`px-3 py-1 ${ciclo === c ? 'bg-realce/[0.08] text-texto' : 'text-texto-suave'}`}
                >
                  {c === 'mensal' ? 'Mensal' : 'Anual (2 meses grátis)'}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {dados.planos.map((p) => {
              const atual = dados.plano && dados.plano.id === p.id && dados.situacao.codigo === 'ativa';
              return (
                <article key={p.id} className={`border rounded bg-superficie p-4 flex flex-col ${atual ? 'border-voltagem/60' : 'border-borda'}`}>
                  <h3 className="font-titulo text-lg">{p.nome}</h3>
                  <p className="font-mono text-xl mt-1">
                    {reais(ciclo === 'anual' ? p.preco_anual_centavos : p.preco_mensal_centavos)}
                    <span className="text-xs text-texto-suave">/{ciclo === 'anual' ? 'ano' : 'mês'}</span>
                  </p>
                  <p className="text-xs text-texto-suave mt-2 mb-3">{p.descricao}</p>
                  <ul className="text-xs space-y-1 mb-3">
                    {LIMITES_NO_CARTAO.map((chave) => (
                      <li key={chave} className="font-mono">
                        {p.limites[chave] === null || p.limites[chave] === undefined ? 'sem limite de' : numero(p.limites[chave])}{' '}
                        <span className="font-sans text-texto-suave">{ROTULO_LIMITE[chave]}</span>
                      </li>
                    ))}
                  </ul>
                  <ul className="text-xs space-y-0.5 mb-4 flex-1">
                    {p.recursos.map((r) => (
                      <li key={r} className="flex items-center gap-1.5">
                        <Check size={12} className="text-ok shrink-0" aria-hidden="true" /> {dados.nomes_recurso[r] || r}
                      </li>
                    ))}
                  </ul>
                  {atual ? (
                    <p className="text-xs text-ok">Seu plano atual</p>
                  ) : ehDono ? (
                    <button className="botao-primario" disabled={ocupado} onClick={() => pedir(p.codigo)}>
                      Quero o {p.nome}
                    </button>
                  ) : (
                    <p className="text-xs text-texto-suave">Só o dono da organização troca o plano.</p>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
