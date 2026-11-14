import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Copy, KeyRound, Webhook, Send, RefreshCw, Power } from 'lucide-react';
import { api } from '../servicos/api';
import { dataHora } from '../servicos/formato';

// Um IP por linha (ou separados por vírgula); vazio = qualquer IP.
const lerIps = (texto) => texto.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean);

function Segredo({ rotulo, valor, aviso, aoFechar }) {
  return (
    <div className="mb-4 p-3 rounded border border-atencao/50 bg-superficie text-xs" role="status">
      <p className="text-atencao mb-1">{aviso}</p>
      <div className="flex items-center gap-2">
        <span className="text-texto-suave">{rotulo}</span>
        <code className="truncate flex-1 select-all">{valor}</code>
        <button
          className="text-texto-suave hover:text-texto"
          title="Copiar"
          aria-label={`Copiar ${rotulo}`}
          onClick={() => navigator.clipboard && navigator.clipboard.writeText(valor)}
        >
          <Copy size={13} />
        </button>
        <button className="text-texto-suave hover:text-texto underline" onClick={aoFechar}>já guardei</button>
      </div>
    </div>
  );
}

/**
 * Integrações (Seção 14): tokens da API e webhooks de novas oportunidades. O
 * token e o segredo só aparecem uma vez, aqui, na hora de criar. A tela é de
 * administrador e dono; quem não é recebe a recusa do backend.
 */
