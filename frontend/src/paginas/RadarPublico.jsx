import { useEffect, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { api } from '../servicos/api';
import { dataHora, moeda, resumir } from '../servicos/formato';
import Contagem from '../componentes/Contagem';
import { Etiquetas, linkDoPortal } from '../componentes/RadarExtras';

/**
 * Lista do Radar aberta por link de leitura (Seção 7): sem login, só o fato
 * público da licitação. Some quando o link expira ou é revogado.
 */
export default function RadarPublico({ token }) {
  const [pagina, setPagina] = useState(1);
  const [r, setR] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    setR(null);
    api.radarPublico(token, pagina).then(setR).catch((e) => setErro(e.message));
  }, [token, pagina]);

  if (erro) {
    return (
      <div className="min-h-screen bg-obsidiana text-texto flex items-center justify-center p-6">
        <p className="max-w-md text-sm text-texto-suave">{erro}</p>
      </div>
    );
  }
  if (!r) {
    return (
      <div className="min-h-screen bg-obsidiana text-texto flex items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  const paginas = Math.max(1, Math.ceil(r.total / r.por_pagina));
  return (
    <div className="min-h-screen bg-obsidiana text-texto">
      <header className="px-4 py-3 border-b border-borda flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="font-titulo text-xl">{r.nome || 'Licitações compartilhadas'}</h1>
        <span className="text-xs text-texto-suave">
          {r.total} licitaç{r.total === 1 ? 'ão' : 'ões'} · somente leitura · link vale até {dataHora(r.expira_em)}
        </span>
      </header>
      <ul className="p-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {r.dados.map((l) => (
          <li key={l.id} className="border border-borda bg-superficie rounded p-3">
            <p className="text-sm leading-snug">{resumir(l.objeto, 220)}</p>
            <p className="text-xs text-texto-suave mt-1">{l.orgao_nome}</p>
            <div className="mt-2 grid grid-cols-2 gap-y-1 text-xs text-texto-suave">
              <span>{l.municipio ? `${l.municipio}/${l.uf || ''}` : l.uf || '—'}</span>
              <span className="text-right font-mono text-texto">{moeda(l.valor_estimado)}</span>
              <span>{l.modalidade || '—'}{l.numero_compra ? ` nº ${l.numero_compra}` : ''}</span>
              <span className="text-right"><Contagem fim={l.fim_propostas} /></span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Etiquetas licitacao={l} />
              {linkDoPortal(l) && (
                <a href={linkDoPortal(l)} target="_blank" rel="noreferrer noopener" className="ml-auto text-[11px] text-texto-suave hover:text-texto flex items-center gap-1">
                  abrir no portal <ExternalLink size={11} />
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
      {paginas > 1 && (
        <div className="px-4 pb-6 flex items-center gap-2 text-xs text-texto-suave">
          <button disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)} className="px-2 py-1 border border-borda rounded disabled:opacity-40">anterior</button>
          <span className="font-mono">página {pagina} de {paginas}</span>
          <button disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)} className="px-2 py-1 border border-borda rounded disabled:opacity-40">próxima</button>
        </div>
      )}
    </div>
  );
}
