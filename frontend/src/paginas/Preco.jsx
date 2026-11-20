import { useEffect, useState } from 'react';
import { Loader2, Info } from 'lucide-react';
import { api } from '../servicos/api';
import { moedaExata, data } from '../servicos/formato';

/**
 * Aba de preço da licitação (seção 12).
 *
 * O bloco é propositalmente seco, alinhado à direita e em mono: é uma conta,
 * não um gráfico. A linha que importa é "fecha normalmente por" — e ela só vira
 * decisão quando o custo está preenchido, por isso o campo fica no meio do
 * bloco e não escondido num formulário.
 */
export default function Preco({ id }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [custo, setCusto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [parecidas, setParecidas] = useState([]);

  useEffect(() => {
    api
      .preco(id)
      .then((r) => {
        setDados(r);
        setCusto(r.licitacao.custo_estimado ?? '');
        setErro(null);
        // Contratações reais encerradas do mesmo segmento: dão substância à frase.
        api
          .precosParecidas({ grupo: r.referencia ? r.referencia.grupo : r.licitacao.grupo, familia: r.licitacao.familia, pagina: 1 })
          .then((p) => setParecidas((p.dados || []).slice(0, 5)))
          .catch(() => setParecidas([]));
      })
      .catch((e) => setErro(e.message));
  }, [id]);

  const salvar = async () => {
    setSalvando(true);
    try {
      const r = await api.salvarCusto(id, custo === '' ? null : Number(custo));
      setDados(r);
      setErro(null);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  if (erro && !dados) return <p className="text-sm text-erro">{erro}</p>;
  if (!dados) return <Loader2 size={16} className="animate-spin text-texto-suave" />;

  const { referencia, margem_mediana: margem, margem_proposta: margemProposta } = dados;
  const pct = (v) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(0)}%`);

  return (
    <div className="space-y-5 max-w-2xl">
      {dados.aviso && (
        <p className="px-3 py-2 text-xs border border-atencao/40 text-atencao rounded bg-atencao/5">
          {dados.aviso}
        </p>
      )}
      {erro && <p className="text-xs text-erro">{erro}</p>}

      <p className="font-titulo text-base leading-snug" role="status">{dados.frase}</p>

      <dl className="font-mono text-sm">
        <Linha rotulo="Valor estimado" valor={moedaExata(dados.licitacao.valor_estimado)} />
        <Linha
          rotulo="Fecha normalmente por"
          valor={moedaExata(dados.fecha_por)}
          nota={referencia ? `mediana: ${pct(referencia.desconto_mediano)} abaixo` : null}
          destaque
        />
        <Linha
          rotulo="Faixa provável"
          valor={
            dados.faixa_min === null && dados.faixa_max === null
              ? '—'
              : `${moedaExata(dados.faixa_min)} a ${moedaExata(dados.faixa_max)}`
          }
          nota={dados.teto_estimado ? 'teto = o próprio estimado, até haver amostra do 1º quartil' : null}
        />

        <div className="flex items-baseline gap-2 py-1.5 border-b border-borda/60">
          <dt className="text-texto-suave font-sans text-xs uppercase tracking-wide">Seu custo</dt>
          <span className="flex-1 border-b border-dotted border-borda/60 mx-2" />
          <dd className="flex items-center gap-2">
            <input
              type="number"
              step="0.01"
              min="0"
              value={custo}
              onChange={(e) => setCusto(e.target.value)}
              onBlur={salvar}
              onKeyDown={(e) => e.key === 'Enter' && salvar()}
              placeholder="preencher"
              className="campo-caixa w-36 text-right font-mono"
            />
            {salvando && <Loader2 size={12} className="animate-spin text-texto-suave" />}
          </dd>
        </div>

        <Linha
          rotulo="Margem no preço mediano"
          valor={margem ? `${moedaExata(margem.valor)} · ${(margem.pct * 100).toFixed(0)}%` : '—'}
          cor={margem && CORES[margem.sinal]}
        />
        {dados.licitacao.valor_proposto && (
          <Linha
            rotulo="Margem na sua proposta"
            valor={
              margemProposta
                ? `${moedaExata(margemProposta.valor)} · ${(margemProposta.pct * 100).toFixed(0)}%`
                : '—'
            }
            cor={margemProposta && CORES[margemProposta.sinal]}
          />
        )}
      </dl>

      {margem && (
        <p className={`text-sm ${CORES[margem.sinal]}`}>{margem.frase}</p>
      )}
      {!dados.licitacao.custo_estimado && !dados.aviso && (
        <p className="text-sm text-texto-suave">
          Preencha o seu custo e o painel diz se dá para brigar nessa faixa.
        </p>
      )}

      {referencia && (
        <div className="border border-borda rounded p-3 space-y-1.5 text-xs text-texto-suave">
          <p className="flex items-center gap-1.5 text-texto">
            <Info size={12} />
            Referência: {referencia.base}
          </p>
          <p>
            {referencia.origem === 'estudo'
              ? `Do levantamento de ${data(referencia.apurado_em)} sobre 1.371 contratações — o painel ainda não tem amostra própria deste grupo.`
              : `Medido pelo painel em ${referencia.amostra} contratações encerradas, apuradas em ${data(referencia.apurado_em)}.`}
          </p>
          <ul className="space-y-0.5 pt-1">
            {dados.contexto.map((frase) => (
              <li key={frase}>· {frase}</li>
            ))}
          </ul>
        </div>
      )}

      {parecidas.length > 0 && (
        <div>
          <h3 className="text-xs uppercase tracking-wide text-texto-suave mb-1">Contratações reais parecidas</h3>
          <ul className="divide-y divide-borda/40 text-xs">
            {parecidas.map((c) => (
              <li key={c.id} className="py-1.5 flex gap-3">
                <span className="flex-1 min-w-0">
                  <span className="line-clamp-1">{c.objeto}</span>
                  <span className="text-texto-suave">{c.orgao_nome}{c.uf ? ` · ${c.uf}` : ''} · {data(c.encerrada_em)}</span>
                </span>
                <span className="font-mono text-right whitespace-nowrap">
                  {moedaExata(c.valor_homologado)}
                  <span className="block text-texto-suave">
                    {Math.round(Number(c.desconto) * 100) === 0 ? 'no estimado' : Number(c.desconto) > 0 ? `${Math.round(Number(c.desconto) * 100)}% abaixo` : `${Math.abs(Math.round(Number(c.desconto) * 100))}% acima`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// Tailwind só gera a classe escrita no código: nada de `text-${sinal}`.
const CORES = { ok: 'text-ok', atencao: 'text-atencao', erro: 'text-erro' };

/** Linha pontilhada do bloco da seção 12: rótulo à esquerda, número à direita. */
function Linha({ rotulo, valor, nota, destaque, cor }) {
  return (
    <div className="flex items-baseline gap-2 py-1.5 border-b border-borda/60">
      <dt className="text-texto-suave font-sans text-xs uppercase tracking-wide">{rotulo}</dt>
      <span className="flex-1 border-b border-dotted border-borda/60 mx-2" />
      <dd className="text-right">
        <span className={cor || (destaque ? 'text-voltagem' : 'text-texto')}>{valor}</span>
        {nota && <span className="block text-[11px] font-sans text-texto-suave">{nota}</span>}
      </dd>
    </div>
  );
}
