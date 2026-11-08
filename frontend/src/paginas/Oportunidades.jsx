import { useEffect, useState } from 'react';
import { Loader2, RefreshCcw, Eye, ExternalLink, Info } from 'lucide-react';
import { api } from '../servicos/api';
import { moeda, resumir } from '../servicos/formato';

/**
 * Tela "Oportunidades" (seção 22.4) — desertas, fracassadas e baixa
 * concorrência.
 *
 * É o filão de melhor relação esforço/retorno: deserta é contratação que o
 * órgão ainda precisa fazer, com concorrência zero e pressa. Por isso a
 * ordenação padrão é valor estimado desc dentro de 90 dias, e não data: aqui
 * se escolhe onde investir o dia, não se lê notícia.
 */

// A quarta aba, "Iminência" (seção 22.2), é um acréscimo ao desenho original
// da seção 22.4, que previa só as três primeiras. Prazo acabando é a
// prioridade mais alta das quatro, por isso a aba fica à frente das outras.
const ABAS = [
  { chave: 'iminencia', rotulo: 'Iminência' },
  { chave: 'desertas', rotulo: 'Desertas' },
  { chave: 'fracassadas', rotulo: 'Fracassadas' },
  { chave: 'baixa_concorrencia', rotulo: 'Baixa concorrência' },
];

