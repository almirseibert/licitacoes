import { useEffect, useState } from 'react';
import { Loader2, FileDown, Info, X, Lightbulb } from 'lucide-react';
import { api } from '../servicos/api';
import { moeda, moedaExata, data as comoData, resumir, LACUNA } from '../servicos/formato';
import Barras from '../componentes/Barras';
import PerfilFornecedor from '../componentes/PerfilFornecedor';

/**
 * Concorrentes, histórico e mercado (Seção 13 do PLANO_SAAS_CONLICITACAO.md).
 *
 * Três abas sobre o banco público do PNCP (Seção 12) e o funil da organização:
 * a análise de compras por segmento, quem mais vende nos meus segmentos, e por
 * que eu perdi. O segmento é sempre da organização (grupo de palavras-chave
 * ou filtro salvo); o que o PNCP não publica aparece como "não disponível".
 */

const ABAS = [
  { chave: 'analise', rotulo: 'Análise de mercado' },
  { chave: 'recorrentes', rotulo: 'Concorrentes recorrentes' },
  { chave: 'historico', rotulo: 'Meu histórico' },
];

// Os últimos 12 meses, para o relatório mensal (AAAA-MM no fuso de quem olha).
function ultimosMeses(n = 12) {
  const hoje = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { chave, rotulo: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) };
  });
}

const nomeDoMes = (chave) => {
  const [ano, mes] = String(chave).split('-');
  return new Date(Number(ano), Number(mes) - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
};

// "seg:<grupo>" ou "fil:<id>" no seletor → parâmetro da API.
function paraSegmento(valor) {
  if (!valor) return {};
  const [tipo, ...resto] = valor.split(':');
  return tipo === 'fil' ? { filtro: resto.join(':') } : { segmento: resto.join(':') };
}

const limpo = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== null && v !== undefined));
const pct = (v, casas = 1) => (v === null || v === undefined ? '—' : `${(Number(v) * 100).toFixed(casas)}%`);

