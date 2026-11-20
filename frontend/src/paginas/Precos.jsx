import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCcw, Download, Building2, Search, SlidersHorizontal } from 'lucide-react';
import { api } from '../servicos/api';
import { moedaExata, data } from '../servicos/formato';
import Abas from '../componentes/Abas';

/**
 * Preço de referência: responde "por quanto devo ofertar?" e "quem eu enfrento?".
 * Uma frase no topo, um simulador (estimado + custo → vale a pena?) e contratações reais
 * parecidas, que dão substância ao número. Os quartis e a tabela por grupo saíram da tela:
 * eram dados sem pergunta (a explicação ficou em "Como calculamos").
 */

const VEREDITO = {
  vale: { rotulo: 'Vale disputar', cor: 'text-ok', borda: 'border-ok/50' },
  apertado: { rotulo: 'Margem apertada', cor: 'text-atencao', borda: 'border-atencao/50' },
  nao_compensa: { rotulo: 'Não compensa', cor: 'text-erro', borda: 'border-erro/50' },
};

/** 0,18 → "18% abaixo do estimado"; 0 → "no valor estimado"; negativo → "acima". */
function descontoEscrito(d) {
  if (d === null || d === undefined) return '—';
  const n = Math.round(Number(d) * 100);
  if (n === 0) return 'no estimado';
  return n > 0 ? `${n}% abaixo` : `${Math.abs(n)}% acima`;
}

