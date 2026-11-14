import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../servicos/api';
import { dataHora } from '../servicos/formato';

const ROTULO_ENTIDADE = {
  sessao: 'Acesso', conta: 'Conta', equipe: 'Equipe', documento: 'Documento', empresa: 'Empresa', tarefa: 'Tarefa',
  licitacao: 'Licitação', integracao: 'Integração', lgpd: 'Dados (LGPD)', suporte: 'Suporte',
};

/** O que cada evento guarda além de quem e quando, em português. */
function detalhe(d) {
  if (!d) return '';
  const partes = [];
  if (d.etapa) partes.push(`etapa: ${d.etapa}`);
  if (d.status) partes.push(`status: ${d.status}`);
  if (d.papel) partes.push(`papel: ${d.papel}`);
  if (d.codigo) partes.push(`tipo: ${d.codigo}`);
  if (d.prazo) partes.push(`prazo: ${d.prazo}`);
  if (d.valido_ate) partes.push(`validade: ${d.valido_ate}`);
  if (d.favorito !== undefined) partes.push(d.favorito ? 'favoritou' : 'tirou dos favoritos');
  if (d.descartada !== undefined) partes.push(d.descartada ? 'descartou' : 'reabriu');
  if (d.categoria) partes.push(d.categoria);
  if (d.palavras) partes.push(`${d.palavras} palavra(s)`);
  return partes.join(' · ');
}

/**
 * Trilha de auditoria (Seção 17): quem entrou e quem alterou documento, tarefa,
 * etapa e equipe. Só administrador e dono. A trilha diz o que aconteceu, nunca o
 * conteúdo — e fica guardada por 2 anos.
 */
export default function Auditoria({ aoAbrir }) {
  const [filtros, setFiltros] = useState({ entidade: '', usuario: '', de: '', ate: '' });
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);

  const carregar = useCallback(() => {
    api.auditoria({ ...filtros, pagina }).then((d) => { setDados(d); setErro(null); }).catch((e) => setErro(e.message));
  }, [filtros, pagina]);
  useEffect(carregar, [carregar]);

  const mudar = (c) => (e) => { setFiltros({ ...filtros, [c]: e.target.value }); setPagina(1); };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <header className="mb-4">
        <h1 className="font-titulo text-xl">Auditoria</h1>
        <p className="text-xs text-texto-suave">Quem entrou e quem alterou documento, tarefa, etapa e equipe. Guardada por 2 anos; não registra o conteúdo.</p>
      </header>

      <div className="flex flex-wrap gap-2 mb-4">
        <select className="campo-caixa" aria-label="O quê" value={filtros.entidade} onChange={mudar('entidade')}>
          <option value="">Tudo</option>
          {(dados ? dados.filtros.entidades : []).map((e) => <option key={e} value={e}>{ROTULO_ENTIDADE[e] || e}</option>)}
        </select>
        <select className="campo-caixa" aria-label="Quem" value={filtros.usuario} onChange={mudar('usuario')}>
          <option value="">Todas as pessoas</option>
          {(dados ? dados.filtros.pessoas : []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <label className="text-xs text-texto-suave flex items-center gap-1">de <input type="date" className="campo-caixa" value={filtros.de} onChange={mudar('de')} /></label>
        <label className="text-xs text-texto-suave flex items-center gap-1">até <input type="date" className="campo-caixa" value={filtros.ate} onChange={mudar('ate')} /></label>
      </div>

      {erro && <p className="text-xs text-erro mb-3" role="alert">{erro}</p>}
      {!dados && !erro && <p className="text-sm text-texto-suave flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> carregando…</p>}
      {dados && dados.eventos.length === 0 && <p className="text-sm text-texto-suave">Nenhum evento neste filtro.</p>}
      {dados && dados.eventos.length > 0 && (
        <>
          <table className="tabela-densa w-full text-left">
            <thead><tr><th>Quando</th><th>Quem</th><th>O que fez</th><th>Detalhe</th><th>IP</th></tr></thead>
            <tbody>
              {dados.eventos.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap">{dataHora(e.criado_em)}</td>
                  <td>{e.usuario}</td>
                  <td>
                    {e.rotulo}
                    {e.entidade === 'licitacao' && e.entidade_id && aoAbrir && (
                      <> <button className="underline text-texto-suave" onClick={() => aoAbrir(Number(e.entidade_id))}>abrir</button></>
                    )}
                  </td>
                  <td className="text-texto-suave">{detalhe(e.detalhe)}</td>
                  <td className="font-mono text-[11px] text-texto-suave">{e.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center gap-3 mt-3 text-xs text-texto-suave">
            <button className="botao" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>Anterior</button>
            <span>Página {dados.pagina} de {Math.max(1, Math.ceil(dados.total / dados.por_pagina))} · {dados.total} evento(s)</span>
            <button className="botao" disabled={pagina * dados.por_pagina >= dados.total} onClick={() => setPagina(pagina + 1)}>Próxima</button>
          </div>
        </>
      )}
    </div>
  );
}
