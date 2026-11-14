import { useCallback, useEffect, useState } from 'react';
import { Loader2, ShieldCheck, X, ExternalLink } from 'lucide-react';
import { api } from '../servicos/api';
import { dataHora, moedaExata } from '../servicos/formato';

const COR_STATUS = {
  interesse: 'text-texto-suave',
  solicitado: 'text-atencao',
  encaminhado: 'text-ok',
  em_atendimento: 'text-ok',
  contratado: 'text-ok',
  recusado: 'text-texto-suave',
  cancelado: 'text-texto-suave',
};

/**
 * Serviços complementares por parceria (Seção 18). O painel só encaminha o pedido:
 * antes de mandar qualquer dado a um parceiro, mostra exatamente o que vai e pede o
 * aceite do termo de vínculo. Sem parceiro habilitado, só registra o interesse.
 */
export default function Servicos({ inicial = null }) {
  const [catalogo, setCatalogo] = useState(null);
  const [pedidos, setPedidos] = useState([]);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [pedindo, setPedindo] = useState(inicial); // { servico, licitacao_id? }

  const carregar = useCallback(() => {
    Promise.all([api.servicosCatalogo(), api.servicosPedidos()])
      .then(([c, p]) => { setCatalogo(c.servicos); setPedidos(p.pedidos); setErro(null); })
      .catch((e) => { setErro(e.message); setCatalogo((atual) => atual || []); });
  }, []);
  useEffect(carregar, [carregar]);

  const cancelar = async (p) => {
    if (!window.confirm(`Cancelar o pedido ${p.protocolo}?`)) return;
    try { await api.cancelarPedidoServico(p.id); carregar(); } catch (e) { setErro(e.message); }
  };

  if (!catalogo) {
    return <div className="p-6 text-sm text-texto-suave"><span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> carregando…</span></div>;
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <header className="mb-5 max-w-3xl">
        <h1 className="font-titulo text-xl">Serviços</h1>
        <p className="text-xs text-texto-suave">
          Serviços oferecidos por parceiros. O painel só encaminha o seu pedido — preço, contrato e atendimento são do parceiro.
        </p>
      </header>
      {erro && <p className="text-xs text-erro mb-3" role="alert">{erro}</p>}
      {aviso && <p className="text-xs text-ok mb-3" role="status">{aviso}</p>}

      <ul className="grid gap-3 md:grid-cols-2 max-w-4xl mb-8">
        {catalogo.map((s) => (
          <li key={s.chave} className="border border-borda rounded bg-superficie p-3 flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <ShieldCheck size={14} className="mt-0.5 text-texto-suave shrink-0" aria-hidden="true" />
              <h2 className="text-sm font-medium flex-1">{s.rotulo}</h2>
              <span className={`text-[11px] ${s.disponivel ? 'text-ok' : 'text-texto-suave'}`}>
                {s.disponivel ? 'Parceiro habilitado' : 'Sem parceiro habilitado'}
              </span>
            </div>
            <p className="text-xs text-texto-suave flex-1">{s.descricao}</p>
            {s.parceiro && (
              <p className="text-xs">
                Parceiro: {s.parceiro.nome}
                {s.parceiro.site && (
                  <a className="ml-1 inline-flex items-center gap-0.5 underline text-texto-suave" href={s.parceiro.site} target="_blank" rel="noreferrer noopener">
                    site <ExternalLink size={10} />
                  </a>
                )}
              </p>
            )}
            <div className="flex items-center gap-3">
              <button className="botao-primario" onClick={() => { setAviso(null); setPedindo({ servico: s.chave }); }}>
                {s.disponivel ? 'Pedir contato' : 'Tenho interesse'}
              </button>
              {s.pedidos_abertos > 0 && <span className="text-[11px] text-texto-suave">{s.pedidos_abertos} em aberto</span>}
            </div>
          </li>
        ))}
      </ul>

      <h2 className="text-xs uppercase tracking-wide text-texto-suave mb-2">Seus pedidos</h2>
      {pedidos.length === 0 ? (
        <p className="text-xs text-texto-suave">Nenhum pedido ainda.</p>
      ) : (
        <div className="overflow-x-auto max-w-4xl">
          <table className="w-full text-xs border border-borda rounded">
            <thead className="text-left text-texto-suave">
              <tr><th className="p-2">Protocolo</th><th className="p-2">Serviço</th><th className="p-2">Situação</th><th className="p-2">Parceiro</th><th className="p-2">Pedido em</th><th className="p-2" /></tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr key={p.id} className="border-t border-borda">
                  <td className="p-2 font-mono">{p.protocolo}</td>
                  <td className="p-2">{p.servico_rotulo}</td>
                  <td className={`p-2 ${COR_STATUS[p.status]}`}>
                    {p.status_rotulo}
                    {p.status === 'contratado' && p.valor_contratado != null && <span className="text-texto-suave"> · {moedaExata(p.valor_contratado)}</span>}
                  </td>
                  <td className="p-2">{p.parceiro_nome || '—'}</td>
                  <td className="p-2">{dataHora(p.criado_em)}</td>
                  <td className="p-2 text-right">
                    {p.cancelavel && (
                      <button className="text-texto-suave hover:text-erro underline" onClick={() => cancelar(p)}>cancelar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pedindo && (
        <Pedido
          servico={catalogo.find((s) => s.chave === pedindo.servico)}
          licitacaoInicial={pedindo.licitacao_id || ''}
          aoFechar={() => setPedindo(null)}
          aoEnviar={(r) => { setPedindo(null); setAviso(`${r.protocolo}: ${r.mensagem}`); carregar(); }}
        />
      )}
    </div>
  );
}

/** Janela do pedido: prévia do que vai ao parceiro, termo e aceite. */
function Pedido({ servico, licitacaoInicial, aoFechar, aoEnviar }) {
  const [licitacoes, setLicitacoes] = useState([]);
  const [licitacaoId, setLicitacaoId] = useState(licitacaoInicial ? String(licitacaoInicial) : '');
  const [previa, setPrevia] = useState(null);
  const [mensagem, setMensagem] = useState('');
  const [aceito, setAceito] = useState(false);
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (servico.usa_licitacao) api.servicosLicitacoes().then((r) => setLicitacoes(r.licitacoes)).catch(() => {});
  }, [servico.usa_licitacao]);
  useEffect(() => {
    setPrevia(null);
    api.servicosPrevia(servico.chave, licitacaoId).then(setPrevia).catch((e) => setErro(e.message));
  }, [servico.chave, licitacaoId]);

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      aoEnviar(await api.pedirServico({
        servico: servico.chave,
        licitacao_id: licitacaoId || undefined,
        mensagem: mensagem || undefined,
        parceiro_id: (previa && previa.parceiro_id) || undefined,
        aceite_termo: previa && previa.disponivel && aceito ? previa.termo_versao : undefined,
      }));
    } catch (err) {
      setErro(err.message);
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-obsidiana/80 flex items-start justify-center overflow-y-auto p-4" role="dialog" aria-modal="true" aria-label={servico.rotulo}>
      <form onSubmit={enviar} className="bg-superficie border border-borda rounded w-full max-w-xl p-4 mt-8">
        <div className="flex items-center mb-3">
          <h2 className="font-titulo text-lg flex-1">{servico.rotulo}</h2>
          <button type="button" onClick={aoFechar} className="text-texto-suave hover:text-texto" aria-label="Fechar"><X size={16} /></button>
        </div>

        {servico.usa_licitacao && (
          <label className="block mb-3">
            <span className="block text-[11px] uppercase tracking-wide text-texto-suave mb-0.5">Licitação (editais que exigem garantia)</span>
            <select className="campo-caixa w-full" value={licitacaoId} onChange={(e) => setLicitacaoId(e.target.value)}>
              <option value="">Sem licitação específica</option>
              {licitacaoId && !licitacoes.some((l) => String(l.id) === String(licitacaoId)) && (
                <option value={licitacaoId}>Licitação escolhida no Radar (nº interno {licitacaoId})</option>
              )}
              {licitacoes.map((l) => (
                <option key={l.id} value={l.id}>
                  {(l.orgao_nome || 'Órgão não informado')} — {l.numero_compra || 's/ número'}
                </option>
              ))}
            </select>
            {licitacoes.length === 0 && <span className="text-[11px] text-texto-suave">Nenhum edital lido, ainda aberto, exige garantia. Você pode pedir a cotação sem licitação.</span>}
          </label>
        )}

        <label className="block mb-3">
          <span className="block text-[11px] uppercase tracking-wide text-texto-suave mb-0.5">Mensagem ao parceiro (opcional)</span>
          <textarea className="campo-caixa w-full" rows={3} maxLength={1000} value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
        </label>

        {!previa ? (
          <p className="text-xs text-texto-suave flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> montando a prévia…</p>
        ) : previa.disponivel ? (
          <>
            <p className="text-xs mb-1">Estes dados serão enviados a <strong>{previa.parceiro.nome}</strong>:</p>
            <dl className="text-xs border border-borda rounded p-2 mb-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              {[...previa.linhas, ...(mensagem.trim() ? [['Mensagem do cliente', mensagem.trim()]] : [])].map(([k, v]) => (
                <div key={k} className="contents"><dt className="text-texto-suave">{k}</dt><dd className="break-words">{v}</dd></div>
              ))}
            </dl>
            <label className="flex items-start gap-2 text-xs mb-3">
              <input type="checkbox" className="mt-0.5" checked={aceito} onChange={(e) => setAceito(e.target.checked)} />
              <span>{previa.termo}</span>
            </label>
            {!previa.termo_revisado_por_advogado && (
              <p className="text-[11px] text-atencao mb-3">Este termo de vínculo ainda não foi revisado por advogado.</p>
            )}
          </>
        ) : (
          <p className="text-xs text-texto-suave mb-3 border border-borda rounded p-2">
            Ainda não há parceiro habilitado para este serviço. Se você registrar interesse, <strong>nenhum dado seu sai do painel</strong>:
            só fica anotado que há demanda.
          </p>
        )}

        {erro && <p className="text-xs text-erro mb-2" role="alert">{erro}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="botao" onClick={aoFechar}>Fechar</button>
          <button type="submit" className="botao-primario" disabled={enviando || !previa || (previa.disponivel && !aceito)}>
            {enviando ? 'Enviando…' : previa && previa.disponivel ? 'Enviar pedido' : 'Registrar interesse'}
          </button>
        </div>
      </form>
    </div>
  );
}