export default function Precos() {
  const [aba, setAba] = useState('ofertar');
  const [filtros, setFiltros] = useState({ area: '', segmento: '', familia: 'Pregão', uf: '', esfera: '', valor_min: '', valor_max: '', de: '', ate: '' });
  const [resumo, setResumo] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(null);

  const carregar = useCallback(async () => {
    try {
      setResumo(await api.precosResumo(filtros));
      setErro(null);
    } catch (e) {
      setErro(e.message);
    }
  }, [filtros]);

  // Valor e datas são digitados: espera uma pausa antes de ir ao servidor.
  useEffect(() => {
    const t = setTimeout(carregar, 300);
    return () => clearTimeout(t);
  }, [carregar]);

  const atualizar = async (qual) => {
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

  if (erro && !resumo) return <p className="m-4 text-sm text-erro">{erro}</p>;
  if (!resumo) return <Loader2 size={16} className="animate-spin text-texto-suave m-4" />;

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <header className="flex items-start gap-3 flex-wrap mb-4">
        <div>
          <h1 className="font-titulo text-xl">Preço de referência</h1>
          <p className="text-xs text-texto-suave">
            {resumo.amostra.encerradas
              ? `${resumo.amostra.encerradas} contratações encerradas medidas pelo painel` +
                (resumo.amostra.de ? ` · de ${data(resumo.amostra.de)} a ${data(resumo.amostra.ate)}` : '')
              : 'O painel ainda não mediu contratações encerradas: os números abaixo vêm do levantamento de 10/10/2026.'}
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <button className="botao flex items-center gap-1" onClick={() => atualizar('recalcular')} disabled={Boolean(ocupado)}>
            {ocupado === 'recalcular' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCcw size={12} />}
            recalcular
          </button>
          <button
            className="botao flex items-center gap-1"
            onClick={() => atualizar('coletar')}
            disabled={Boolean(ocupado)}
            title="Busca no PNCP contratações já encerradas para medir os preços. Leva minutos: a coleta anda devagar de propósito."
          >
            {ocupado === 'coletar' ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
            coletar encerradas
          </button>
        </div>
      </header>

      {erro && <p className="mb-3 px-3 py-2 text-xs border border-erro/40 text-erro rounded bg-erro/5">{erro}</p>}
      {aviso && <p className="mb-3 px-3 py-2 text-xs border border-borda bg-superficie rounded text-texto-suave">{aviso}</p>}

      <Abas abas={[['ofertar', 'Quanto ofertar'], ['concorrentes', 'Concorrentes']]} ativa={aba} aoMudar={setAba} />

      {aba === 'ofertar' ? (
        <Ofertar resumo={resumo} filtros={filtros} setFiltros={setFiltros} />
      ) : (
        <Concorrentes grupos={resumo.grupos} />
      )}
    </div>
  );
}

/** Quantos dos filtros "avançados" (os que não ficam à vista) estão ligados. */
const AVANCADOS = ['uf', 'esfera', 'valor_min', 'valor_max', 'de', 'ate'];

function Ofertar({ resumo, filtros, setFiltros }) {
  const [maisFiltros, setMaisFiltros] = useState(false);
  const mudar = (campo) => (e) => setFiltros((f) => ({ ...f, [campo]: e.target.value }));
  const ligados = AVANCADOS.filter((c) => filtros[c] !== '').length;

  const area = (resumo.catalogo || []).find((a) => a.area === filtros.area);
  const trocarArea = (e) => setFiltros((f) => ({ ...f, area: e.target.value, segmento: '' }));
  // Escolher um segmento sem área já escolhida preenche a área: a lista de segmentos vem agrupada por área.
  const trocarSegmento = (e) => {
    const nome = e.target.value;
    const dona = (resumo.catalogo || []).find((a) => a.segmentos.some((x) => x.nome === nome));
    setFiltros((f) => ({ ...f, segmento: nome, area: dona ? dona.area : f.area }));
  };
  const limpar = () => setFiltros((f) => ({ ...f, area: '', segmento: '', uf: '', esfera: '', valor_min: '', valor_max: '', de: '', ate: '' }));
  const alguma = Boolean(filtros.area || filtros.segmento || ligados);
  const rotulo = (a) => `${a.area ?? a.nome}${a.n ? ` (${a.n})` : ''}`;

  return (
    <div className="max-w-4xl space-y-8">
      <section>
        <div className="flex gap-3 flex-wrap mb-3 text-sm items-end">
          <label className="flex flex-col gap-0.5 text-[11px] text-texto-suave">
            Área
            <select className="campo-caixa" value={filtros.area} onChange={trocarArea}>
              <option value="">Todas as áreas</option>
              {(resumo.catalogo || []).map((a) => (
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
                : (resumo.catalogo || []).map((a) => (
                    <optgroup key={a.area} label={a.area}>
                      {a.segmentos.map((x) => <option key={x.nome} value={x.nome}>{rotulo(x)}</option>)}
                    </optgroup>
                  ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] text-texto-suave">
            Modalidade
            <select className="campo-caixa" value={filtros.familia} onChange={mudar('familia')}>
              {resumo.familias.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setMaisFiltros(!maisFiltros)}
            aria-expanded={maisFiltros}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs hover:text-texto ${maisFiltros ? 'border-voltagem/60 text-texto' : 'border-borda text-texto-suave'}`}
          >
            <SlidersHorizontal size={13} /> Mais filtros{ligados ? ` (${ligados})` : ''}
          </button>
          {alguma && (
            <button type="button" onClick={limpar} className="text-[11px] text-texto-suave hover:text-texto underline pb-2">
              limpar
            </button>
          )}
        </div>

        {maisFiltros && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-3 p-3 border border-borda rounded bg-superficie/40">
            <label className="flex flex-col gap-0.5 text-[11px] text-texto-suave">
              UF
              <select className="campo-caixa w-full" value={filtros.uf} onChange={mudar('uf')}>
                <option value="">Todas</option>
                {(resumo.ufs || []).map((u) => <option key={u}>{u}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] text-texto-suave">
              Esfera
              <select className="campo-caixa w-full" value={filtros.esfera} onChange={mudar('esfera')}>
                <option value="">Todas</option>
                {(resumo.esferas || []).map((e) => <option key={e}>{e}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] text-texto-suave">
              Estimado de (R$)
              <input className="campo-caixa w-full font-mono" inputMode="decimal" value={filtros.valor_min} onChange={mudar('valor_min')} />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] text-texto-suave">
              Estimado até (R$)
              <input className="campo-caixa w-full font-mono" inputMode="decimal" value={filtros.valor_max} onChange={mudar('valor_max')} />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] text-texto-suave">
              Encerrada de
              <input className="campo-caixa w-full" type="date" value={filtros.de} onChange={mudar('de')} />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] text-texto-suave">
              até
              <input className="campo-caixa w-full" type="date" value={filtros.ate} onChange={mudar('ate')} />
            </label>
          </div>
        )}

        <p className="font-titulo text-lg leading-snug" role="status">{resumo.frase}</p>
        {resumo.base && <p className="mt-1 text-xs text-texto-suave">{resumo.base}</p>}
        {resumo.base_rotulo && resumo.base_rotulo.includes('sem amostra') && (
          <p className="mt-1 text-xs text-atencao">Não há medida suficiente para esta combinação; vale a referência mais larga: {resumo.base_rotulo}.</p>
        )}
        {resumo.amostra.encerradas > 0 && (
          <p className="mt-1 text-[11px] text-texto-suave">{resumo.amostra.encerradas.toLocaleString('pt-BR')} contratações encerradas com os filtros escolhidos.</p>
        )}
      </section>

      <Simulador filtros={filtros} temReferencia={Boolean(resumo.referencia)} />
      <Parecidas filtros={filtros} />

      <details className="text-xs text-texto-suave">
        <summary className="cursor-pointer text-texto">Como calculamos</summary>
        <ul className="mt-2 space-y-1">
          <li>· Desconto = (valor estimado − valor homologado) ÷ valor estimado, por contratação encerrada com resultado.</li>
          <li>· “Fecha em média” é a mediana desses descontos; a faixa provável vai do desconto de 1 quarto das contratações ao de 3 quartos.</li>
          <li>· O painel usa a própria medida quando tem {12} contratações ou mais no segmento; abaixo disso, desce do segmento para a área e depois para a medida geral, e diz qual usou.</li>
          <li>· O segmento sai do texto do objeto, por um dicionário de termos (a IA não participa). {resumo.sem_classificacao ? `${resumo.sem_classificacao.toLocaleString('pt-BR')} contratações ainda não têm assunto reconhecido e ficam fora dos segmentos.` : ''}</li>
          {resumo.contexto.map((f) => (
            <li key={f}>· {f}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function Simulador({ filtros, temReferencia }) {
  const [estimado, setEstimado] = useState('');
  const [custo, setCusto] = useState('');
  const [r, setR] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    const valor = Number(String(estimado).replace(/\./g, '').replace(',', '.'));
    if (!valor || valor <= 0) {
      setR(null);
      return undefined;
    }
    const c = Number(String(custo).replace(/\./g, '').replace(',', '.'));
    const t = setTimeout(() => {
      api
        .simularPreco({ ...filtros, estimado: valor, custo: c > 0 ? c : '' })
        .then((x) => { setR(x); setErro(null); })
        .catch((e) => setErro(e.message));
    }, 400);
    return () => clearTimeout(t);
  }, [estimado, custo, filtros]);

  const v = r && r.veredito ? VEREDITO[r.veredito] : null;
  return (
    <section>
      <h2 className="font-titulo text-base mb-2">Simulador</h2>
      <div className="grid sm:grid-cols-2 gap-3 max-w-xl">
        <label className="text-xs text-texto-suave">
          Valor estimado da licitação (R$)
          <input className="campo-caixa w-full mt-1 font-mono" inputMode="decimal" placeholder="100000" value={estimado} onChange={(e) => setEstimado(e.target.value)} />
        </label>
        <label className="text-xs text-texto-suave">
          Seu custo para entregar (R$)
          <input className="campo-caixa w-full mt-1 font-mono" inputMode="decimal" placeholder="opcional" value={custo} onChange={(e) => setCusto(e.target.value)} />
        </label>
      </div>
      {erro && <p className="mt-2 text-xs text-erro">{erro}</p>}
      {!temReferencia && <p className="mt-2 text-xs text-texto-suave">Sem referência para este segmento: o simulador não tem como estimar o preço.</p>}
      {r && r.fecha_por !== null && (
        <div className="mt-3 max-w-xl border border-borda rounded bg-superficie p-3 space-y-3">
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div>
              <dt className="text-[11px] text-texto-suave">Preço mais baixo da faixa</dt>
              <dd className="font-mono text-sm">{moedaExata(r.faixa_min)}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-texto-suave">Costuma fechar em</dt>
              <dd className="font-mono text-sm text-voltagem">{moedaExata(r.fecha_por)}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-texto-suave">{r.teto_estimado ? 'Teto (o estimado)' : 'Preço mais alto da faixa'}</dt>
              <dd className="font-mono text-sm">{moedaExata(r.faixa_max)}</dd>
            </div>
          </dl>
          {v ? (
            <div className={`border-l-2 pl-3 ${v.borda}`}>
              <p className={`text-sm font-medium ${v.cor}`}>{v.rotulo}</p>
              <p className="text-xs text-texto-suave">{r.frase}</p>
              {r.preco_para_20 && (
                <p className="text-xs text-texto-suave mt-1">Para sobrar 20%, o preço não pode ficar abaixo de <span className="font-mono">{moedaExata(r.preco_para_20)}</span>.</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-texto-suave">Informe o seu custo para saber se compensa.</p>
          )}
        </div>
      )}
    </section>
  );
}

function Parecidas({ filtros }) {
  const [q, setQ] = useState('');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [lista, setLista] = useState(null);

  useEffect(() => {
    let vivo = true;
    api.precosParecidas({ ...filtros, q: busca, pagina }).then((r) => vivo && setLista(r)).catch(() => vivo && setLista({ dados: [], total: 0, por_pagina: 15 }));
    return () => { vivo = false; };
  }, [filtros, busca, pagina]);

  useEffect(() => { setPagina(1); }, [filtros, busca]);

  const paginas = lista ? Math.max(1, Math.ceil(lista.total / lista.por_pagina)) : 1;
  return (
    <section>
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <h2 className="font-titulo text-base">Contratações reais parecidas</h2>
        <form className="ml-auto flex gap-1" onSubmit={(e) => { e.preventDefault(); setBusca(q.trim()); }}>
          <input className="campo-caixa" placeholder="filtrar pelo objeto" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="botao" aria-label="buscar"><Search size={12} /></button>
        </form>
      </div>
      {!lista ? (
        <Loader2 size={14} className="animate-spin text-texto-suave" />
      ) : lista.dados.length === 0 ? (
        <p className="text-sm text-texto-suave">
          Nenhuma contratação encerrada com resultado nestes filtros ainda. Use “coletar encerradas” no alto da página para o painel buscar no PNCP.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-texto-suave border-b border-borda">
                <tr>
                  <th className="text-left py-2 font-normal">Objeto</th>
                  <th className="text-left py-2 font-normal">Órgão</th>
                  <th className="text-right py-2 pl-3 font-normal">Estimado</th>
                  <th className="text-right py-2 pl-3 font-normal">Fechou em</th>
                  <th className="text-right py-2 pl-4 font-normal">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {lista.dados.map((c) => (
                  <tr key={c.id} className="border-b border-borda/40 align-top">
                    <td className="py-1.5 pr-3 max-w-[26rem]"><span className="line-clamp-2">{c.objeto}</span><span className="text-[11px] text-texto-suave">{c.modalidade} · {data(c.encerrada_em)}</span></td>
                    <td className="py-1.5 pr-3 text-xs">{c.orgao_nome}{c.uf ? ` · ${c.uf}` : ''}</td>
                    <td className="py-1.5 pl-3 text-right font-mono whitespace-nowrap">{moedaExata(c.valor_estimado)}</td>
                    <td className="py-1.5 pl-3 text-right font-mono whitespace-nowrap">{moedaExata(c.valor_homologado)}</td>
                    <td className="py-1.5 pl-4 text-right text-xs whitespace-nowrap">{descontoEscrito(c.desconto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {paginas > 1 && (
            <div className="flex items-center gap-2 mt-2 text-xs text-texto-suave">
              <button className="botao" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>anterior</button>
              <span>página {pagina} de {paginas} · {lista.total} contratações</span>
              <button className="botao" disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)}>próxima</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Concorrentes({ grupos }) {
  const [grupo, setGrupo] = useState('');
  const [lista, setLista] = useState(null);

  useEffect(() => {
    let vivo = true;
    api.concorrentes({ limite: 30, grupo }).then((r) => vivo && setLista(r.dados || [])).catch(() => vivo && setLista([]));
    return () => { vivo = false; };
  }, [grupo]);

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <p className="text-sm text-texto-suave">Quem mais vence nas licitações que o painel acompanha, com o que levou.</p>
        <label className="ml-auto flex items-center gap-2 text-xs text-texto-suave">
          Grupo de palavras-chave
          <select className="campo-caixa" value={grupo} onChange={(e) => setGrupo(e.target.value)}>
            <option value="">Todos</option>
            {grupos.filter((g) => g !== 'Geral').map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
      </div>
      {!lista ? (
        <Loader2 size={14} className="animate-spin text-texto-suave" />
      ) : lista.length === 0 ? (
        <p className="text-sm text-texto-suave">
          Nenhum concorrente registrado ainda. Eles aparecem quando o resultado de uma licitação é lido: abra uma licitação já homologada e use “buscar resultado no portal” na aba Resultados.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-texto-suave border-b border-borda">
            <tr>
              <th className="text-left py-2 font-normal">Empresa</th>
              <th className="text-left py-2 font-normal">CNPJ</th>
              <th className="text-right py-2 font-normal">Licitações</th>
              <th className="text-right py-2 font-normal">Levou no total</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => (
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
    </div>
  );
}
