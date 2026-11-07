import { useEffect, useState } from 'react';
import { Loader2, RefreshCcw, Building2, ShieldCheck, ShieldAlert, Search, X } from 'lucide-react';
import { api } from '../servicos/api';
import { moeda, resumir, data as formatarData } from '../servicos/formato';

/**
 * Telas de dossiê (seções 26 e 27) — órgãos e concorrentes.
 *
 * Nada aqui é coletado à parte: é tudo derivado da base que já temos. O valor
 * está em responder duas perguntas antes de gastar o dia montando proposta —
 * "este órgão costuma exigir o quê?" e "qual o piso que estes três praticam?".
 */
export default function Orgaos({ aoAbrir }) {
  const [aba, setAba] = useState('orgaos');
  const [orgaos, setOrgaos] = useState(null);
  const [concorrentes, setConcorrentes] = useState([]);
  const [busca, setBusca] = useState('');
  const [uf, setUf] = useState('');
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(null);
  const [ficha, setFicha] = useState(null);

  const carregar = async () => {
    try {
      const [o, c] = await Promise.all([
        api.orgaos({ busca: busca || undefined, uf: uf || undefined }),
        api.concorrentes({ limite: 100 }),
      ]);
      setOrgaos(o.dados);
      setConcorrentes(c.dados || []);
      setErro(null);
    } catch (e) {
      setErro(e.message);
    }
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uf]);

  const agregar = async () => {
    setOcupado('agregar');
    setAviso(null);
    try {
      const r = await api.agregarDossies();
      setAviso(r.mensagem);
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(null);
    }
  };

  if (erro && !orgaos) return <p className="m-4 text-sm text-erro">{erro}</p>;
  if (!orgaos) return <Loader2 size={16} className="animate-spin text-texto-suave m-4" />;

  const ufs = [...new Set(orgaos.map((o) => o.uf).filter(Boolean))].sort();

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-borda flex items-center gap-3 shrink-0 flex-wrap">
        <h1 className="font-titulo text-xl">Órgãos e concorrentes</h1>
        <div className="flex items-center gap-1.5 flex-1 min-w-[16rem] max-w-md">
          <Search size={13} className="text-texto-suave shrink-0" />
          <input
            className="campo-caixa flex-1"
            placeholder="órgão ou município"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && carregar()}
          />
          <select className="campo-caixa" value={uf} onChange={(e) => setUf(e.target.value)}>
            <option value="">todas UFs</option>
            {ufs.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <button className="botao flex items-center gap-1" onClick={agregar} disabled={Boolean(ocupado)}>
          {ocupado === 'agregar' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCcw size={12} />}
          recalcular
        </button>
      </div>

      <nav className="px-4 pt-3 flex gap-4 text-xs border-b border-borda shrink-0">
        {[
          ['orgaos', `Órgãos ${orgaos.length}`],
          ['concorrentes', `Concorrentes ${concorrentes.length}`],
        ].map(([chave, rotulo]) => (
          <button
            key={chave}
            onClick={() => setAba(chave)}
            className={`pb-2 border-b-2 whitespace-nowrap ${
              aba === chave ? 'border-texto text-texto' : 'border-transparent text-texto-suave hover:text-texto'
            }`}
          >
            {rotulo}
          </button>
        ))}
      </nav>

      {erro && <p className="mx-4 mt-2 px-3 py-2 text-xs border border-erro/40 text-erro rounded bg-erro/5">{erro}</p>}
      {aviso && (
        <p className="mx-4 mt-2 px-3 py-2 text-xs border border-borda bg-superficie rounded text-texto-suave">
          {aviso}
        </p>
      )}

      <div className="flex-1 overflow-auto p-4">
        {aba === 'orgaos' ? (
          <TabelaOrgaos linhas={orgaos} aoAbrir={(cnpj) => setFicha({ tipo: 'orgao', cnpj })} />
        ) : (
          <TabelaConcorrentes
            linhas={concorrentes}
            aoAbrir={(cnpj) => setFicha({ tipo: 'concorrente', cnpj })}
          />
        )}
      </div>

      {ficha && <Ficha {...ficha} aoFechar={() => setFicha(null)} aoAbrirLicitacao={aoAbrir} />}
    </div>
  );
}

