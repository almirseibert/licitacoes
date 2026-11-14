import { useCallback, useEffect, useState } from 'react';
import { Loader2, PlayCircle } from 'lucide-react';
import { api } from '../servicos/api';
import { dataHora } from '../servicos/formato';

const COR_STATUS = { aberta: 'text-atencao', em_andamento: 'text-voltagem', respondida: 'text-ok', encerrada: 'text-texto-suave' };

/**
 * Central de ajuda (Seção 17): guias por ferramenta, as "Solicitações" ao suporte
 * (protocolo, assunto, data, status) e, para a administração do serviço, o
 * atendimento de todas as organizações e o NPS.
 */
export default function Ajuda({ superadmin, aoIr, abaInicial = 'guias' }) {
  const [aba, setAba] = useState(abaInicial);
  const abas = [['guias', 'Guias'], ['solicitacoes', 'Solicitações'], ...(superadmin ? [['atendimento', 'Atendimento']] : [])];
  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <header className="mb-4">
        <h1 className="font-titulo text-xl">Ajuda</h1>
        <p className="text-xs text-texto-suave">Guias curtos por ferramenta e o canal com o suporte.</p>
      </header>
      <div className="flex gap-1 mb-5 border-b border-borda" role="tablist">
        {abas.map(([chave, rotulo]) => (
          <button
            key={chave}
            role="tab"
            aria-selected={aba === chave}
            onClick={() => setAba(chave)}
            className={`px-3 py-2 text-xs border-b-2 -mb-px ${aba === chave ? 'border-texto text-texto' : 'border-transparent text-texto-suave hover:text-texto'}`}
          >
            {rotulo}
          </button>
        ))}
      </div>
      {aba === 'guias' && <Guias aoIr={aoIr} aoPedirSuporte={() => setAba('solicitacoes')} />}
      {aba === 'solicitacoes' && <Solicitacoes />}
      {aba === 'atendimento' && <Atendimento />}
    </div>
  );
}

