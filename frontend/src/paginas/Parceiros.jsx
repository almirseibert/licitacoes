import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Send } from 'lucide-react';
import { api } from '../servicos/api';
import { dataHora, moedaExata } from '../servicos/formato';

/** O que a operadora lê depois de cadastrar ou ativar um parceiro (ou de repetir o aviso). */
function textoDosAvisos(a) {
  if (!a || (!a.avisados && !a.sem_envio)) return null;
  const partes = [];
  if (a.avisados) partes.push(`${a.avisados} pessoa(s) com interesse registrado foram avisadas por e-mail.`);
  if (a.sem_envio) partes.push(`${a.sem_envio} aviso(s) não saíram (confira o SMTP) e podem ser repetidos em "Vendas por serviço".`);
  return partes.join(' ');
}

/** Lado da operadora (Seção 18): parceiros, andamento dos pedidos e o que foi vendido. */
export default function Parceiros() {
  const [parceiros, setParceiros] = useState(null);
  const [servicos, setServicos] = useState({});
  const [pedidos, setPedidos] = useState([]);
  const [vendas, setVendas] = useState([]);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [novo, setNovo] = useState({ servico: 'seguro_garantia', nome: '', email_pedidos: '', site: '' });

  const carregar = useCallback(() => {
    Promise.all([api.adminParceiros(), api.adminPedidosServico(), api.adminVendasServico()])
      .then(([p, ped, v]) => {
        setParceiros(p.parceiros); setServicos(p.servicos);
        setPedidos(ped.pedidos); setVendas(v.vendas); setErro(null);
      })
      .catch((e) => { setErro(e.message); setParceiros((a) => a || []); });
  }, []);
  useEffect(carregar, [carregar]);

  const agir = async (fn) => {
    setErro(null);
    setAviso(null);
    try {
      const r = await fn();
      setAviso(textoDosAvisos(r && r.avisos));
      carregar();
    } catch (e) { setErro(e.message); }
  };

  const mudar = (p, status) => {
    const corpo = { status };
    if (status === 'contratado') {
      const valor = window.prompt('Valor contratado pelo cliente com o parceiro (R$):');
      if (valor === null) return;
      corpo.valor_contratado = valor.replace(/\./g, '').replace(',', '.');
    }
    agir(() => api.adminAtualizarPedidoServico(p.id, corpo));
  };

  if (!parceiros) return <div className="p-6 text-sm text-texto-suave"><Loader2 size={14} className="animate-spin" /></div>;

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <header className="mb-5"><h1 className="font-titulo text-xl">Parceiros e pedidos</h1></header>
      {erro && <p className="text-xs text-erro mb-3" role="alert">{erro}</p>}
      {aviso && <p className="text-xs text-texto-suave mb-3" role="status">{aviso}</p>}

      <h2 className="text-xs uppercase tracking-wide text-texto-suave mb-2">Vendas por serviço</h2>
      <div className="overflow-x-auto max-w-4xl mb-6">
        <table className="w-full text-xs border border-borda rounded">
          <thead className="text-left text-texto-suave"><tr><th className="p-2">Serviço</th><th className="p-2">Interesses</th><th className="p-2">Pedidos</th><th className="p-2">Contratados</th><th className="p-2">Clientes</th><th className="p-2">Valor fechado</th><th className="p-2"></th></tr></thead>
          <tbody>
            {vendas.map((v) => (
              <tr key={v.servico} className="border-t border-borda">
                <td className="p-2">{v.rotulo}</td><td className="p-2">{v.interesses}</td><td className="p-2">{v.pedidos}</td>
                <td className="p-2">{v.contratados}</td><td className="p-2">{v.organizacoes_contratantes}</td><td className="p-2">{moedaExata(v.valor_contratado)}</td>
                <td className="p-2">
                  {v.interesses > 0 && parceiros.some((p) => p.ativo && p.servico === v.servico) && (
                    <button className="underline text-texto-suave hover:text-texto" onClick={() => agir(() => api.adminAvisarInteresses(v.servico))}>avisar interessados</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="text-xs uppercase tracking-wide text-texto-suave mb-2">Parceiros</h2>
      <form className="flex flex-wrap gap-2 items-end mb-3 max-w-4xl"
        onSubmit={(e) => { e.preventDefault(); agir(() => api.adminNovoParceiro(novo).then((r) => { setNovo({ ...novo, nome: '', email_pedidos: '', site: '' }); return r; })); }}>
        <select className="campo-caixa" aria-label="Serviço" value={novo.servico} onChange={(e) => setNovo({ ...novo, servico: e.target.value })}>
          {Object.entries(servicos).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
        </select>
        <input className="campo-caixa flex-1 min-w-[140px]" required placeholder="Nome do parceiro" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
        <input className="campo-caixa flex-1 min-w-[180px]" required type="email" placeholder="E-mail que recebe os pedidos" value={novo.email_pedidos} onChange={(e) => setNovo({ ...novo, email_pedidos: e.target.value })} />
        <input className="campo-caixa flex-1 min-w-[140px]" placeholder="Site (https://…)" value={novo.site} onChange={(e) => setNovo({ ...novo, site: e.target.value })} />
        <button className="botao-primario flex items-center gap-1" type="submit"><Plus size={12} /> Cadastrar</button>
      </form>
      <ul className="max-w-4xl border border-borda rounded divide-y divide-borda mb-6">
        {parceiros.length === 0 && <li className="p-3 text-xs text-texto-suave">Nenhum parceiro cadastrado: todos os serviços ficam em "sem parceiro habilitado".</li>}
        {parceiros.map((p) => (
          <li key={p.id} className={`p-2 text-xs flex flex-wrap items-center gap-3 ${p.ativo ? '' : 'opacity-50'}`}>
            <span className="flex-1 min-w-0 truncate">{servicos[p.servico]} · {p.nome} · {p.email_pedidos}</span>
            <button className="underline text-texto-suave hover:text-texto" onClick={() => agir(() => api.adminAlterarParceiro(p.id, { ativo: !p.ativo }))}>
              {p.ativo ? 'desativar' : 'ativar'}
            </button>
          </li>
        ))}
      </ul>

      <h2 className="text-xs uppercase tracking-wide text-texto-suave mb-2">Pedidos</h2>
      <div className="overflow-x-auto max-w-5xl">
        <table className="w-full text-xs border border-borda rounded">
          <thead className="text-left text-texto-suave"><tr><th className="p-2">Protocolo</th><th className="p-2">Organização</th><th className="p-2">Serviço</th><th className="p-2">Situação</th><th className="p-2">Parceiro</th><th className="p-2">Em</th><th className="p-2">Ação</th></tr></thead>
          <tbody>
            {pedidos.map((p) => (
              <tr key={p.id} className="border-t border-borda">
                <td className="p-2 font-mono">{p.protocolo}</td><td className="p-2">{p.organizacao}</td><td className="p-2">{p.servico_rotulo}</td>
                <td className="p-2">{p.status_rotulo}{p.valor_contratado != null && ` · ${moedaExata(p.valor_contratado)}`}</td>
                <td className="p-2">{p.parceiro_nome || '—'}</td><td className="p-2">{dataHora(p.criado_em)}</td>
                <td className="p-2 flex flex-wrap gap-2">
                  {p.status === 'solicitado' && (
                    <button className="underline flex items-center gap-0.5" onClick={() => agir(() => api.adminReenviarPedidoServico(p.id))}><Send size={10} /> reenviar</button>
                  )}
                  {p.proximos.map((s) => (
                    <button key={s.chave} className="underline text-texto-suave hover:text-texto" onClick={() => mudar(p, s.chave)}>{s.rotulo}</button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
