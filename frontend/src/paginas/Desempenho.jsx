import { useEffect, useState } from 'react';
import { Loader2, Printer, Info, Lightbulb } from 'lucide-react';
import { api } from '../servicos/api';
import { moeda, data as comoData, resumir, percentual as pct, LACUNA } from '../servicos/formato';
import Barras from '../componentes/Barras';

/**
 * Meu desempenho (Seção 15 do PLANO_SAAS_CONLICITACAO.md): o que a organização
 * consulta toda semana, numa tela só — participações, vitórias, ticket médio,
 * itens vencidos, órgãos, portais, motivos de perda e margem por licitação.
 *
 * Tudo vem de /api/desempenho, por período. O que o painel não sabe aparece como
 * lacuna ("____________") ou "não disponível", nunca como zero. A barra de
 * controles some na impressão (`imprimir-oculto`).
 */

const JANELAS = [
  { chave: 'todo', rotulo: 'Todo o histórico' },
  { chave: '1m', rotulo: '1 mês' },
  { chave: '3m', rotulo: '3 meses' },
  { chave: '6m', rotulo: '6 meses' },
  { chave: '1a', rotulo: '1 ano' },
  { chave: 'definido', rotulo: 'Definir período' },
];

// Barras mede "quantidade" e "valor": aqui são participações e valor ganho.
const paraBarras = (linhas) => linhas.map((o) => ({ ...o, quantidade: o.participacoes, valor: o.valor_ganho }));
const DATA_PLAUSIVEL = /^(19|20)\d{2}-\d{2}-\d{2}$/;
const COR_SINAL = { ok: 'text-ok', atencao: 'text-atencao', erro: 'text-erro' };

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

function Bloco({ titulo, children, nota }) {
  return (
    <section className="border border-borda rounded p-3 min-w-0">
      <h2 className="text-sm mb-2">{titulo}</h2>
      {nota && <p className="text-[11px] text-texto-suave mb-2">{nota}</p>}
      {children}
    </section>
  );
}

