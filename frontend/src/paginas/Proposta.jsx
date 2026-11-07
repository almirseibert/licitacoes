import { useEffect, useState } from 'react';
import { Loader2, FileSpreadsheet, FileText, Download, AlertTriangle, Plus, Trash2, Eye } from 'lucide-react';
import { api } from '../servicos/api';
import { moedaExata, dataHora } from '../servicos/formato';

/**
 * Aba "Proposta" da licitação (seção 19).
 *
 * A tela é a visão INTERNA: custo e margem aparecem aqui e em nenhum lugar mais
 * (seção 19.4). O PDF e o XLSX entregues saem sem essas colunas, e o aviso
 * embaixo do botão existe para você nunca ter dúvida disso.
 *
 * Cada linha mostra as três referências lado a lado — o que o órgão estimou, o
 * que costuma fechar naquele grupo e o seu preço — porque é a comparação, não o
 * número isolado, que diz se vale disputar.
 */
export default function Proposta({ id }) {
  const [lista, setLista] = useState(null);
  const [aberta, setAberta] = useState(null);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [margemLote, setMargemLote] = useState('');
  const [vendo, setVendo] = useState(null);

  // A proposta aberta é reconciliada contra a lista que acabou de chegar: a
  // que estava aberta continua aberta se ainda existir, senão abre a primeira.
  // Ler `aberta` aqui dentro não serve — o valor viria preso ao render antigo,
  // e era assim que o botão "Gerar" chegava a pedir a proposta `null`.
  const carregarLista = () =>
    api
      .propostas(id)
      .then((r) => {
        setLista(r.dados);
        setAberta((atual) =>
          atual && r.dados.some((p) => p.id === atual) ? atual : r.dados.length ? r.dados[0].id : null
        );
        return r.dados;
      })
      .catch((e) => setErro(e.message));

  useEffect(() => {
    setAberta(null);
    setDados(null);
    carregarLista();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!aberta) return;
    api.proposta(id, aberta).then(setDados).catch((e) => setErro(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberta]);

  const criar = async () => {
    setSalvando(true);
    try {
      const r = await api.criarProposta(id);
      setAviso(r.mensagem);
      setDados(r);
      setAberta(r.id);
      await carregarLista();
      setErro(null);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const salvarItem = async (itemId, campos) => {
    setSalvando(true);
    try {
      setDados(await api.salvarItemProposta(id, aberta, itemId, campos));
      setErro(null);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const salvarCabecalho = async (campos) => {
    setSalvando(true);
    try {
      setDados(await api.salvarProposta(id, aberta, campos));
      setErro(null);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const aplicarMargem = async () => {
    if (margemLote === '') return;
    setSalvando(true);
    try {
      const r = await api.margemDaProposta(id, aberta, Number(margemLote) / 100);
      setDados(r);
      setAviso(r.mensagem);
      setErro(null);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const gerar = async () => {
    setGerando(true);
    try {
      const r = await api.gerarSaidaDaProposta(id, aberta);
      setAviso(r.mensagem);
      setDados(await api.proposta(id, aberta));
      await carregarLista();
      setErro(null);
    } catch (e) {
      setErro(e.message);
    } finally {
      setGerando(false);
    }
  };

  if (erro && !dados && !lista) return <p className="text-sm text-erro">{erro}</p>;
  if (!lista) return <Loader2 size={16} className="animate-spin text-texto-suave" />;

  if (!lista.length) {
    return (
      <div className="space-y-3 max-w-xl">
        {erro && <p className="text-xs text-erro">{erro}</p>}
        <p className="text-sm text-texto-suave">
          A proposta nasce dos itens do edital: o painel puxa descrição, unidade e quantidade, e você só informa
          custo e margem. Custo e margem nunca saem no PDF nem no XLSX entregues.
        </p>
        <button className="botao-primario flex items-center gap-1" onClick={criar} disabled={salvando}>
          {salvando ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Gerar proposta
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {erro && <p className="text-xs text-erro">{erro}</p>}
      {aviso && (
        <p className="text-xs text-texto-suave border border-borda rounded px-3 py-2 bg-superficie">{aviso}</p>
      )}

      <div className="flex items-center gap-3 flex-wrap text-xs">
        <select className="campo-caixa" value={aberta || ''} onChange={(e) => setAberta(Number(e.target.value))}>
          {lista.map((p) => (
            <option key={p.id} value={p.id}>
              #{p.id} · {p.status} · {p.itens} item(ns) · {moedaExata(p.valor_total)}
            </option>
          ))}
        </select>
        <button className="botao flex items-center gap-1" onClick={criar} disabled={salvando}>
          <Plus size={12} /> nova proposta
        </button>
        {dados && (
          <button
            className="text-texto-suave hover:text-erro ml-auto flex items-center gap-1"
            onClick={async () => {
              if (!window.confirm(`Apagar a proposta #${aberta}? Os arquivos gerados ficam no volume.`)) return;
              await api.apagarProposta(id, aberta).catch((e) => setErro(e.message));
              setDados(null);
              setAberta(null);
              await carregarLista();
            }}
          >
            <Trash2 size={12} /> apagar
          </button>
        )}
      </div>

      {!dados ? (
        <Loader2 size={16} className="animate-spin text-texto-suave" />
      ) : (
        <>
          {dados.referencia && (
            <p className="text-[11px] text-texto-suave">
              Preço que costuma fechar: {(dados.referencia.desconto_mediano * 100).toFixed(0)}% abaixo do estimado —{' '}
              {dados.referencia.base}
              {dados.referencia.origem === 'estudo' ? ' (do levantamento)' : ` (${dados.referencia.amostra} encerradas)`}
            </p>
          )}

          {dados.avisos.map((texto) => (
            <p key={texto} className="text-[11px] text-atencao flex items-start gap-2">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <span>{texto}</span>
            </p>
          ))}

          <div className="flex items-center gap-2 text-xs">
            <span className="text-texto-suave">margem em todos os itens com custo:</span>
            <input
              type="number"
              step="1"
              value={margemLote}
              onChange={(e) => setMargemLote(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && aplicarMargem()}
              placeholder="%"
              className="campo-caixa w-20 text-right font-mono"
            />
            <button className="botao" onClick={aplicarMargem} disabled={salvando || margemLote === ''}>
              aplicar
            </button>
            {salvando && <Loader2 size={12} className="animate-spin text-texto-suave" />}
          </div>

          <div className="overflow-x-auto border border-borda rounded">
            <table className="w-full min-w-[58rem] text-xs tabela-densa tabela-proposta">
              <thead>
                <tr className="text-texto-suave text-[10px] uppercase tracking-wide">
                  <th className="w-8 text-left">disp</th>
                  <th className="w-8 text-right">nº</th>
                  <th className="text-left">descrição</th>
                  <th className="w-28 text-left">marca/modelo</th>
                  <th className="w-20 text-right">qtd</th>
                  <th className="w-24 text-right">estimado</th>
                  <th className="w-24 text-right">fecha por</th>
                  <th className="w-28 text-right">seu custo</th>
                  <th className="w-20 text-right">margem %</th>
                  <th className="w-28 text-right">seu preço</th>
                  <th className="w-28 text-right">total</th>
                </tr>
              </thead>
              <tbody>
                {dados.itens.map((item) => (
                  <Linha
                    key={item.id}
                    item={item}
                    exigeMarca={dados.exige_marca}
                    salvar={(campos) => salvarItem(item.id, campos)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* ------------------------------------------------------- rodapé */}
          <div className="border border-borda rounded p-3 space-y-1 font-mono text-sm">
            <Resumo rotulo="Itens na disputa" valor={`${dados.totais.itens_disputados} de ${dados.itens.length}`} />
            <Resumo rotulo="Valor total da proposta" valor={moedaExata(dados.totais.valor_total)} destaque />
            <Resumo rotulo="Seu custo total" valor={moedaExata(dados.totais.custo_total)} />
            <Resumo
              rotulo="Margem média"
              valor={dados.totais.margem_media === null ? '—' : `${(dados.totais.margem_media * 100).toFixed(1)}%`}
            />
            <p className={`font-sans text-sm pt-1 ${dados.totais.sobra < 0 ? 'text-erro' : 'text-ok'}`}>
              {dados.totais.frase}
            </p>
          </div>

          {/* --------------------------------------- condições comerciais */}
          <section className="border border-borda rounded">
            <header className="px-3 py-2 border-b border-borda text-xs uppercase tracking-wide text-texto-suave">
              Condições que vão no documento
            </header>
            <div className="p-3 grid gap-2 md:grid-cols-2">
              <Campo
                rotulo="Validade (dias)"
                tipo="number"
                valor={dados.proposta.validade_dias ?? ''}
                aoSalvar={(v) => salvarCabecalho({ validade_dias: v })}
              />
              <Campo
                rotulo="Prazo de entrega"
                valor={dados.proposta.prazo_entrega ?? ''}
                aoSalvar={(v) => salvarCabecalho({ prazo_entrega: v })}
              />
              <Campo
                rotulo="Prazo de execução"
                valor={dados.proposta.prazo_execucao ?? ''}
                aoSalvar={(v) => salvarCabecalho({ prazo_execucao: v })}
              />
              <Campo
                rotulo="Garantia"
                valor={dados.proposta.garantia ?? ''}
                aoSalvar={(v) => salvarCabecalho({ garantia: v })}
              />
              <Campo
                rotulo="Condição de pagamento"
                valor={dados.proposta.condicao_pagamento ?? ''}
                aoSalvar={(v) => salvarCabecalho({ condicao_pagamento: v })}
              />
              <Campo
                rotulo="Dados bancários"
                valor={dados.proposta.dados_bancarios ?? ''}
                aoSalvar={(v) => salvarCabecalho({ dados_bancarios: v })}
              />
              <label className="text-[11px] text-texto-suave md:col-span-2">
                Observações
                <textarea
                  rows={2}
                  defaultValue={dados.proposta.observacoes ?? ''}
                  onBlur={(e) => salvarCabecalho({ observacoes: e.target.value })}
                  className="campo-caixa w-full mt-1 text-xs"
                />
              </label>
              <label className="text-[11px] text-texto-suave">
                Situação
                <select
                  className="campo-caixa w-full mt-1 text-xs"
                  value={dados.proposta.status}
                  onChange={(e) => salvarCabecalho({ status: e.target.value })}
                >
                  <option value="rascunho">rascunho</option>
                  <option value="final">final</option>
                  <option value="enviada">enviada</option>
                </select>
              </label>
            </div>
          </section>

          {/* ------------------------------------------------------- saída */}
          <div className="flex items-center gap-3 flex-wrap border-t border-borda pt-3">
            <span className="text-[11px] text-texto-suave">
              O PDF e o XLSX saem sem as colunas de custo e margem — e o XLSX com as fórmulas vivas, para o edital
              que pede planilha editável.
            </span>
            <button className="botao-primario ml-auto flex items-center gap-1" onClick={gerar} disabled={gerando || !aberta}>
              {gerando ? <Loader2 size={12} className="animate-spin" /> : <FileSpreadsheet size={12} />} Gerar PDF e
              XLSX
            </button>
          </div>

          {(dados.proposta.arquivo_pdf || dados.proposta.arquivo_xlsx) && (
            <div className="border border-ok/40 bg-ok/5 rounded px-3 py-2 text-xs flex items-center gap-3 flex-wrap">
              <span className="text-ok">
                gerada em {dataHora(dados.proposta.atualizado_em)} · entra no bloco 3 de "Montar envio"
              </span>
              <button
                className="botao flex items-center gap-1 ml-auto"
                onClick={async () => {
                  try {
                    const blob = await api.verPropostaPdf(id, aberta);
                    if (vendo) URL.revokeObjectURL(vendo);
                    setVendo(URL.createObjectURL(blob));
                  } catch (e) {
                    setErro(e.message);
                  }
                }}
              >
                <Eye size={12} /> ver o PDF
              </button>
              <button
                className="botao flex items-center gap-1"
                onClick={() =>
                  api
                    .baixarArquivoDaProposta(id, aberta, 'pdf', `Proposta_${aberta}.pdf`)
                    .catch((e) => setErro(e.message))
                }
              >
                <FileText size={12} /> PDF
              </button>
              <button
                className="botao flex items-center gap-1"
                onClick={() =>
                  api
                    .baixarArquivoDaProposta(id, aberta, 'xlsx', `Planilha_${aberta}.xlsx`)
                    .catch((e) => setErro(e.message))
                }
              >
                <Download size={12} /> XLSX
              </button>
            </div>
          )}

          {vendo && (
            <div className="fixed inset-0 bg-obsidiana/80 flex items-start justify-center p-6 z-20">
              <div className="bg-superficie border border-borda rounded w-full max-w-3xl">
                <div className="px-4 py-2 border-b border-borda flex items-center gap-2 text-xs">
                  <span className="truncate">Proposta comercial</span>
                  <button
                    className="ml-auto text-texto-suave hover:text-texto"
                    onClick={() => {
                      URL.revokeObjectURL(vendo);
                      setVendo(null);
                    }}
                  >
                    fechar
                  </button>
                </div>
                <iframe title="Proposta comercial" src={vendo} className="w-full h-[70vh] bg-white" />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Tailwind só gera a classe escrita no código: nada de `text-${cor}`.
const CORES = {
  verde: 'text-ok',
  amarelo: 'text-atencao',
  vermelho: 'text-erro',
  cinza: 'text-texto-suave',
};

const PONTOS = { verde: '●', amarelo: '●', vermelho: '●', cinza: '○' };

/** Uma linha da tabela de itens, com os campos que você edita. */
function Linha({ item, exigeMarca, salvar }) {
  const [custo, setCusto] = useState(item.custo_unitario ?? '');
  const [margem, setMargem] = useState(item.margem_pct === null ? '' : (item.margem_pct * 100).toFixed(2));
  const [preco, setPreco] = useState(item.valor_unitario ?? '');
  const [marca, setMarca] = useState(item.marca_modelo ?? '');

  // O servidor é a verdade: depois de salvar, o preço e a margem podem ter
  // mudado por causa do outro campo.
  useEffect(() => {
    setCusto(item.custo_unitario ?? '');
    setMargem(item.margem_pct === null ? '' : (item.margem_pct * 100).toFixed(2));
    setPreco(item.valor_unitario ?? '');
    setMarca(item.marca_modelo ?? '');
  }, [item.custo_unitario, item.margem_pct, item.valor_unitario, item.marca_modelo]);

  const descricao = String(item.descricao || '').split('\n')[0];

  return (
    <tr className={item.disputar ? '' : 'opacity-40'}>
      <td>
        <input
          type="checkbox"
          checked={Boolean(item.disputar)}
          title="itens que você não vai disputar saem da proposta"
          onChange={(e) => salvar({ disputar: e.target.checked ? 1 : 0 })}
        />
      </td>
      <td className="text-right font-mono text-texto-suave">{item.item_numero}</td>
      <td className="max-w-[11rem]">
        <span className="block truncate" title={item.descricao}>
          {descricao}
        </span>
        {item.inexequivel && <span className="text-[10px] text-erro">{item.inexequivel.texto}</span>}
      </td>
      <td>
        <input
          value={marca}
          onChange={(e) => setMarca(e.target.value)}
          onBlur={() => marca !== (item.marca_modelo ?? '') && salvar({ marca_modelo: marca })}
          placeholder={exigeMarca ? 'obrigatório' : 'opcional'}
          className={`campo-caixa w-full text-[11px] px-1.5 ${exigeMarca && !marca ? 'border-atencao/60' : ''}`}
        />
      </td>
      <td className="text-right font-mono">{item.quantidade ?? '—'}</td>
      <td className="text-right font-mono text-texto-suave">{moedaExata(item.valor_unit_estimado)}</td>
      <td className="text-right font-mono text-texto-suave">{moedaExata(item.fecha_por)}</td>
      <td>
        <input
          type="number"
          step="0.0001"
          min="0"
          value={custo}
          onChange={(e) => setCusto(e.target.value)}
          onBlur={() => String(custo) !== String(item.custo_unitario ?? '') && salvar({ custo_unitario: custo })}
          onKeyDown={(e) => e.key === 'Enter' && salvar({ custo_unitario: custo })}
          placeholder="preencher"
          className="campo-numero"
        />
      </td>
      <td>
        <input
          type="number"
          step="1"
          value={margem}
          onChange={(e) => setMargem(e.target.value)}
          onBlur={() => salvar({ margem_pct: margem === '' ? '' : Number(margem) / 100 })}
          onKeyDown={(e) => e.key === 'Enter' && salvar({ margem_pct: margem === '' ? '' : Number(margem) / 100 })}
          placeholder="%"
          className="campo-numero"
        />
      </td>
      <td>
        <input
          type="number"
          step="0.0001"
          min="0"
          value={preco}
          onChange={(e) => setPreco(e.target.value)}
          onBlur={() => String(preco) !== String(item.valor_unitario ?? '') && salvar({ valor_unitario: preco })}
          onKeyDown={(e) => e.key === 'Enter' && salvar({ valor_unitario: preco })}
          title="digitar o preço aqui recalcula a margem"
          className={`campo-numero ${CORES[item.semaforo.cor]}`}
        />
      </td>
      <td className="text-right font-mono">
        <span className={CORES[item.semaforo.cor]} title={item.semaforo.texto}>
          {PONTOS[item.semaforo.cor]}
        </span>{' '}
        {moedaExata(item.valor_total)}
      </td>
    </tr>
  );
}

function Resumo({ rotulo, valor, destaque }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-texto-suave font-sans text-xs uppercase tracking-wide">{rotulo}</span>
      <span className="flex-1 border-b border-dotted border-borda/60 mx-2" />
      <span className={destaque ? 'text-voltagem' : 'text-texto'}>{valor}</span>
    </div>
  );
}

/** Campo do cabeçalho: salva ao sair, como o resto do painel. */
function Campo({ rotulo, valor, tipo = 'text', aoSalvar }) {
  const [atual, setAtual] = useState(valor);

  useEffect(() => setAtual(valor), [valor]);

  return (
    <label className="text-[11px] text-texto-suave">
      {rotulo}
      <input
        type={tipo}
        value={atual}
        onChange={(e) => setAtual(e.target.value)}
        onBlur={() => String(atual) !== String(valor) && aoSalvar(atual)}
        onKeyDown={(e) => e.key === 'Enter' && aoSalvar(atual)}
        className="campo-caixa w-full mt-1 text-xs"
      />
    </label>
  );
}