export default function Integracoes() {
  const [tokens, setTokens] = useState(null);
  const [hooks, setHooks] = useState([]);
  const [filtros, setFiltros] = useState([]);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [segredo, setSegredo] = useState(null);
  const [novoToken, setNovoToken] = useState({ nome: '', ips: '' });
  const [novoHook, setNovoHook] = useState({ nome: '', url: '', perfil_id: '' });

  const carregar = useCallback(() => {
    Promise.all([api.tokensApi(), api.webhooks(), api.filtrosDeWebhook()])
      .then(([t, w, f]) => {
        setTokens(t.dados);
        setHooks(w.dados);
        setFiltros(f.dados);
      })
      .catch((e) => {
        setErro(e.message);
        setTokens((atual) => atual || []);
      });
  }, []);
  useEffect(carregar, [carregar]);

  const agir = async (acao) => {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      const r = await acao();
      carregar();
      return r;
    } catch (e) {
      setErro(e.message);
      return null;
    } finally {
      setOcupado(false);
    }
  };

  const criarToken = async (evento) => {
    evento.preventDefault();
    const r = await agir(() => api.criarTokenApi(novoToken.nome, lerIps(novoToken.ips)));
    if (r) {
      setSegredo({ rotulo: 'Token', valor: r.token, aviso: r.aviso });
      setNovoToken({ nome: '', ips: '' });
    }
  };

  const criarHook = async (evento) => {
    evento.preventDefault();
    const r = await agir(() => api.criarWebhook({ ...novoHook, perfil_id: Number(novoHook.perfil_id) }));
    if (r) {
      setSegredo({ rotulo: 'Segredo', valor: r.segredo, aviso: r.aviso });
      setNovoHook({ nome: '', url: '', perfil_id: '' });
    }
  };

  const testar = async (hook) => {
    const r = await agir(() => api.testarWebhook(hook.id));
    if (r) setAviso(r.ok ? `Teste entregue em "${hook.nome}".` : `O teste não chegou: ${r.detalhe}`);
  };

  const girar = async (hook) => {
    if (!window.confirm(`Girar o segredo de "${hook.nome}"? O atual deixa de valer na hora.`)) return;
    const r = await agir(() => api.girarSegredoWebhook(hook.id));
    if (r) setSegredo({ rotulo: 'Segredo novo', valor: r.segredo, aviso: r.aviso });
  };

  if (!tokens) {
    return (
      <div className="p-6 text-sm text-texto-suave">
        <span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> carregando…</span>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <header className="mb-5">
        <h1 className="font-titulo text-xl">Integrações</h1>
        <p className="text-xs text-texto-suave">
          Leia os dados da sua organização por API e receba as oportunidades novas no seu sistema.
          O passo a passo está em <code>docs/API.md</code>.
        </p>
      </header>

      {erro && <p className="text-xs text-erro mb-3" role="alert">{erro}</p>}
      {aviso && <p className="text-xs text-ok mb-3" role="status">{aviso}</p>}
      {segredo && <Segredo {...segredo} aoFechar={() => setSegredo(null)} />}

      <section className="border border-borda rounded bg-superficie mb-6">
        <h2 className="px-3 py-2 text-xs uppercase tracking-wide text-texto-suave border-b border-borda flex items-center gap-2">
          <KeyRound size={12} /> Tokens de API
        </h2>
        <form onSubmit={criarToken} className="p-3 flex flex-wrap gap-2 items-end border-b border-borda">
          <label className="min-w-[180px] flex-1">
            <span className="block text-[11px] uppercase tracking-wide text-texto-suave mb-0.5">Nome</span>
            <input className="campo-caixa w-full" required maxLength={80} placeholder="ERP, planilha…"
              value={novoToken.nome} onChange={(e) => setNovoToken({ ...novoToken, nome: e.target.value })} />
          </label>
          <label className="min-w-[220px] flex-1">
            <span className="block text-[11px] uppercase tracking-wide text-texto-suave mb-0.5">IPs liberados (vazio = qualquer)</span>
            <input className="campo-caixa w-full" placeholder="203.0.113.7, 198.51.100.0/24"
              value={novoToken.ips} onChange={(e) => setNovoToken({ ...novoToken, ips: e.target.value })} />
          </label>
          <button type="submit" className="botao-primario flex items-center gap-1" disabled={ocupado}>
            {ocupado ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Criar token
          </button>
        </form>
        {tokens.length === 0 ? (
          <p className="p-3 text-xs text-texto-suave">Nenhum token ainda.</p>
        ) : (
          <ul>
            {tokens.map((t) => (
              <li key={t.id} className={`px-3 py-2 border-b border-borda last:border-b-0 flex flex-wrap items-center gap-3 text-sm ${t.revogado_em ? 'opacity-50' : ''}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate">{t.nome} <code className="text-xs text-texto-suave">lic_{t.prefixo}…</code></p>
                  <p className="text-xs text-texto-suave">
                    {t.revogado_em
                      ? `revogado em ${dataHora(t.revogado_em)}`
                      : t.ultimo_uso ? `último uso ${dataHora(t.ultimo_uso)}${t.ultimo_ip ? ` de ${t.ultimo_ip}` : ''}` : 'nunca usado'}
                    {' · '}
                    {t.ips_liberados.length ? `só ${t.ips_liberados.join(', ')}` : 'qualquer IP'}
                  </p>
                </div>
                {!t.revogado_em && (
                  <>
                    <button className="text-xs text-texto-suave hover:text-texto underline" disabled={ocupado}
                      onClick={() => {
                        const atual = t.ips_liberados.join(', ');
                        const resposta = window.prompt('IPs liberados (separe por vírgula; vazio = qualquer IP):', atual);
                        if (resposta !== null) agir(() => api.salvarIpsTokenApi(t.id, lerIps(resposta)));
                      }}>
                      IPs
                    </button>
                    <button className="text-texto-suave hover:text-erro" title="Revogar" aria-label={`Revogar o token ${t.nome}`}
                      disabled={ocupado}
                      onClick={() => {
                        if (window.confirm(`Revogar "${t.nome}"? Quem usa este token passa a receber erro 401 na hora.`)) agir(() => api.revogarTokenApi(t.id));
                      }}>
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border border-borda rounded bg-superficie">
        <h2 className="px-3 py-2 text-xs uppercase tracking-wide text-texto-suave border-b border-borda flex items-center gap-2">
          <Webhook size={12} /> Webhooks de novas oportunidades
        </h2>
        <form onSubmit={criarHook} className="p-3 flex flex-wrap gap-2 items-end border-b border-borda">
          <label className="min-w-[140px]">
            <span className="block text-[11px] uppercase tracking-wide text-texto-suave mb-0.5">Nome</span>
            <input className="campo-caixa w-full" required maxLength={80} value={novoHook.nome}
              onChange={(e) => setNovoHook({ ...novoHook, nome: e.target.value })} />
          </label>
          <label className="min-w-[240px] flex-1">
            <span className="block text-[11px] uppercase tracking-wide text-texto-suave mb-0.5">Endereço (https)</span>
            <input className="campo-caixa w-full" type="url" required placeholder="https://seu-sistema.com.br/recebe"
              value={novoHook.url} onChange={(e) => setNovoHook({ ...novoHook, url: e.target.value })} />
          </label>
          <label className="min-w-[180px]">
            <span className="block text-[11px] uppercase tracking-wide text-texto-suave mb-0.5">Filtro salvo</span>
            <select className="campo-caixa w-full" required value={novoHook.perfil_id}
              onChange={(e) => setNovoHook({ ...novoHook, perfil_id: e.target.value })}>
              <option value="">escolha…</option>
              {filtros.map((f) => (
                <option key={f.id} value={f.id}>{f.nome} ({f.origem === 'radar' ? 'Radar' : 'boletim'})</option>
              ))}
            </select>
          </label>
          <button type="submit" className="botao-primario flex items-center gap-1" disabled={ocupado}>
            {ocupado ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Criar webhook
          </button>
        </form>
        {hooks.length === 0 ? (
          <p className="p-3 text-xs text-texto-suave">Nenhum webhook ainda. Ele entrega só o que chegar depois de criado.</p>
        ) : (
          <ul>
            {hooks.map((h) => (
              <li key={h.id} className="px-3 py-2 border-b border-borda last:border-b-0 flex flex-wrap items-center gap-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    {h.nome} <span className="text-xs text-texto-suave">← {h.filtro_nome}</span>
                    {!h.ativo && <span className="ml-2 text-xs text-atencao">pausado</span>}
                  </p>
                  <p className="text-xs text-texto-suave truncate">{h.url}</p>
                  <p className={`text-xs ${h.falhas_seguidas ? 'text-erro' : 'text-texto-suave'}`}>
                    {h.entregues} entregue(s)
                    {h.ultima_entrega_em ? ` · última ${dataHora(h.ultima_entrega_em)}` : ''}
                    {h.falhas_seguidas ? ` · ${h.falhas_seguidas} falha(s) seguida(s): ${h.ultimo_detalhe || ''}` : ''}
                  </p>
                </div>
                <button className="text-texto-suave hover:text-texto" title="Enviar um teste assinado" aria-label={`Testar ${h.nome}`}
                  disabled={ocupado} onClick={() => testar(h)}><Send size={14} /></button>
                <button className="text-texto-suave hover:text-texto" title="Girar o segredo" aria-label={`Girar o segredo de ${h.nome}`}
                  disabled={ocupado} onClick={() => girar(h)}><RefreshCw size={14} /></button>
                <button className="text-texto-suave hover:text-texto" title={h.ativo ? 'Pausar' : 'Religar'} aria-label={h.ativo ? `Pausar ${h.nome}` : `Religar ${h.nome}`}
                  disabled={ocupado} onClick={() => agir(() => api.alterarWebhook(h.id, { ativo: !h.ativo }))}><Power size={14} /></button>
                <button className="text-texto-suave hover:text-erro" title="Apagar" aria-label={`Apagar ${h.nome}`} disabled={ocupado}
                  onClick={() => { if (window.confirm(`Apagar o webhook "${h.nome}"?`)) agir(() => api.apagarWebhook(h.id)); }}>
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
