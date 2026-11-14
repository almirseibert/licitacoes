import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../servicos/api';
import { data as formatarData } from '../servicos/formato';

const SITUACAO = {
  teste: 'text-voltagem',
  ativa: 'text-ok',
  teste_vencido: 'text-atencao',
  vencida: 'text-atencao',
  suspensa: 'text-erro',
};
const COLUNAS_USO = [
  ['usuarios', 'Usuários'],
  ['palavras_chave', 'Palavras'],
  ['cofre_gb', 'Cofre (GB)'],
  ['exportacoes_mes', 'Export./mês'],
  ['ia_resumos_mes', 'IA/mês'],
];

function celulaUso(usado, limite) {
  const n = Number(usado).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  if (limite === null || limite === undefined) return n;
  const estourou = Number(usado) >= Number(limite);
  return <span className={estourou ? 'text-atencao' : ''}>{n}/{limite}</span>;
}

/**
 * Painel do superadmin (Seção 3): todas as organizações, plano, situação, uso
 * real e as ações da cobrança manual. Só aparece no menu quando o backend diz
 * que a pessoa é admin da operadora — e o backend recusa a rota para os outros.
 */
export default function Organizacoes() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [escolha, setEscolha] = useState({}); // id -> { plano, ciclo }
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(() => {
    api.adminOrganizacoes().then(setDados).catch((e) => setErro(e.message));
  }, []);
  useEffect(carregar, [carregar]);

  const agir = async (o, corpo, confirmar) => {
    if (confirmar && !window.confirm(confirmar)) return;
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      await api.adminAcao(o.id, corpo);
      setAviso(`${o.nome}: feito.`);
      carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(false);
    }
  };

  if (!dados) {
    return (
      <div className="p-6 text-sm text-texto-suave">
        {erro || (
          <span className="flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" /> carregando as organizações…
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <header className="mb-5">
        <h1 className="font-titulo text-xl">Organizações</h1>
        <p className="text-xs text-texto-suave">
          Clientes do painel, plano, uso de agora e a cobrança manual. Ativar soma um ciclo ao que já está pago.
        </p>
      </header>

      {erro && <p className="text-xs text-erro mb-3" role="alert">{erro}</p>}
      {aviso && <p className="text-xs text-ok mb-3" role="status">{aviso}</p>}

      <div className="border border-borda rounded bg-superficie overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-texto-suave text-left">
            <tr className="border-b border-borda">
              <th className="px-3 py-2 font-normal">Organização</th>
              <th className="px-3 py-2 font-normal">Plano</th>
              <th className="px-3 py-2 font-normal">Situação</th>
              {COLUNAS_USO.map(([, rotulo]) => (
                <th key={rotulo} className="px-3 py-2 font-normal text-right">{rotulo}</th>
              ))}
              <th className="px-3 py-2 font-normal">Ações</th>
            </tr>
          </thead>
          <tbody>
            {dados.organizacoes.map((o) => {
              const sel = escolha[o.id] || { plano: (o.pedido && o.pedido.plano) || o.plano || 'essencial', ciclo: (o.pedido && o.pedido.ciclo) || 'mensal' };
              const mudar = (campo, valor) => setEscolha({ ...escolha, [o.id]: { ...sel, [campo]: valor } });
              return (
                <tr key={o.id} className="border-b border-borda last:border-b-0 align-top">
                  <td className="px-3 py-2">
                    <p>{o.nome}</p>
                    <p className="text-[11px] text-texto-suave">desde {formatarData(o.criado_em)} · {o.licitacoes_pontuadas} pontuadas</p>
                    {o.pedido && (
                      <p className="text-[11px] text-atencao">pediu {o.pedido.plano} {o.pedido.ciclo}</p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {o.isenta ? 'operadora' : o.plano_nome}
                    {o.pago_ate && <p className="text-[11px] text-texto-suave font-mono">até {formatarData(o.pago_ate)}</p>}
                  </td>
                  <td className={`px-3 py-2 ${SITUACAO[o.situacao] || ''}`}>
                    {o.situacao.replace('_', ' ')}
                    {o.situacao === 'teste' && o.teste_ate && (
                      <p className="text-[11px] text-texto-suave font-mono">até {formatarData(o.teste_ate)}</p>
                    )}
                  </td>
                  {COLUNAS_USO.map(([chave]) => (
                    <td key={chave} className="px-3 py-2 text-right font-mono text-xs">
                      {celulaUso(o.uso[chave], o.isenta ? null : o.limites[chave])}
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    {o.isenta ? (
                      <span className="text-xs text-texto-suave">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <select className="campo-caixa text-xs" aria-label={`Plano para ${o.nome}`} value={sel.plano} onChange={(e) => mudar('plano', e.target.value)}>
                          {dados.planos.map((p) => <option key={p.codigo} value={p.codigo}>{p.nome}</option>)}
                        </select>
                        <select className="campo-caixa text-xs" aria-label={`Ciclo para ${o.nome}`} value={sel.ciclo} onChange={(e) => mudar('ciclo', e.target.value)}>
                          <option value="mensal">mensal</option>
                          <option value="anual">anual</option>
                        </select>
                        <button className="botao-primario" disabled={ocupado}
                          onClick={() => agir(o, { acao: 'ativar', ...sel }, `Ativar ${sel.plano} (${sel.ciclo}) para ${o.nome}? Confirme que o pagamento caiu.`)}>
                          Ativar
                        </button>
                        <button className="botao" disabled={ocupado} onClick={() => agir(o, { acao: 'estender_teste', dias: 7 })}>+7 dias de teste</button>
                        {o.situacao === 'suspensa' ? (
                          <button className="botao" disabled={ocupado} onClick={() => agir(o, { acao: 'reativar' })}>Reativar</button>
                        ) : (
                          <button className="botao hover:text-erro" disabled={ocupado}
                            onClick={() => agir(o, { acao: 'suspender' }, `Suspender ${o.nome}? A equipe perde o acesso na hora.`)}>
                            Suspender
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