function TabelaOrgaos({ linhas, aoAbrir }) {
  if (!linhas.length) {
    return (
      <p className="text-sm text-texto-suave max-w-2xl">
        Nenhum órgão agregado ainda. Use <span className="font-mono">recalcular</span> — a ficha sai do que a
        coleta já trouxe, sem ir à internet.
      </p>
    );
  }
  const pct = (v) => (v === null || v === undefined ? '—' : `${(Number(v) * 100).toFixed(0)}%`);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[48rem]">
        <thead className="text-xs uppercase tracking-wide text-texto-suave border-b border-borda">
          <tr>
            <th className="text-left py-2 font-normal">Órgão</th>
            <th className="text-left py-2 font-normal">Cidade</th>
            <th className="text-right py-2 font-normal">Contratações</th>
            <th className="text-right py-2 font-normal">Sem vencedor</th>
            <th className="text-right py-2 font-normal">Desconto</th>
            <th className="text-left py-2 font-normal pl-3">Modalidade</th>
            <th className="text-right py-2 font-normal">Recorrências</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((o) => (
            <tr key={o.cnpj} className="border-b border-borda/40 hover:bg-white/[0.03]">
              <td className="py-1.5">
                <button className="text-left hover:text-voltagem flex items-center gap-1.5" onClick={() => aoAbrir(o.cnpj)}>
                  <Building2 size={12} className="text-texto-suave shrink-0" />
                  {resumir(o.nome, 44)}
                </button>
              </td>
              <td className="py-1.5 text-xs text-texto-suave">
                {o.municipio || '—'}
                {o.uf && <span className="font-mono"> · {o.uf}</span>}
              </td>
              <td className="py-1.5 text-right font-mono">{o.contratacoes}</td>
              <td className={`py-1.5 text-right font-mono ${o.sem_vencedor > 0 ? 'text-voltagem' : 'text-texto-suave'}`}>
                {o.sem_vencedor || '—'}
              </td>
              <td className="py-1.5 text-right font-mono">{pct(o.desconto_medio)}</td>
              <td className="py-1.5 pl-3 text-xs text-texto-suave">{o.modalidade_frequente || '—'}</td>
              <td className="py-1.5 text-right font-mono text-texto-suave">{o.recorrencias || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TabelaConcorrentes({ linhas, aoAbrir }) {
  if (!linhas.length) {
    return <p className="text-sm text-texto-suave">Nenhum concorrente registrado ainda.</p>;
  }
  const pct = (v) => (v === null || v === undefined ? '—' : `${(Number(v) * 100).toFixed(0)}%`);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[46rem]">
        <thead className="text-xs uppercase tracking-wide text-texto-suave border-b border-borda">
          <tr>
            <th className="text-left py-2 font-normal">Empresa</th>
            <th className="text-left py-2 font-normal">CNPJ</th>
            <th className="text-right py-2 font-normal">Disputou</th>
            <th className="text-right py-2 font-normal">Itens</th>
            <th className="text-right py-2 font-normal">Ganhou</th>
            <th className="text-right py-2 font-normal">Desconto mediano</th>
            <th className="text-left py-2 font-normal pl-3">Sanções</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((c) => (
            <tr key={c.cnpj} className="border-b border-borda/40 hover:bg-white/[0.03]">
              <td className="py-1.5">
                <button className="text-left hover:text-voltagem" onClick={() => aoAbrir(c.cnpj)}>
                  {resumir(c.razao_social || c.empresa, 40)}
                  {c.me_epp ? <span className="text-[11px] text-texto-suave ml-1.5">ME/EPP</span> : null}
                </button>
              </td>
              <td className="py-1.5 font-mono text-xs">{c.cnpj}</td>
              <td className="py-1.5 text-right font-mono">{c.disputas ?? c.licitacoes}</td>
              <td className="py-1.5 text-right font-mono">{c.itens ?? '—'}</td>
              <td className="py-1.5 text-right font-mono text-voltagem">{c.vitorias ?? '—'}</td>
              <td className="py-1.5 text-right font-mono">{pct(c.desconto_mediano)}</td>
              <td className="py-1.5 pl-3 text-xs">
                {c.sancoes_checado_em ? (
                  c.sancionado ? (
                    <span className="text-erro flex items-center gap-1">
                      <ShieldAlert size={11} /> há registro
                    </span>
                  ) : (
                    <span className="text-texto-suave flex items-center gap-1">
                      <ShieldCheck size={11} /> {formatarData(c.sancoes_checado_em)}
                    </span>
                  )
                ) : (
                  <span className="text-texto-suave opacity-70">não consultado</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A ficha da seção 26.1 ou 27.1, numa gaveta. */
function Ficha({ tipo, cnpj, aoFechar, aoAbrirLicitacao }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [sancoes, setSancoes] = useState(null);

  useEffect(() => {
    const buscar = tipo === 'orgao' ? api.orgao(cnpj) : api.dossieConcorrente(cnpj);
    buscar.then(setDados).catch((e) => setErro(e.message));
  }, [tipo, cnpj]);

  const consultarSancoes = async () => {
    setOcupado(true);
    try {
      setSancoes(await api.consultarSancoes(cnpj));
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(false);
    }
  };

  const pct = (v) => (v === null || v === undefined ? '—' : `${(Number(v) * 100).toFixed(0)}%`);

  return (
    <div className="fixed inset-0 bg-obsidiana/80 flex justify-end z-20" onClick={aoFechar}>
      <aside
        className="w-full max-w-2xl bg-superficie border-l border-borda h-full overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-borda flex items-start gap-2 sticky top-0 bg-superficie">
          <div className="flex-1">
            <h2 className="font-titulo text-base">
              {dados ? (tipo === 'orgao' ? dados.orgao.nome : dados.concorrente.razao_social) : 'carregando…'}
            </h2>
            <p className="font-mono text-xs text-texto-suave">{cnpj}</p>
          </div>
          <button className="text-texto-suave hover:text-texto" onClick={aoFechar}>
            <X size={16} />
          </button>
        </header>

        <div className="p-4 space-y-4">
          {erro && <p className="text-sm text-erro">{erro}</p>}
          {!dados && !erro && <Loader2 size={16} className="animate-spin text-texto-suave" />}

          {dados && tipo === 'orgao' && (
            <>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                <Campo rotulo="Contratações no painel" valor={dados.orgao.contratacoes} />
                <Campo rotulo="Homologadas" valor={dados.orgao.homologadas} />
                <Campo rotulo="Itens sem vencedor" valor={dados.orgao.sem_vencedor} />
                <Campo rotulo="Desconto médio obtido" valor={pct(dados.orgao.desconto_medio)} />
                <Campo rotulo="Modalidade mais usada" valor={dados.orgao.modalidade_frequente} />
                <Campo rotulo="Plataforma" valor={dados.orgao.plataforma_frequente} />
                <Campo rotulo="Valor total" valor={moeda(dados.orgao.valor_total)} />
                <Campo rotulo="Recorrências detectadas" valor={dados.orgao.recorrencias} />
              </dl>

              {dados.orgao.exigencias_json.length > 0 && (
                <Bloco titulo="Exigências que costuma pedir">
                  <ul className="space-y-0.5">
                    {dados.orgao.exigencias_json.map((e) => (
                      <li key={e.codigo} className="text-xs flex items-baseline gap-2">
                        <span className="flex-1">{e.rotulo}</span>
                        <span className="font-mono text-texto-suave">
                          {e.exigiu}/{e.de}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Bloco>
              )}

              {dados.orgao.fornecedores_json.length > 0 && (
                <Bloco titulo="Fornecedores recorrentes">
                  <ul className="space-y-0.5">
                    {dados.orgao.fornecedores_json.map((f) => (
                      <li key={f.cnpj} className="text-xs flex items-baseline gap-2">
                        <span className="flex-1">{resumir(f.nome, 50)}</span>
                        <span className="font-mono text-texto-suave">{f.vezes}×</span>
                      </li>
                    ))}
                  </ul>
                </Bloco>
              )}

              {dados.recorrencias.length > 0 && (
                <Bloco titulo="Costuma abrir">
                  <ul className="space-y-0.5">
                    {dados.recorrencias.map((r) => (
                      <li key={r.id} className="text-xs flex items-baseline gap-2">
                        <span className="flex-1">{resumir(r.objeto_exemplo || r.assinatura_objeto, 56)}</span>
                        <span className="font-mono text-texto-suave">
                          {r.proxima_prevista ? formatarData(r.proxima_prevista) : 'sem previsão'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Bloco>
              )}

              <Bloco titulo={`Licitações no painel (${dados.licitacoes.length})`}>
                <ul className="space-y-1">
                  {dados.licitacoes.map((l) => (
                    <li key={l.id} className="text-xs flex items-baseline gap-2">
                      <button
                        className="text-left flex-1 hover:text-voltagem"
                        onClick={() => {
                          aoFechar();
                          aoAbrirLicitacao && aoAbrirLicitacao(l.id);
                        }}
                      >
                        {resumir(l.objeto, 62)}
                      </button>
                      <span className="font-mono text-texto-suave">{moeda(l.valor_estimado)}</span>
                    </li>
                  ))}
                </ul>
              </Bloco>
            </>
          )}

          {dados && tipo === 'concorrente' && (
            <>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                <Campo rotulo="Disputou" valor={`${dados.concorrente.disputas} licitações`} />
                <Campo rotulo="Itens em que apareceu" valor={dados.concorrente.itens} />
                <Campo rotulo="Ganhou" valor={`${dados.concorrente.vitorias} itens`} />
                <Campo rotulo="Desconto médio" valor={pct(dados.concorrente.desconto_medio)} />
                <Campo rotulo="Desconto mediano" valor={pct(dados.concorrente.desconto_mediano)} />
                <Campo rotulo="Desclassificada" valor={`${dados.concorrente.desclassificacoes} vezes`} />
                <Campo rotulo="Atua em" valor={(dados.concorrente.ufs || []).join(', ') || '—'} />
                <Campo
                  rotulo="Encontrou você"
                  valor={
                    dados.concorrente.encontros
                      ? `${dados.concorrente.encontros} vezes — perdeu ${dados.concorrente.encontros_perdidos}`
                      : 'nunca'
                  }
                />
              </dl>

              {Object.keys(dados.concorrente.menor_preco_json || {}).length > 0 && (
                <Bloco titulo="Menor preço já praticado, por grupo">
                  <ul className="space-y-0.5">
                    {Object.entries(dados.concorrente.menor_preco_json).map(([grupo, valor]) => (
                      <li key={grupo} className="text-xs flex items-baseline gap-2">
                        <span className="flex-1">{grupo}</span>
                        <span className="font-mono text-voltagem">{moeda(valor)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-[11px] text-texto-suave">
                    Se o seu custo está acima disto, aquela disputa não é sua — e é melhor saber antes de
                    gastar o dia montando proposta.
                  </p>
                </Bloco>
              )}

              <Bloco titulo="Sanções — CEIS e CNEP">
                {!dados.sancoes_disponivel ? (
                  <p className="text-xs text-texto-suave">
                    Consulta desligada: falta <span className="font-mono">PORTAL_TRANSPARENCIA_CHAVE</span>. A
                    chave é gratuita, pelo cadastro no gov.br. Sem ela o painel não diz “nenhuma sanção” — isso
                    seria uma afirmação sem consulta.
                  </p>
                ) : (
                  <>
                    <button className="botao flex items-center gap-1" onClick={consultarSancoes} disabled={ocupado}>
                      {ocupado ? <Loader2 size={11} className="animate-spin" /> : <ShieldCheck size={11} />}
                      consultar agora
                    </button>
                    {(sancoes || dados.concorrente.sancoes_checado_em) && (
                      <p className={`mt-2 text-xs ${sancoes && sancoes.sancionado ? 'text-erro' : 'text-texto-suave'}`}>
                        {sancoes
                          ? sancoes.resumo
                          : `Última consulta em ${formatarData(dados.concorrente.sancoes_checado_em)}: ${
                              dados.concorrente.sancionado ? 'há registro' : 'nada encontrado'
                            }.`}
                      </p>
                    )}
                  </>
                )}
              </Bloco>

              <Bloco titulo={`Onde apareceu (${dados.licitacoes.length})`}>
                <ul className="space-y-1">
                  {dados.licitacoes.map((l) => (
                    <li key={l.id} className="text-xs flex items-baseline gap-2">
                      <button
                        className="text-left flex-1 hover:text-voltagem"
                        onClick={() => {
                          aoFechar();
                          aoAbrirLicitacao && aoAbrirLicitacao(l.id);
                        }}
                      >
                        {resumir(l.objeto, 56)}
                      </button>
                      <span className="font-mono text-texto-suave">{moeda(l.valor_estimado)}</span>
                    </li>
                  ))}
                </ul>
              </Bloco>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function Campo({ rotulo, valor }) {
  return (
    <div className="flex items-baseline gap-2 border-b border-borda/40 py-1">
      <dt className="text-[11px] uppercase tracking-wide text-texto-suave flex-1">{rotulo}</dt>
      <dd className="font-mono text-sm">{valor ?? '—'}</dd>
    </div>
  );
}

function Bloco({ titulo, children }) {
  return (
    <section>
      <h3 className="text-[11px] uppercase tracking-wide text-texto-suave mb-1.5">{titulo}</h3>
      {children}
    </section>
  );
}