export default function Desempenho({ aoAbrir }) {
  const [janela, setJanela] = useState('6m');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);

  // O período definido só consulta com as duas datas; as janelas, na hora.
  const pronto = janela !== 'definido' || (DATA_PLAUSIVEL.test(de) && DATA_PLAUSIVEL.test(ate));

  useEffect(() => {
    // Sem as duas datas não há período: o resultado da janela anterior não pode ficar na tela.
    setDados(null);
    setErro(null);
    if (!pronto) return undefined;
    let vivo = true;
    api
      .desempenho(janela === 'definido' ? { janela, de, ate } : { janela })
      .then((r) => vivo && setDados(r))
      .catch((e) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, [janela, de, ate, pronto]);

  const t = dados && dados.totais;
  const m = dados && dados.margens;

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex flex-wrap items-center gap-2 imprimir-oculto">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Período">
          {JANELAS.map((j) => (
            <button
              key={j.chave}
              type="button"
              className={`botao ${janela === j.chave ? 'border-voltagem text-voltagem' : ''}`}
              aria-pressed={janela === j.chave}
              onClick={() => setJanela(j.chave)}
            >
              {j.rotulo}
            </button>
          ))}
        </div>
        {janela === 'definido' && (
          <>
            <input type="date" className="campo-caixa max-w-full" value={de} onChange={(e) => setDe(e.target.value)} aria-label="De" />
            <input type="date" className="campo-caixa max-w-full" value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Até" />
          </>
        )}
        <button type="button" className="botao flex items-center gap-1 sm:ml-auto" onClick={() => window.print()} disabled={!dados}>
          <Printer size={12} /> imprimir
        </button>
      </div>

      <h1 className="text-base font-titulo">Meu desempenho</h1>
      {!pronto && <p className="text-xs text-texto-suave">Escolha as duas datas para ver o período.</p>}
      {erro && <p className="px-3 py-2 text-xs border border-erro/40 text-erro rounded bg-erro/5">{erro}</p>}
      {pronto && !dados && !erro && <Loader2 size={16} className="animate-spin text-texto-suave" />}

      {dados && (
        <>
          <p className="text-xs text-texto-suave">
            {dados.periodo.rotulo}
            {dados.periodo.de ? ` · ${comoData(dados.periodo.de)} a ${comoData(dados.periodo.ate)}` : ` · até ${comoData(dados.periodo.ate)}`}
          </p>

          {t.participacoes === 0 ? (
            <p className="text-sm text-texto-suave border border-borda rounded p-4">
              Nenhuma participação neste período. Mova uma licitação para &quot;Proposta enviada&quot; no Funil para ela entrar aqui.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
                <Numero rotulo="Participações" valor={t.participacoes} nota={`${t.em_andamento} em andamento`} />
                <Numero rotulo="Ganhas" valor={t.ganhas} />
                <Numero rotulo="Perdidas" valor={t.perdidas} />
                <Numero rotulo="Taxa de vitória" valor={pct(t.taxa_vitoria)} nota="sobre o que já teve resultado" />
                <Numero rotulo="Valor ganho" valor={moeda(t.valor_ganho)} />
                <Numero
                  rotulo="Ticket médio"
                  valor={t.ticket_medio === null ? LACUNA : moeda(t.ticket_medio)}
                  nota={t.ganhas_sem_valor ? `${t.ganhas_sem_valor} ganha(s) sem valor ficam de fora` : undefined}
                />
                <Numero rotulo="Desconto médio" valor={pct(t.desconto_medio)} nota={`em ${t.com_desconto} proposta(s) com os dois valores`} />
                <Numero
                  rotulo="Itens vencidos"
                  valor={dados.itens.vencidos ? dados.itens.vencidos.itens : LACUNA}
                  nota={dados.itens.vencidos ? `${moeda(dados.itens.vencidos.valor)} em ${dados.itens.vencidos.licitacoes} licitação(ões)` : 'cadastre o CNPJ da empresa'}
                />
              </div>
              <p className="text-[11px] text-texto-suave">
                Itens disputados e não vencidos: <strong className="font-normal text-texto">não disponível</strong> — o PNCP só publica o vencedor de cada item.
              </p>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <Barras
                  titulo="Órgãos onde mais participei"
                  linhas={paraBarras(dados.por_orgao)}
                  medida="quantidade"
                  rotuloQuantidade="Participações"
                  rotuloValor="Valor ganho"
                />
                <Barras
                  titulo="Portais de disputa"
                  linhas={paraBarras(dados.por_portal)}
                  medida="quantidade"
                  rotuloQuantidade="Participações"
                  rotuloValor="Valor ganho"
                  nota="O portal vem do cadastro da licitação no PNCP."
                />
              </div>

              <Bloco titulo="Por que perdi">
                {dados.motivos.length === 0 ? (
                  <p className="text-sm text-texto-suave">Nenhuma licitação perdida no período.</p>
                ) : (
                  <>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-texto-suave text-left">
                          <th className="py-1 font-normal">Motivo</th>
                          <th className="py-1 font-normal text-right">Perdas</th>
                          <th className="py-1 font-normal text-right">%</th>
                          <th className="py-1 font-normal text-right">Distância média</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dados.motivos.map((x) => (
                          <tr key={x.motivo} className="border-t border-borda">
                            <td className="py-1 pr-2">{x.rotulo}</td>
                            <td className="py-1 text-right font-mono">{x.quantidade}</td>
                            <td className="py-1 text-right font-mono">{x.percentual.toLocaleString('pt-BR')}%</td>
                            <td className="py-1 text-right font-mono">{pct(x.diferenca_media)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {dados.principal && (
                      <p className="flex items-start gap-2 text-xs mt-3 p-2 rounded border border-voltagem/40 bg-voltagem/5">
                        <Lightbulb size={13} className="shrink-0 mt-0.5 text-voltagem" />
                        {dados.principal.recomendacao}
                      </p>
                    )}
                    <p className="text-[11px] text-texto-suave mt-2">
                      Desclassificação e inabilitação: <strong className="font-normal text-texto">não disponível</strong> — o PNCP não publica o motivo.
                    </p>
                  </>
                )}
              </Bloco>

              <Bloco
                titulo="Margem por licitação"
                nota="(preço − custo) ÷ preço. Só entra onde há custo e preço; o custo vem da proposta (itens) ou do custo estimado da licitação."
              >
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                  <Numero rotulo="Margem das ganhas" valor={pct(m.ganhas.margem_ponderada)} nota={`${m.ganhas.licitacoes} com custo · ponderada pelo valor`} />
                  <Numero rotulo="Lucro das ganhas" valor={m.ganhas.licitacoes ? moeda(m.ganhas.lucro) : LACUNA} />
                  <Numero rotulo="No prejuízo" valor={m.todas.no_prejuizo} nota="entre as com custo" />
                  <Numero rotulo="Sem custo" valor={m.sem_custo} nota="margem não calculada" />
                </div>
                {m.linhas.length === 0 ? (
                  <p className="text-sm text-texto-suave">
                    Nenhuma licitação do período tem custo registrado. Informe o custo na aba Preço da licitação ou monte a proposta para ver a margem.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-texto-suave text-left">
                          <th className="py-1 font-normal">Licitação</th>
                          <th className="py-1 font-normal">Etapa</th>
                          <th className="py-1 font-normal text-right">Preço</th>
                          <th className="py-1 font-normal text-right">Custo</th>
                          <th className="py-1 font-normal text-right">Margem</th>
                          <th className="py-1 font-normal text-right">Na referência</th>
                        </tr>
                      </thead>
                      <tbody>
                        {m.linhas.map((l) => (
                          <tr key={l.id} className="border-t border-borda">
                            <td className="py-1 pr-2 max-w-xs">
                              <button type="button" className="text-left hover:text-voltagem truncate block max-w-full" title={l.objeto} onClick={() => aoAbrir && aoAbrir(l.id)}>
                                {resumir(l.objeto || LACUNA, 70)}
                              </button>
                              <span className="text-[10px] text-texto-suave">{l.orgao_nome}</span>
                            </td>
                            <td className="py-1 pr-2 whitespace-nowrap">{l.etapa}</td>
                            <td className="py-1 text-right font-mono whitespace-nowrap">
                              {l.preco === null ? LACUNA : moeda(l.preco)}
                              {l.preco_fonte && <span className="block text-[10px] text-texto-suave">{l.preco_fonte}</span>}
                            </td>
                            <td className="py-1 text-right font-mono whitespace-nowrap">
                              {l.custo === null ? LACUNA : moeda(l.custo)}
                              {l.custo_fonte && <span className="block text-[10px] text-texto-suave">{l.custo_fonte}</span>}
                            </td>
                            <td className={`py-1 text-right font-mono ${COR_SINAL[l.margem_sinal] || ''}`}>{pct(l.margem_pct)}</td>
                            <td className="py-1 text-right font-mono">{pct(l.margem_referencia_pct)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Bloco>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <Bloco titulo="Contratos das ganhas">
                  <dl className="grid grid-cols-2 gap-y-1 text-xs">
                    <dt className="text-texto-suave">Ganhas com contrato</dt>
                    <dd className="font-mono text-right">{dados.contratos.ganhas_com_contrato}</dd>
                    <dt className="text-texto-suave">Ganhas sem contrato registrado</dt>
                    <dd className="font-mono text-right">{dados.contratos.ganhas_sem_contrato}</dd>
                    <dt className="text-texto-suave">Valor contratado</dt>
                    <dd className="font-mono text-right">{moeda(dados.contratos.valor)}</dd>
                    <dt className="text-texto-suave">Executado</dt>
                    <dd className="font-mono text-right">{moeda(dados.contratos.valor_executado)}</dd>
                    <dt className="text-texto-suave">Vigentes</dt>
                    <dd className="font-mono text-right">{dados.contratos.vigentes}</dd>
                  </dl>
                </Bloco>

                <Bloco titulo="Meu desconto contra o do mercado" nota="Só nas licitações que têm o histórico de preços do PNCP (encerradas e homologadas).">
                  {dados.mercado.comparadas === 0 ? (
                    <p className="text-sm text-texto-suave">Nenhuma licitação do período tem as duas pontas para comparar.</p>
                  ) : (
                    <dl className="grid grid-cols-2 gap-y-1 text-xs">
                      <dt className="text-texto-suave">Licitações comparadas</dt>
                      <dd className="font-mono text-right">{dados.mercado.comparadas}</dd>
                      <dt className="text-texto-suave">Meu desconto médio</dt>
                      <dd className="font-mono text-right">{pct(dados.mercado.meu_desconto)}</dd>
                      <dt className="text-texto-suave">Desconto médio do mercado</dt>
                      <dd className="font-mono text-right">{pct(dados.mercado.desconto_mercado)}</dd>
                    </dl>
                  )}
                </Bloco>
              </div>
            </>
          )}

          <p className="flex items-start gap-2 text-[11px] text-texto-suave max-w-4xl">
            <Info size={12} className="shrink-0 mt-0.5" />
            {dados.ressalva}{dados.itens.aviso ? ` ${dados.itens.aviso}` : ''}
          </p>
        </>
      )}
    </div>
  );
}
