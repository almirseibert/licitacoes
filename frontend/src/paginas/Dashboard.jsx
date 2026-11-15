import { useEffect, useState } from 'react';
import { Loader2, Newspaper, FolderLock, ListTodo, MessagesSquare, Table2, Map as IconeMapa } from 'lucide-react';
import { api } from '../servicos/api';
import { moeda } from '../servicos/formato';
import AtalhosFerramentas from '../componentes/AtalhosFerramentas';
import MapaBrasil from '../componentes/MapaBrasil';
import LicitacoesGerenciadas from '../componentes/LicitacoesGerenciadas';
import AgendaResumo from '../componentes/AgendaResumo';

/**
 * Dashboard (Seção 8): o que pede atenção hoje e o tamanho do que está em jogo.
 * Cada cartão, fatia do mapa e linha leva à tela onde se resolve o que ele conta.
 */
export default function Dashboard({ aoIr, aoAbrirLicitacao, temRecurso = () => true }) {
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
      nota:
        (c.documentos_vencidos ? `em 30 dias · ${c.documentos_vencidos} já vencido(s)` : 'em 30 dias') +
        (c.documentos_revisar ? ` · ${c.documentos_revisar} para revisar` : ''),
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
        {c.portais_vencendo + c.portais_vencidos > 0 && (
          <button
            onClick={() => aoIr('cofre', { aba: 'portais' })}
            className={`w-full text-left text-xs px-3 py-2 rounded border ${
              c.portais_vencidos ? 'border-erro/40 text-erro bg-erro/5' : 'border-atencao/40 text-atencao bg-atencao/5'
            }`}
          >
            Cadastro em portal: {c.portais_vencendo} vencendo em 30 dias
            {c.portais_vencidos ? ` · ${c.portais_vencidos} vencido(s)` : ''} — abrir a agenda de portais.
          </button>
        )}

        <AtalhosFerramentas aoIr={aoIr} temRecurso={temRecurso} />

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
          <Numero rotulo="Oportunidades do dia" valor={dados.oportunidades.do_dia} nota="entraram nas últimas 24 h com pontuação" aoClicar={() => aoIr('radar', { novas_24h: '1' })} />
          <Numero
            rotulo="Vigentes"
            valor={dados.oportunidades.vigentes}
            nota={`${moeda(dados.oportunidades.valor_vigentes)} estimados, ainda recebendo proposta`}
            aoClicar={() => aoIr('radar', { em_aberto: '1' })}
          />
          <Numero
            rotulo="Valor total em disputa"
            valor={moeda(dados.em_disputa.valor)}
            destaque
            nota={
              `${dados.em_disputa.quantidade} licitação(ões) em análise, decididas ou em disputa` +
              (dados.em_disputa.sem_valor ? ` · ${dados.em_disputa.sem_valor} sem valor publicado (fora da soma)` : '')
            }
            aoClicar={() => aoIr('radar', { lista: 'gerenciadas' })}
          />
        </section>

        <h2 className="font-titulo text-base">Licitações Gerenciadas</h2>
        <section aria-label="Licitações gerenciadas e agenda" className="grid grid-cols-1 lg:grid-cols-[22rem_1fr] gap-3">
          <LicitacoesGerenciadas dados={dados.licitacoes_gerenciadas} aoIr={aoIr} />
          <AgendaResumo aoAbrir={aoAbrirLicitacao} aoVerCalendario={() => aoIr('calendario')} />
        </section>

        <PorUf linhas={dados.por_uf} aoIr={aoIr} />
      </div>
    </div>
  );
}

function Numero({ rotulo, valor, nota, destaque, aoClicar }) {
  return (
    <button
      onClick={aoClicar}
      className={`text-left border rounded p-3 hover:border-texto-suave transition-colors ${destaque ? 'border-voltagem/50' : 'border-borda'}`}
    >
      <p className="text-xs text-texto-suave">{rotulo}</p>
      <p className="font-mono text-2xl mt-1">{valor}</p>
      <p className="text-[11px] text-texto-suave mt-0.5">{nota}</p>
    </button>
  );
}

/**
 * Vigentes por UF: mapa do Brasil por padrão (Seção "Decisões de interface" do
 * benchmark — mapa, não lista), com a tabela como alternativa exata. Clicar
 * num estado ou numa linha vai ao Radar já filtrado por ele.
 */
function PorUf({ linhas, aoIr }) {
  const [visao, setVisao] = useState('mapa');
  const irParaUf = (uf) => aoIr('radar', { uf, em_aberto: '1' });

  return (
    <section aria-labelledby="titulo-uf" className="border border-borda rounded p-3">
      <div className="flex items-center gap-2 mb-3">
        <h2 id="titulo-uf" className="text-sm">Licitações vigentes por estado</h2>
        <button
          type="button"
          className="ml-auto text-xs text-texto-suave hover:text-texto flex items-center gap-1"
          onClick={() => setVisao((v) => (v === 'mapa' ? 'tabela' : 'mapa'))}
        >
          {visao === 'mapa' ? <Table2 size={12} /> : <IconeMapa size={12} />} {visao === 'mapa' ? 'ver tabela' : 'ver mapa'}
        </button>
      </div>

      {linhas.length === 0 ? (
        <p className="text-sm text-texto-suave">Nenhuma licitação vigente.</p>
      ) : visao === 'tabela' ? (
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
                <td className="py-1">
                  <button className="hover:underline" onClick={() => irParaUf(l.uf)}>{l.uf}</button>
                </td>
                <td className="py-1 text-right font-mono">{l.quantidade}</td>
                <td className="py-1 text-right font-mono">{moeda(l.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <MapaBrasil porUf={linhas} aoClicarUf={irParaUf} />
      )}
    </section>
  );
}
