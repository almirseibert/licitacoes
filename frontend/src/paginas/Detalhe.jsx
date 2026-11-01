import { useEffect, useState } from 'react';
import { ExternalLink, Loader2, RefreshCcw, X } from 'lucide-react';
import { api } from '../servicos/api';
import { moeda, moedaExata, dataHora } from '../servicos/formato';
import Anel from '../componentes/Anel';
import Contagem from '../componentes/Contagem';

const ETAPAS = [
  'Triagem', 'Analisando', 'Vou disputar', 'Documentação',
  'Proposta enviada', 'Em disputa', 'Resultado', 'Descartada',
];

/**
 * Gaveta de detalhe da licitação. Na Fase 1 traz Resumo e Itens; as abas
 * Arquivos, Exigências, Preço, Concorrentes e Anotações entram nas fases
 * seguintes (seção 11.2).
 */
export default function Detalhe({ id, onFechar }) {
  const [licitacao, setLicitacao] = useState(null);
  const [erro, setErro] = useState(null);
  const [aba, setAba] = useState('resumo');
  const [salvando, setSalvando] = useState(false);

  const carregar = () => {
    api.licitacao(id).then(setLicitacao).catch((e) => setErro(e.message));
  };

  useEffect(() => {
    setLicitacao(null);
    carregar();
    const fechar = (e) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', fechar);
    return () => window.removeEventListener('keydown', fechar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const mudarEtapa = async (etapa) => {
    setSalvando(true);
    try {
      await api.atualizarLicitacao(id, { etapa });
      setLicitacao((l) => ({ ...l, etapa }));
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const rebuscar = async () => {
    setSalvando(true);
    try {
      await api.detalharLicitacao(id);
      setErro(null);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={onFechar}>
      <aside
        className="w-full max-w-3xl h-full bg-obsidiana border-l border-borda flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {!licitacao && !erro && (
          <div className="flex-1 grid place-items-center text-texto-suave">
            <Loader2 className="animate-spin" />
          </div>
        )}

        {erro && <p className="m-4 text-sm text-erro">{erro}</p>}

        {licitacao && (
          <>
            <header className="border-b border-borda p-4">
              <div className="flex items-start gap-3">
                <Anel pontuacao={licitacao.pontuacao} tamanho={44} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug">{licitacao.objeto}</p>
                  <p className="text-xs text-texto-suave mt-1">
                    {licitacao.orgao_nome}
                    {licitacao.unidade ? ` · ${licitacao.unidade}` : ''}
                  </p>
                </div>
                <button onClick={onFechar} className="text-texto-suave hover:text-texto" title="Fechar (Esc)">
                  <X size={18} />
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-texto-suave">
                <span>
                  fecha em <Contagem fim={licitacao.fim_propostas} />
                </span>
                <span className="font-mono text-texto">{moedaExata(licitacao.valor_estimado)}</span>
                <span>{licitacao.modalidade || '—'}</span>
                <span>{licitacao.municipio ? `${licitacao.municipio}/${licitacao.uf}` : licitacao.uf}</span>
                <span className="font-mono">{licitacao.numero_controle || licitacao.chave_externa}</span>

                <select
                  value={licitacao.etapa || 'Triagem'}
                  disabled={salvando}
                  onChange={(e) => mudarEtapa(e.target.value)}
                  className="bg-superficie border border-borda rounded px-2 py-1 text-xs text-texto"
                >
                  {ETAPAS.map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>

                {licitacao.link_portal && (
                  <a
                    href={licitacao.link_portal}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 hover:text-texto"
                  >
                    PNCP <ExternalLink size={11} />
                  </a>
                )}
                {licitacao.link_disputa && (
                  <a
                    href={licitacao.link_disputa}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 hover:text-texto"
                  >
                    plataforma de disputa <ExternalLink size={11} />
                  </a>
                )}
              </div>

              <nav className="mt-3 flex gap-4 text-xs">
                {[
                  ['resumo', 'Resumo'],
                  ['itens', `Itens${licitacao.itens ? ` (${licitacao.itens.length})` : ''}`],
                  ['pontuacao', 'Pontuação'],
                ].map(([chave, rotulo]) => (
                  <button
                    key={chave}
                    onClick={() => setAba(chave)}
                    className={`pb-1 border-b-2 ${
                      aba === chave ? 'border-texto text-texto' : 'border-transparent text-texto-suave hover:text-texto'
                    }`}
                  >
                    {rotulo}
                  </button>
                ))}
                <button
                  onClick={rebuscar}
                  disabled={salvando}
                  className="ml-auto flex items-center gap-1 text-texto-suave hover:text-texto"
                  title="Buscar detalhe e itens no portal de novo"
                >
                  <RefreshCcw size={12} /> rebuscar no portal
                </button>
              </nav>
            </header>

            <div className="flex-1 overflow-auto p-4 text-sm">
              {aba === 'resumo' && <Resumo licitacao={licitacao} />}
              {aba === 'itens' && <Itens itens={licitacao.itens || []} />}
              {aba === 'pontuacao' && <Pontuacao detalhe={licitacao.pontuacao_detalhe} />}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function Linha({ rotulo, children }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-3 py-1.5 border-b border-borda/60">
      <span className="text-xs uppercase tracking-wide text-texto-suave">{rotulo}</span>
      <span className="text-sm">{children || '—'}</span>
    </div>
  );
}

function Resumo({ licitacao: l }) {
  return (
    <div>
      <Linha rotulo="Situação">{l.situacao}</Linha>
      <Linha rotulo="Esfera">{l.esfera}</Linha>
      <Linha rotulo="Modo de disputa">{l.modo_disputa}</Linha>
      <Linha rotulo="Processo">{l.processo}</Linha>
      <Linha rotulo="Nº da compra">{l.numero_compra}</Linha>
      <Linha rotulo="CNPJ do órgão"><span className="font-mono">{l.orgao_cnpj}</span></Linha>
      <Linha rotulo="Abertura das propostas"><span className="font-mono">{dataHora(l.abertura_propostas)}</span></Linha>
      <Linha rotulo="Fim das propostas"><span className="font-mono">{dataHora(l.fim_propostas)}</span></Linha>
      <Linha rotulo="Valor estimado"><span className="font-mono">{moedaExata(l.valor_estimado)}</span></Linha>
      <Linha rotulo="Orçamento sigiloso">{l.orcamento_sigiloso ? 'sim' : 'não'}</Linha>
      <Linha rotulo="Plataforma de disputa">{l.plataforma_disputa}</Linha>
      <Linha rotulo="Benefício ME/EPP">{l.beneficio_me || 'não identificado'}</Linha>
      <Linha rotulo="Palavra que casou">{l.palavra_casada}</Linha>
      <Linha rotulo="Grupo">{l.grupo}</Linha>
      <Linha rotulo="Fonte">{l.fonte_nome}</Linha>
      <Linha rotulo="Coletada em"><span className="font-mono">{dataHora(l.criado_em)}</span></Linha>
    </div>
  );
}

function Itens({ itens }) {
  if (!itens.length) {
    return (
      <p className="text-texto-suave text-sm">
        Nenhum item gravado ainda. Use <span className="font-mono">rebuscar no portal</span> — o endpoint de itens do
        PNCP fica fora do ar de tempo em tempo e o painel tenta de novo sem perder a licitação.
      </p>
    );
  }

  return (
    <table className="w-full text-sm tabela-densa">
      <thead>
        <tr>
          <th className="w-12">Nº</th>
          <th>Descrição</th>
          <th className="w-20 text-right">Qtd.</th>
          <th className="w-16">Un.</th>
          <th className="w-28 text-right">Unitário</th>
          <th className="w-28 text-right">Total</th>
          <th className="w-40">Benefício</th>
        </tr>
      </thead>
      <tbody>
        {itens.map((i) => (
          <tr key={i.id}>
            <td className="font-mono text-xs">{i.numero_item}</td>
            <td className="text-xs">{i.descricao}</td>
            <td className="text-right font-mono text-xs">{Number(i.quantidade || 0).toLocaleString('pt-BR')}</td>
            <td className="text-xs text-texto-suave">{i.unidade}</td>
            <td className="text-right font-mono text-xs">{moeda(i.valor_unit_estimado)}</td>
            <td className="text-right font-mono text-xs">{moeda(i.valor_total_estimado)}</td>
            <td className="text-xs text-texto-suave">{i.beneficio}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Pontuacao({ detalhe }) {
  const lista = typeof detalhe === 'string' ? JSON.parse(detalhe || '[]') : detalhe || [];
  if (!lista.length) return <p className="text-texto-suave">Sem detalhamento de pontuação.</p>;

  return (
    <div>
      <p className="text-xs text-texto-suave mb-3">
        Como a pontuação foi montada (seção 6 da especificação). Os pesos passam para a tela de
        Configurações na Fase 2.
      </p>
      {lista.map((item, indice) => (
        <div key={`${item.regra}-${indice}`} className="flex items-baseline gap-3 py-1.5 border-b border-borda/60">
          <span className={`font-mono text-sm w-12 ${item.pontos < 0 ? 'text-erro' : 'text-ok'}`}>
            {item.pontos > 0 ? `+${item.pontos}` : item.pontos}
          </span>
          <span className="text-xs uppercase tracking-wide text-texto-suave w-40">{item.regra}</span>
          <span className="text-sm flex-1">{item.motivo}</span>
        </div>
      ))}
    </div>
  );
}
