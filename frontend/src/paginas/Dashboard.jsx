import { useEffect, useState } from 'react';
import { Loader2, Newspaper, FolderLock, ListTodo, MessagesSquare, Table2, BarChart3 } from 'lucide-react';
import { api } from '../servicos/api';
import { moeda } from '../servicos/formato';

/**
 * Dashboard (Seção 8): o que pede atenção hoje e o tamanho do que está em jogo.
 * Cada cartão leva à tela onde se resolve o que ele conta.
 */
export default function Dashboard({ aoIr }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    api.dashboard().then(setDados).catch((e) => setErro(e.message));
  }, []);

  if (erro) return <p className="m-4 text-sm text-erro">{erro}</p>;
  if (!dados) return <Loader2 size={16} className="m-4 animate-spin text-texto-suave" />;

  const c = dados.cartoes;
  const cartoes = [
    {
      chave: 'boletins', icone: Newspaper, rotulo: 'Boletins não lidos', valor: c.boletins_nao_lidos,
      nota: 'por você', alerta: c.boletins_nao_lidos > 0 ? 'atencao' : null,
    },
    {
      chave: 'cofre', icone: FolderLock, rotulo: 'Documentos vencendo', valor: c.documentos_vencendo,
      nota: c.documentos_vencidos ? `em 30 dias · ${c.documentos_vencidos} já vencido(s)` : 'em 30 dias',
      alerta: c.documentos_vencidos ? 'erro' : c.documentos_vencendo ? 'atencao' : null,
    },
    {
      chave: 'tarefas', icone: ListTodo, rotulo: 'Tarefas atrasadas', valor: c.tarefas_atrasadas,
      nota: `${c.minhas_tarefas_atrasadas} sua(s) · ${c.tarefas_hoje} para hoje`,
      alerta: c.tarefas_atrasadas ? 'erro' : null,
    },
    {
      chave: 'funil', icone: MessagesSquare, rotulo: 'Novos andamentos', valor: c.novos_andamentos,
      nota: 'da equipe, em 7 dias', alerta: null,
    },
  ];

  return (
    <div className="h-full overflow-auto">
      <div className="px-4 py-3 border-b border-borda">
        <h1 className="font-titulo text-xl">Dashboard</h1>
      </div>

      <div className="p-4 space-y-6 max-w-6xl">
        <section aria-label="O que pede atenção" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {cartoes.map(({ chave, icone: Icone, rotulo, valor, nota, alerta }) => (
            <button
              key={rotulo}
              onClick={() => aoIr(chave)}
              className="text-left border border-borda rounded bg-superficie p-3 hover:border-texto-suave transition-colors"
            >
              <p className="text-xs text-texto-suave flex items-center gap-1.5">
                <Icone size={13} /> {rotulo}
              </p>
              <p className={`font-mono text-2xl mt-1 ${alerta === 'erro' ? 'text-erro' : alerta === 'atencao' ? 'text-atencao' : ''}`}>
                {valor}
              </p>
              <p className="text-[11px] text-texto-suave mt-0.5">{nota}</p>
            </button>
          ))}
        </section>

        <section aria-label="Oportunidades" className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Numero rotulo="Oportunidades do dia" valor={dados.oportunidades.do_dia} nota="entraram nas últimas 24 h com pontuação" />
          <Numero
            rotulo="Vigentes"
            valor={dados.oportunidades.vigentes}
            nota={`${moeda(dados.oportunidades.valor_vigentes)} estimados, ainda recebendo proposta`}
          />
          <Numero
            rotulo="Valor total em disputa"
            valor={moeda(dados.em_disputa.valor)}
            destaque
            nota={
              `${dados.em_disputa.quantidade} licitação(ões) em análise, decididas ou em disputa` +
              (dados.em_disputa.sem_valor ? ` · ${dados.em_disputa.sem_valor} sem valor publicado (fora da soma)` : '')
            }
          />
        </section>

        <PorUf linhas={dados.por_uf} />
      </div>
    </div>
  );
}

function Numero({ rotulo, valor, nota, destaque }) {
  return (
    <div className={`border rounded p-3 ${destaque ? 'border-voltagem/50' : 'border-borda'}`}>
      <p className="text-xs text-texto-suave">{rotulo}</p>
      <p className="font-mono text-2xl mt-1">{valor}</p>
      <p className="text-[11px] text-texto-suave mt-0.5">{nota}</p>
    </div>
  );
}

/**
 * Vigentes por UF — uma série só (quantidade), barras horizontais, sem
 * legenda (o título diz o que é). O valor estimado aparece na dica e na
 * tabela, nunca num segundo eixo.
 */
function PorUf({ linhas }) {
  const [tabela, setTabela] = useState(false);
  const [foco, setFoco] = useState(null);
  const maximo = Math.max(1, ...linhas.map((l) => l.quantidade));

  return (
    <section aria-labelledby="titulo-uf" className="border border-borda rounded p-3">
      <div className="flex items-center gap-2 mb-3">
        <h2 id="titulo-uf" className="text-sm">Licitações vigentes por UF</h2>
        <button
          type="button"
          className="ml-auto text-xs text-texto-suave hover:text-texto flex items-center gap-1"
          onClick={() => setTabela((t) => !t)}
        >
          {tabela ? <BarChart3 size={12} /> : <Table2 size={12} />} {tabela ? 'ver gráfico' : 'ver tabela'}
        </button>
      </div>

      {linhas.length === 0 ? (
        <p className="text-sm text-texto-suave">Nenhuma licitação vigente.</p>
      ) : tabela ? (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-texto-suave text-left">
              <th className="py-1 font-normal">UF</th>
              <th className="py-1 font-normal text-right">Licitações</th>
              <th className="py-1 font-normal text-right">Valor estimado</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.uf} className="border-t border-borda">
                <td className="py-1">{l.uf}</td>
                <td className="py-1 text-right font-mono">{l.quantidade}</td>
                <td className="py-1 text-right font-mono">{moeda(l.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="space-y-0.5" onMouseLeave={() => setFoco(null)}>
          {linhas.map((l) => (
            <li
              key={l.uf}
              className="relative flex items-center gap-2 py-1 cursor-default"
              onMouseEnter={() => setFoco(l.uf)}
              onFocus={() => setFoco(l.uf)}
              onBlur={() => setFoco(null)}
              tabIndex={0}
              aria-label={`${l.uf}: ${l.quantidade} licitações, ${moeda(l.valor)}`}
            >
              <span className="w-8 text-xs text-texto-suave">{l.uf}</span>
              <span className="flex-1 h-3">
                <span
                  className={`block h-3 rounded-r bg-voltagem transition-opacity ${foco && foco !== l.uf ? 'opacity-40' : ''}`}
                  style={{ width: `${Math.max(1, (l.quantidade / maximo) * 100)}%` }}
                />
              </span>
              <span className="w-10 text-right font-mono text-xs">{l.quantidade}</span>
              {foco === l.uf && (
                <span
                  role="tooltip"
                  className="absolute left-10 -top-7 z-10 whitespace-nowrap px-2 py-1 text-[11px] rounded border border-borda bg-superficie shadow"
                >
                  {l.uf} · {l.quantidade} licitação(ões) · {moeda(l.valor)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