export default function Oportunidades({ aoAbrir }) {
  const [aba, setAba] = useState('iminencia');
  const [dias, setDias] = useState(90);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(null);

  const carregar = async (janela = dias) => {
    try {
      setDados(await api.oportunidades(janela));
      setErro(null);
    } catch (e) {
      setErro(e.message);
    }
  };

  useEffect(() => {
    carregar(dias);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dias]);

  const varrer = async () => {
    setOcupado('varrer');
    setAviso(null);
    try {
      const r = await api.varrerEstrategicas();
      setAviso(r.mensagem);
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(null);
    }
  };

  const acompanhar = async (oportunidade) => {
    setOcupado(`acompanhar-${oportunidade.id}`);
    setAviso(null);
    try {
      const r = await api.acompanharOrgao(oportunidade.id);
      setAviso(r.mensagem);
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(null);
    }
  };

  const descartar = async (oportunidade) => {
    try {
      await api.salvarOportunidade(oportunidade.id, { situacao: 'descartada' });
      await carregar();
    } catch (e) {
      setErro(e.message);
    }
  };

  if (erro && !dados) return <p className="m-4 text-sm text-erro">{erro}</p>;
  if (!dados) return <Loader2 size={16} className="animate-spin text-texto-suave m-4" />;

  const lista = dados[aba] || [];

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-borda flex items-center gap-4 shrink-0 flex-wrap">
        <h1 className="font-titulo text-xl">Oportunidades</h1>
        <div className="flex items-center gap-1">
          {[90, 180, 365].map((d) => (
            <button
              key={d}
              onClick={() => setDias(d)}
              className={`px-2 py-0.5 text-xs border rounded ${
                dias === d ? 'border-texto text-texto' : 'border-borda text-texto-suave hover:text-texto'
              }`}
            >
              {d} dias
            </button>
          ))}
        </div>
        <p className="text-xs text-texto-suave">
          {dados.resumo.desertas} desertas · {moeda(dados.resumo.valor_desertas)} em jogo
          {dados.resumo.reabertas > 0 && ` · ${dados.resumo.reabertas} já reabertas pelo órgão`}
        </p>
        <button className="botao flex items-center gap-1 ml-auto" onClick={varrer} disabled={Boolean(ocupado)}>
          {ocupado === 'varrer' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCcw size={12} />}
          varrer de novo
        </button>
      </div>

      <nav className="px-4 pt-3 flex gap-4 text-xs border-b border-borda shrink-0">
        {ABAS.map(({ chave, rotulo }) => (
          <button
            key={chave}
            onClick={() => setAba(chave)}
            className={`pb-2 border-b-2 ${
              aba === chave ? 'border-texto text-texto' : 'border-transparent text-texto-suave hover:text-texto'
            }`}
          >
            {rotulo} <span className="font-mono opacity-70">{(dados[chave] || []).length}</span>
          </button>
        ))}
      </nav>

      {erro && <p className="mx-4 mt-2 px-3 py-2 text-xs border border-erro/40 text-erro rounded bg-erro/5">{erro}</p>}
      {aviso && (
        <p className="mx-4 mt-2 px-3 py-2 text-xs border border-borda bg-superficie rounded text-texto-suave">
          {aviso}
        </p>
      )}

      <div className="flex-1 overflow-auto p-4 space-y-3">
        <Ressalva aba={aba} ressalvas={dados.ressalvas} />

        {lista.length === 0 ? (
          <p className="text-sm text-texto-suave max-w-2xl">
            Nada nesta aba na janela de {dias} dias. A varredura roda sozinha às 5h; o botão “varrer de novo”
            faz na hora, sem ir à internet — ela lê o que a coleta já trouxe.
          </p>
        ) : aba === 'baixa_concorrencia' ? (
          <TabelaBaixaConcorrencia linhas={lista} />
        ) : aba === 'iminencia' ? (
          <TabelaIminencia linhas={lista} aoAbrir={aoAbrir} />
        ) : (
          <ul className="space-y-2">
            {lista.map((o) => (
              <li key={o.id} className="border border-borda rounded p-3 bg-superficie/40">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-sm text-voltagem shrink-0 w-32 text-right">
                    {moeda(o.valor_estimado)}
                  </span>
                  <span className="text-sm flex-1">{resumir(o.objeto, 150)}</span>
                  <span className="font-mono text-xs text-texto-suave shrink-0">há {o.dias_desde}d</span>
                </div>

                <div className="mt-1.5 flex items-center gap-3 flex-wrap text-[11px] text-texto-suave">
                  <span>{o.orgao_nome || 'órgão não informado'}</span>
                  {o.uf && <span className="font-mono">{o.uf}</span>}
                  {o.item_numero !== null && o.item_numero !== undefined ? (
                    <span>item {o.item_numero}</span>
                  ) : (
                    <span className="opacity-70">contratação inteira</span>
                  )}
                  {o.situacao === 'reaberta' && (
                    <span className="text-atencao">
                      reaberta pelo órgão
                      {o.nova_licitacao_id && aoAbrir && (
                        <button
                          className="ml-1 underline hover:text-texto"
                          onClick={() => aoAbrir(o.nova_licitacao_id)}
                        >
                          ver a nova
                        </button>
                      )}
                    </span>
                  )}

                  <span className="ml-auto flex items-center gap-2">
                    {o.licitacao_id && aoAbrir && (
                      <button
                        className="flex items-center gap-1 hover:text-texto"
                        onClick={() => aoAbrir(o.licitacao_id)}
                      >
                        <ExternalLink size={10} /> abrir
                      </button>
                    )}
                    <button
                      className="flex items-center gap-1 hover:text-texto"
                      onClick={() => acompanhar(o)}
                      disabled={ocupado === `acompanhar-${o.id}`}
                      title="Passa a vigiar o que este órgão já tem aberto na base"
                    >
                      {ocupado === `acompanhar-${o.id}` ? (
                        <Loader2 size={10} className="animate-spin" />
                      ) : (
                        <Eye size={10} />
                      )}
                      acompanhar este órgão
                    </button>
                    <button className="hover:text-erro" onClick={() => descartar(o)}>
                      descartar
                    </button>
                  </span>
                </div>

                {o.observacao && <p className="mt-1 text-[11px] text-texto-suave">{o.observacao}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** O que a tela precisa dizer sobre a procedência do número desta aba. */
function Ressalva({ aba, ressalvas }) {
  const texto =
    aba === 'fracassadas'
      ? ressalvas.fracassada
      : aba === 'baixa_concorrencia'
        ? ressalvas.baixa_concorrencia
        : aba === 'iminencia'
          ? ressalvas.iminencia
          : ressalvas.amostra;

  return (
    <p className="flex items-start gap-2 text-xs text-texto-suave max-w-4xl">
      <Info size={13} className="shrink-0 mt-0.5" />
      {texto}
    </p>
  );
}

function TabelaBaixaConcorrencia({ linhas }) {
  const pct = (v) => (v === null || v === undefined ? '—' : `${(Number(v) * 100).toFixed(1)}%`);

  return (
    // A tabela tem oito colunas e duas delas são texto longo: numa janela
    // estreita ela empurra a página inteira para o lado. O scroll fica aqui,
    // dentro dela, em vez de na tela.
    <div className="overflow-x-auto -mx-1 px-1">
    <table className="w-full text-sm min-w-[52rem]">
      <thead className="text-xs uppercase tracking-wide text-texto-suave border-b border-borda">
        <tr>
          <th className="text-left py-2 font-normal">Órgão</th>
          <th className="text-left py-2 font-normal">Objeto</th>
          <th className="text-left py-2 font-normal">Grupo</th>
          <th className="text-right py-2 font-normal">Estimado</th>
          <th className="text-right py-2 font-normal">Fechou</th>
          <th className="text-right py-2 font-normal">Desconto</th>
          <th className="text-right py-2 font-normal">1º quartil</th>
          <th className="text-right py-2 font-normal pl-3">Há</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((l) => (
          <tr key={l.id} className="border-b border-borda/40">
            <td className="py-1.5">{resumir(l.orgao_nome, 40)}</td>
            <td className="py-1.5">{resumir(l.objeto, 70)}</td>
            <td className="py-1.5 text-xs text-texto-suave">{l.grupo || 'Geral'}</td>
            <td className="py-1.5 text-right font-mono">{moeda(l.valor_estimado)}</td>
            <td className="py-1.5 text-right font-mono">{moeda(l.valor_homologado)}</td>
            <td className="py-1.5 text-right font-mono text-voltagem">{pct(l.desconto)}</td>
            <td className="py-1.5 text-right font-mono text-texto-suave">{pct(l.desconto_q1)}</td>
            <td className="py-1.5 text-right font-mono text-texto-suave pl-3">{l.dias_desde}d</td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

/** Fila "Iminência" (seção 22.2) — prazo acabando em menos de 24 h. */
function TabelaIminencia({ linhas, aoAbrir }) {
  return (
    <div className="overflow-x-auto -mx-1 px-1">
    <table className="w-full text-sm min-w-[52rem]">
      <thead className="text-xs uppercase tracking-wide text-texto-suave border-b border-borda">
        <tr>
          <th className="text-left py-2 font-normal">Órgão</th>
          <th className="text-left py-2 font-normal">Objeto</th>
          <th className="text-left py-2 font-normal">UF</th>
          <th className="text-right py-2 font-normal">Estimado</th>
          <th className="text-right py-2 font-normal">Prazo acaba em</th>
          <th className="text-right py-2 font-normal pl-3"> </th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((l) => (
          <tr key={l.id} className="border-b border-borda/40">
            <td className="py-1.5">{resumir(l.orgao_nome, 40)}</td>
            <td className="py-1.5">{resumir(l.objeto, 70)}</td>
            <td className="py-1.5 text-xs text-texto-suave">{l.uf || '—'}</td>
            <td className="py-1.5 text-right font-mono">{moeda(l.valor_estimado)}</td>
            <td className="py-1.5 text-right font-mono text-erro">
              {l.horas_restantes === null ? '—' : `${l.horas_restantes} h`}
            </td>
            <td className="py-1.5 text-right pl-3">
              <span className="flex items-center justify-end gap-2">
                {aoAbrir && (
                  <button className="flex items-center gap-1 hover:text-texto" onClick={() => aoAbrir(l.id)}>
                    <ExternalLink size={10} /> abrir
                  </button>
                )}
                {l.link_disputa && (
                  <a
                    href={l.link_disputa}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 hover:text-texto"
                    title="Abre o portal de disputa para confirmar se já há proposta"
                  >
                    disputa
                  </a>
                )}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}