// ------------------------------------------------------------------- guias
function Guias({ aoIr, aoPedirSuporte }) {
  const [busca, setBusca] = useState('');
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [aberto, setAberto] = useState(null);

  useEffect(() => {
    const espera = setTimeout(() => {
      api.ajuda(busca).then((r) => { setDados(r); setErro(null); }).catch((e) => setErro(e.message));
    }, 200);
    return () => clearTimeout(espera);
  }, [busca]);

  return (
    <div className="max-w-3xl">
      <input
        className="campo-caixa w-full mb-4"
        placeholder="Buscar nos guias (ex.: boletim, documento, token)"
        aria-label="Buscar nos guias"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />
      {erro && <p className="text-xs text-erro mb-3" role="alert">{erro}</p>}
      {!dados && !erro && <p className="text-sm text-texto-suave flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> carregando…</p>}
      {dados && dados.guias.length === 0 && (
        <p className="text-sm text-texto-suave">
          Nenhum guia para “{busca}”.{' '}
          <button className="underline" onClick={aoPedirSuporte}>Pergunte ao suporte</button>.
        </p>
      )}
      <ul className="space-y-2">
        {dados && dados.guias.map((g) => (
          <li key={g.id} className="border border-borda rounded">
            <button
              className="w-full text-left p-3 flex items-start gap-3"
              aria-expanded={aberto === g.id}
              onClick={() => setAberto(aberto === g.id ? null : g.id)}
            >
              <span className="flex-1">
                <span className="block text-[10px] uppercase tracking-widest text-texto-suave">{g.ferramenta}</span>
                <span className="block text-sm">{g.titulo}</span>
                <span className="block text-xs text-texto-suave mt-0.5">{g.resumo}</span>
              </span>
            </button>
            {aberto === g.id && (
              <div className="px-3 pb-3 text-sm">
                <p className="flex items-center gap-2 text-xs text-texto-suave mb-3 border border-dashed border-borda rounded px-2 py-1.5">
                  <PlayCircle size={14} />
                  {g.video ? <a className="underline" href={g.video} target="_blank" rel="noreferrer">Assistir ao vídeo (curto)</a> : 'Vídeo em produção.'}
                </p>
                <ol className="list-decimal pl-5 space-y-1.5 mb-3">
                  {g.passos.map((p) => <li key={p}>{p}</li>)}
                </ol>
                {g.dica && <p className="text-xs text-texto-suave mb-3">Dica: {g.dica}</p>}
                {g.tela && <button className="botao" onClick={() => aoIr(g.tela)}>Abrir a ferramenta</button>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------ solicitações
function Solicitacoes() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [aberta, setAberta] = useState(null); // id
  const [nova, setNova] = useState(false);

  const carregar = useCallback(() => {
    api.solicitacoes().then(setDados).catch((e) => setErro(e.message));
  }, []);
  useEffect(carregar, [carregar]);

  if (aberta) return <Conversa id={aberta} voltar={() => { setAberta(null); carregar(); }} buscar={api.solicitacao} enviar={(id, t) => api.escreverSolicitacao(id, t)} podeEncerrar />;
  if (nova) return <NovaSolicitacao categorias={dados ? dados.categorias : {}} voltar={(id) => { setNova(false); if (id) setAberta(id); else carregar(); }} />;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center mb-3">
        <p className="text-xs text-texto-suave">As respostas aparecem aqui e chegam por e-mail.</p>
        <button className="botao-primario ml-auto" onClick={() => setNova(true)}>Nova solicitação</button>
      </div>
      {erro && <p className="text-xs text-erro mb-3" role="alert">{erro}</p>}
      {!dados && !erro && <p className="text-sm text-texto-suave flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> carregando…</p>}
      {dados && dados.solicitacoes.length === 0 && <p className="text-sm text-texto-suave">Nenhuma solicitação ainda.</p>}
      {dados && dados.solicitacoes.length > 0 && (
        <table className="tabela-densa w-full text-left">
          <thead><tr><th>Protocolo</th><th>Assunto</th><th>Aberta em</th><th>Status</th></tr></thead>
          <tbody>
            {dados.solicitacoes.map((s) => (
              <tr key={s.id} className="cursor-pointer" onClick={() => setAberta(s.id)}>
                <td className="font-mono text-[11px]">{s.protocolo}</td>
                <td><button className="underline-offset-2 hover:underline text-left" onClick={() => setAberta(s.id)}>{s.assunto}</button></td>
                <td>{dataHora(s.criada_em)}</td>
                <td className={COR_STATUS[s.status]}>{s.status_rotulo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function NovaSolicitacao({ categorias, voltar }) {
  const [campos, setCampos] = useState({ assunto: '', categoria: 'duvida', texto: '' });
  const [erro, setErro] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const mudar = (c) => (e) => setCampos({ ...campos, [c]: e.target.value });

  const enviar = async (e) => {
    e.preventDefault();
    setOcupado(true);
    setErro(null);
    try {
      const r = await api.abrirSolicitacao(campos);
      voltar(r.id);
    } catch (x) {
      setErro(x.message);
      setOcupado(false);
    }
  };
  return (
    <form onSubmit={enviar} className="max-w-xl">
      <h2 className="font-titulo text-base mb-3">Nova solicitação</h2>
      <label className="block mb-3">
        <span className="block text-[11px] uppercase tracking-wide text-texto-suave mb-1">Categoria</span>
        <select className="campo-caixa w-full" value={campos.categoria} onChange={mudar('categoria')}>
          {Object.entries(categorias).map(([k, r]) => <option key={k} value={k}>{r}</option>)}
        </select>
      </label>
      <label className="block mb-3">
        <span className="block text-[11px] uppercase tracking-wide text-texto-suave mb-1">Assunto</span>
        <input className="campo-caixa w-full" value={campos.assunto} onChange={mudar('assunto')} maxLength={160} required />
      </label>
      <label className="block mb-3">
        <span className="block text-[11px] uppercase tracking-wide text-texto-suave mb-1">O que aconteceu</span>
        <textarea className="campo-caixa w-full h-32" value={campos.texto} onChange={mudar('texto')} required />
        <span className="block text-[11px] text-texto-suave mt-1">Diga em qual tela estava e o que esperava ver.</span>
      </label>
      {erro && <p className="text-xs text-erro mb-3" role="alert">{erro}</p>}
      <div className="flex gap-2">
        <button type="button" className="botao" onClick={() => voltar(null)} disabled={ocupado}>Cancelar</button>
        <button type="submit" className="botao-primario flex items-center gap-2" disabled={ocupado}>
          {ocupado && <Loader2 size={12} className="animate-spin" />} Enviar
        </button>
      </div>
    </form>
  );
}

/** A conversa de uma solicitação — a mesma tela para o cliente e para o suporte. */
function Conversa({ id, voltar, buscar, enviar, podeEncerrar = false, comStatus = false }) {
  const [s, setS] = useState(null);
  const [texto, setTexto] = useState('');
  const [status, setStatus] = useState('');
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(() => {
    buscar(id).then(setS).catch((e) => setErro(e.message));
  }, [id, buscar]);
  useEffect(carregar, [carregar]);

  const mandar = async (e) => {
    e.preventDefault();
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      const r = await enviar(id, texto, status || undefined);
      if (r && r.email === 'nao_enviado') setAviso('Resposta salva. O e-mail ao cliente não saiu (servidor sem SMTP); ela aparece na solicitação dele.');
      setTexto('');
      setStatus('');
      carregar();
    } catch (x) {
      setErro(x.message);
    } finally {
      setOcupado(false);
    }
  };
  const encerrar = async () => {
    try { await api.encerrarSolicitacao(id); carregar(); } catch (x) { setErro(x.message); }
  };

  if (!s) return <p className="text-sm text-texto-suave">{erro || 'carregando…'}</p>;
  return (
    <div className="max-w-2xl">
      <button className="text-xs text-texto-suave hover:text-texto mb-3" onClick={voltar}>← todas as solicitações</button>
      <p className="font-mono text-[11px] text-texto-suave">{s.protocolo}{s.organizacao ? ` · ${s.organizacao}` : ''}</p>
      <h2 className="font-titulo text-base">{s.assunto}</h2>
      <p className="text-xs text-texto-suave mb-4">
        {s.categoria_rotulo} · aberta em {dataHora(s.criada_em)}{s.aberta_por ? ` por ${s.aberta_por}` : ''} ·{' '}
        <span className={COR_STATUS[s.status]}>{s.status_rotulo}</span>
      </p>
      <ul className="space-y-2 mb-4">
        {s.mensagens.map((m) => (
          <li key={m.id} className={`rounded border border-borda p-3 text-sm ${m.autor === 'suporte' ? 'bg-voltagem/[0.05]' : ''}`}>
            <p className="text-[11px] text-texto-suave mb-1">{m.autor === 'suporte' ? 'Suporte' : (m.nome || 'Cliente')} · {dataHora(m.criada_em)}</p>
            <p className="whitespace-pre-wrap">{m.texto}</p>
          </li>
        ))}
      </ul>
      {s.status !== 'encerrada' || comStatus ? (
        <form onSubmit={mandar}>
          <textarea className="campo-caixa w-full h-24 mb-2" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Mensagem" placeholder="Escreva a mensagem" required />
          {erro && <p className="text-xs text-erro mb-2" role="alert">{erro}</p>}
          {aviso && <p className="text-xs text-atencao mb-2" role="status">{aviso}</p>}
          <div className="flex flex-wrap gap-2 items-center">
            <button type="submit" className="botao-primario flex items-center gap-2" disabled={ocupado}>
              {ocupado && <Loader2 size={12} className="animate-spin" />} Enviar
            </button>
            {comStatus && (
              <select className="campo-caixa" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status depois de responder">
                <option value="">Status: respondida</option>
                <option value="em_andamento">Status: em andamento</option>
                <option value="encerrada">Status: encerrada</option>
              </select>
            )}
            {podeEncerrar && s.status !== 'encerrada' && <button type="button" className="botao ml-auto" onClick={encerrar}>Dar por resolvida</button>}
          </div>
        </form>
      ) : (
        <p className="text-xs text-texto-suave">Solicitação encerrada. Abra outra se precisar.</p>
      )}
    </div>
  );
}

// ------------------------------------------------------------- atendimento
function Atendimento() {
  const [filtro, setFiltro] = useState('');
  const [dados, setDados] = useState(null);
  const [nps, setNps] = useState(null);
  const [erro, setErro] = useState(null);
  const [aberta, setAberta] = useState(null);

  const carregar = useCallback(() => {
    api.adminSolicitacoes(filtro).then(setDados).catch((e) => setErro(e.message));
    api.adminNps().then(setNps).catch(() => {});
  }, [filtro]);
  useEffect(carregar, [carregar]);

  if (aberta) {
    return <Conversa id={aberta} voltar={() => { setAberta(null); carregar(); }} buscar={api.adminSolicitacao} enviar={api.adminResponder} comStatus />;
  }
  return (
    <div className="max-w-4xl">
      {nps && (
        <p className="text-xs text-texto-suave mb-4" aria-label="Resumo do NPS">
          NPS: <strong className="text-texto">{nps.nps === null ? 'sem respostas' : nps.nps}</strong>
          {nps.total ? ` · ${nps.total} resposta(s): ${nps.promotores} promotor(es), ${nps.neutros} neutro(s), ${nps.detratores} detrator(es)` : ''}
        </p>
      )}
      <select className="campo-caixa mb-3" value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar por status">
        <option value="">Todas</option>
        <option value="aberta">Abertas</option>
        <option value="em_andamento">Em andamento</option>
        <option value="respondida">Respondidas</option>
        <option value="encerrada">Encerradas</option>
      </select>
      {erro && <p className="text-xs text-erro mb-3" role="alert">{erro}</p>}
      {dados && dados.solicitacoes.length === 0 && <p className="text-sm text-texto-suave">Nenhuma solicitação.</p>}
      {dados && dados.solicitacoes.length > 0 && (
        <table className="tabela-densa w-full text-left">
          <thead><tr><th>Protocolo</th><th>Organização</th><th>Assunto</th><th>Categoria</th><th>Atualizada</th><th>Status</th></tr></thead>
          <tbody>
            {dados.solicitacoes.map((s) => (
              <tr key={s.id} className="cursor-pointer" onClick={() => setAberta(s.id)}>
                <td className="font-mono text-[11px]">{s.protocolo}</td>
                <td>{s.organizacao}</td>
                <td><button className="hover:underline text-left" onClick={() => setAberta(s.id)}>{s.assunto}</button></td>
                <td>{s.categoria_rotulo}</td>
                <td>{dataHora(s.atualizada_em)}</td>
                <td className={COR_STATUS[s.status]}>{s.status_rotulo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