export default function AnaliseMercado({ aoAbrir }) {
  const [aba, setAba] = useState('analise');
  const [opcoes, setOpcoes] = useState({ segmentos: [], filtros: [] });
  const [modalidades, setModalidades] = useState([]);
  const [fornecedor, setFornecedor] = useState(null);

  useEffect(() => {
    api.opcoesAnalise().then(setOpcoes).catch(() => {});
    api.resumoMercado().then((r) => setModalidades((r.opcoes && r.opcoes.modalidade) || [])).catch(() => {});
  }, []);

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 pt-3 border-b border-borda shrink-0">
        <h1 className="font-titulo text-xl">Mercado e concorrentes</h1>
        <nav className="flex gap-4 mt-2 overflow-x-auto" role="tablist">
          {ABAS.map(({ chave, rotulo }) => (
            <button
              key={chave}
              role="tab"
              aria-selected={aba === chave}
              onClick={() => setAba(chave)}
              className={`pb-2 text-sm border-b-2 whitespace-nowrap ${
                aba === chave ? 'border-texto text-texto' : 'border-transparent text-texto-suave hover:text-texto'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {aba === 'analise' && <Analise opcoes={opcoes} modalidades={modalidades} aoFornecedor={setFornecedor} />}
        {aba === 'recorrentes' && <Recorrentes opcoes={opcoes} aoFornecedor={setFornecedor} />}
        {aba === 'historico' && <Historico aoFornecedor={setFornecedor} aoAbrir={aoAbrir} />}
      </div>

      {fornecedor && (
        <div className="fixed inset-0 bg-obsidiana/80 flex justify-end z-20" onClick={() => setFornecedor(null)}>
          <aside
            className="w-full max-w-2xl bg-superficie border-l border-borda h-full overflow-auto"
            onClick={(e) => e.stopPropagation()}
            aria-label="Perfil do fornecedor"
          >
            <header className="px-4 py-3 border-b border-borda flex items-start gap-2 sticky top-0 bg-superficie z-10">
              <div className="flex-1 min-w-0">
                <h2 className="font-titulo text-base truncate">{fornecedor.empresa || 'Fornecedor'}</h2>
                <p className="font-mono text-xs text-texto-suave">{fornecedor.cnpj}</p>
              </div>
              <button className="text-texto-suave hover:text-texto" onClick={() => setFornecedor(null)} aria-label="Fechar">
                <X size={16} />
              </button>
            </header>
            <div className="p-4">
              <PerfilFornecedor cnpj={fornecedor.cnpj} />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function SeletorSegmento({ opcoes, valor, aoMudar, rotuloVazio }) {
  return (
    <select className="campo-caixa max-w-full" value={valor} onChange={(e) => aoMudar(e.target.value)} aria-label="Segmento">
      <option value="">{rotuloVazio}</option>
      {opcoes.segmentos.length > 0 && (
        <optgroup label="Grupos de palavras-chave">
          {opcoes.segmentos.map((s) => (
            <option key={s.nome} value={`seg:${s.nome}`}>
              {s.nome} ({s.termos})
            </option>
          ))}
        </optgroup>
      )}
      {opcoes.filtros.length > 0 && (
        <optgroup label="Meus filtros">
          {opcoes.filtros.map((f) => (
            <option key={f.id} value={`fil:${f.id}`}>
              {f.nome}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

// ------------------------------------------------------------ Análise

function Analise({ opcoes, modalidades, aoFornecedor }) {
  const meses = ultimosMeses();
  const [f, setF] = useState({ segmento: '', mes: meses[0].chave, de: '', ate: '', uf: '', modalidade: '', municipio: '' });
  const [aplicados, setAplicados] = useState(f);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [baixando, setBaixando] = useState(false);

  const parametros = (x) => limpo({ ...paraSegmento(x.segmento), mes: x.mes, de: x.mes ? '' : x.de, ate: x.mes ? '' : x.ate, uf: x.uf, modalidade: x.modalidade, municipio: x.municipio });

  useEffect(() => {
    let vivo = true;
    setDados(null);
    api
      .analiseMercado(parametros(aplicados))
      .then((r) => vivo && (setDados(r), setErro(null)))
      .catch((e) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, [aplicados]);

  const baixar = async () => {
    setBaixando(true);
    try {
      await api.relatorioMercadoPdf(parametros(aplicados));
    } catch (e) {
      setErro(e.message);
    } finally {
      setBaixando(false);
    }
  };

  const muda = (campo) => (e) => setF((x) => ({ ...x, [campo]: e.target ? e.target.value : e }));
  const t = dados && dados.totais;

  return (
    <div className="space-y-4 max-w-6xl">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setAplicados(f);
        }}
      >
        <SeletorSegmento opcoes={opcoes} valor={f.segmento} aoMudar={muda('segmento')} rotuloVazio="Mercado inteiro" />
        <select className="campo-caixa max-w-full" value={f.mes} onChange={muda('mes')} aria-label="Mês">
          {meses.map((m) => (
            <option key={m.chave} value={m.chave}>
              {m.rotulo}
            </option>
          ))}
          <option value="">Outro período…</option>
        </select>
        {!f.mes && (
          <>
            <input type="date" className="campo-caixa max-w-full" value={f.de} onChange={muda('de')} aria-label="De" />
            <input type="date" className="campo-caixa max-w-full" value={f.ate} onChange={muda('ate')} aria-label="Até" />
          </>
        )}
        <input className="campo-caixa w-16" placeholder="UF" maxLength={2} value={f.uf} onChange={muda('uf')} aria-label="UF" />
        <input className="campo-caixa w-40" placeholder="Município" value={f.municipio} onChange={muda('municipio')} aria-label="Município" />
        <select className="campo-caixa max-w-full" value={f.modalidade} onChange={muda('modalidade')} aria-label="Modalidade">
          <option value="">Toda modalidade</option>
          {modalidades.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <button className="botao" type="submit">
          aplicar
        </button>
        <button type="button" className="botao flex items-center gap-1 sm:ml-auto" onClick={baixar} disabled={baixando || !dados}>
          {baixando ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />}
          relatório em PDF
        </button>
      </form>

      {erro && <p className="px-3 py-2 text-xs border border-erro/40 text-erro rounded bg-erro/5">{erro}</p>}
      {!dados && !erro && <Loader2 size={16} className="animate-spin text-texto-suave" />}

      {dados && (
        <>
          <p className="text-xs text-texto-suave">
            {dados.segmento.nome ? <strong className="font-normal text-texto">{dados.segmento.nome}</strong> : 'Mercado inteiro'} ·{' '}
            {comoData(dados.periodo.de)} a {comoData(dados.periodo.ate)}
            {dados.segmento.termos.length > 0 && <> · termos: {dados.segmento.termos.join(', ')}</>}
          </p>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            <Numero rotulo="Contratos" valor={t.contratos} />
            <Numero rotulo="Valor contratado" valor={moeda(t.valor)} />
            <Numero rotulo="Ticket médio" valor={t.ticket_medio === null ? LACUNA : moeda(t.ticket_medio)} />
            <Numero rotulo="Órgãos" valor={t.orgaos} />
            <Numero rotulo="Fornecedores" valor={t.fornecedores} />
            <Numero rotulo="Atas" valor={t.atas} nota="sem valor no PNCP" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Barras titulo="Compras por mês" linhas={dados.por_mes.map((m) => ({ ...m, chave: m.mes, rotulo: nomeDoMes(m.mes) }))} />
            <Barras titulo="Por modalidade" linhas={dados.por_modalidade} />
            <Barras
              titulo="Por região (município)"
              linhas={dados.por_municipio.map((m) => ({ ...m, chave: `${m.rotulo}/${m.uf}`, rotulo: `${m.rotulo}/${m.uf}` }))}
            />
            <Barras titulo="Órgãos que mais compraram" linhas={dados.por_orgao} />
            <Barras
              titulo="Fornecedores que mais venderam"
              linhas={dados.por_fornecedor}
              aoClicar={(l) => aoFornecedor({ cnpj: l.chave, empresa: l.rotulo })}
              nota="Clique no nome para abrir o perfil por CNPJ."
            />
            {dados.por_termo.length > 0 ? (
              <Barras titulo="Por produto (termo do segmento)" linhas={dados.por_termo} medida="quantidade" nota="Um contrato pode casar com mais de um termo." />
            ) : (
              <Barras
                titulo="Por produto (itens de editais lidos)"
                linhas={dados.por_item}
                medida="quantidade"
                vazio="Escolha um segmento para ver os produtos; itens só aparecem para editais que o painel leu."
              />
            )}
          </div>

          <p className="flex items-start gap-2 text-[11px] text-texto-suave max-w-4xl">
            <Info size={12} className="shrink-0 mt-0.5" />
            {dados.ressalva}
          </p>
        </>
      )}
    </div>
  );
}

function Numero({ rotulo, valor, nota }) {
  return (
    <div className="border border-borda rounded p-2.5 min-w-0">
      <p className="text-[11px] text-texto-suave">{rotulo}</p>
      <p className="font-mono text-lg mt-0.5 truncate" title={String(valor)}>
        {valor}
      </p>
      {nota && <p className="text-[10px] text-texto-suave">{nota}</p>}
    </div>
  );
}

// ------------------------------------------------------- Recorrentes

const PERIODOS_RECORRENTES = [30, 90, 180, 365];

function Recorrentes({ opcoes, aoFornecedor }) {
  const [segmento, setSegmento] = useState('');
  const [dias, setDias] = useState(90);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let vivo = true;
    setDados(null);
    // Só o tamanho da janela: o "hoje" é o de Brasília, calculado no backend.
    api
      .recorrentes(limpo({ ...paraSegmento(segmento), dias }))
      .then((r) => vivo && (setDados(r), setErro(null)))
      .catch((e) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, [segmento, dias]);

  return (
    <div className="space-y-3 max-w-5xl">
      <div className="flex flex-wrap items-center gap-2">
        <SeletorSegmento opcoes={opcoes} valor={segmento} aoMudar={setSegmento} rotuloVazio="Todas as minhas palavras-chave" />
        <div className="flex gap-1">
          {PERIODOS_RECORRENTES.map((d) => (
            <button
              key={d}
              onClick={() => setDias(d)}
              className={`px-2 py-0.5 text-xs border rounded ${dias === d ? 'border-texto text-texto' : 'border-borda text-texto-suave hover:text-texto'}`}
            >
              {d} dias
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-texto-suave">
        Empresas com {dados ? dados.minimo : 2} ou mais contratos no PNCP cujo objeto casa com as suas palavras-chave. Pessoa
        física (CPF mascarado pelo PNCP) fica de fora: a máscara junta pessoas diferentes.
      </p>
      {erro && <p className="text-sm text-erro">{erro}</p>}
      {!dados && !erro && <Loader2 size={16} className="animate-spin text-texto-suave" />}
      {dados && dados.segmento.termos.length === 0 && (
        <p className="text-sm text-texto-suave">Cadastre palavras-chave para ver quem disputa o seu segmento.</p>
      )}
      {dados && dados.segmento.termos.length > 0 && dados.dados.length === 0 && (
        <p className="text-sm text-texto-suave">Nenhuma empresa repetiu contrato nesse segmento e período.</p>
      )}
      {dados && dados.dados.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-xs uppercase tracking-wide text-texto-suave border-b border-borda">
              <tr>
                <th className="text-left py-2 font-normal">Empresa</th>
                <th className="text-right py-2 font-normal">Contratos</th>
                <th className="text-right py-2 font-normal">Valor</th>
                <th className="text-right py-2 font-normal">Órgãos</th>
                <th className="text-left py-2 font-normal pl-3">UF</th>
                <th className="text-left py-2 font-normal">Último</th>
              </tr>
            </thead>
            <tbody>
              {dados.dados.map((c) => (
                <tr key={c.cnpj} className="border-b border-borda/40">
                  <td className="py-1.5 pr-2">
                    <button className="text-left hover:text-voltagem" onClick={() => aoFornecedor({ cnpj: c.cnpj, empresa: c.empresa })}>
                      {resumir(c.empresa, 60)}
                    </button>
                    <span className="block font-mono text-[11px] text-texto-suave">
                      {c.cnpj}
                      {c.no_dossie && <span className="ml-2 text-voltagem">no dossiê</span>}
                    </span>
                  </td>
                  <td className="py-1.5 text-right font-mono">{c.contratos}</td>
                  <td className="py-1.5 text-right font-mono whitespace-nowrap">{moedaExata(c.valor)}</td>
                  <td className="py-1.5 text-right font-mono">{c.orgaos}</td>
                  <td className="py-1.5 pl-3 text-xs">{c.ufs}</td>
                  <td className="py-1.5 font-mono text-xs">{comoData(c.ultimo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------- Histórico

function Historico({ aoFornecedor, aoAbrir }) {
  const [meses, setMeses] = useState(12);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let vivo = true;
    setDados(null);
    api
      .historicoPerdas(meses)
      .then((r) => vivo && (setDados(r), setErro(null)))
      .catch((e) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, [meses]);

  const t = dados && dados.total;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {[6, 12, 24].map((m) => (
            <button
              key={m}
              onClick={() => setMeses(m)}
              className={`px-2 py-0.5 text-xs border rounded ${meses === m ? 'border-texto text-texto' : 'border-borda text-texto-suave hover:text-texto'}`}
            >
              {m} meses
            </button>
          ))}
        </div>
        {t && (
        <span className="text-xs text-texto-suave">
          disputei <span className="font-mono text-texto">{t.disputadas}</span> · ganhei{' '}
          <span className="font-mono text-ok">{t.ganhas}</span> · perdi <span className="font-mono text-erro">{t.perdidas}</span> · taxa{' '}
          <span className="font-mono text-texto">{pct(t.taxa_vitoria)}</span>
        </span>
        )}
      </div>

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
