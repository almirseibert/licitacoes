import { useState } from 'react';
import brasil from '@svg-maps/brazil';
import { moeda } from '../servicos/formato';

// Traçado dos 27 estados: dados públicos (CC-BY-4.0) do pacote @svg-maps/brazil
// (github.com/VictorCazanave/svg-maps). Cor é a única cor de magnitude que o
// painel usa (--cor-voltagem), em degradê de opacidade — sequencial, uma
// hue só, do menos para o mais (seção "Decisões de interface" do benchmark).
const PASSOS_OPACIDADE = [0.1, 0.22, 0.38, 0.56, 0.78, 1];

/**
 * Mapa do Brasil para "Licitações por estado" (Dashboard). Cada UF é
 * clicável e leva ao Radar já filtrado por ela; sem dado, o estado fica só
 * com o contorno. Mantém a tabela como alternativa (acessibilidade e
 * conferência exata dos números).
 */
export default function MapaBrasil({ porUf, aoClicarUf }) {
  const [foco, setFoco] = useState(null);
  const porSigla = new Map(porUf.map((l) => [l.uf.toLowerCase(), l]));
  const maximo = Math.max(1, ...porUf.map((l) => l.quantidade));

  const opacidadeDe = (quantidade) => {
    if (!quantidade) return 0;
    const passo = Math.min(PASSOS_OPACIDADE.length - 1, Math.ceil((quantidade / maximo) * PASSOS_OPACIDADE.length) - 1);
    return PASSOS_OPACIDADE[Math.max(0, passo)];
  };

  const destacado = porSigla.get(foco);

  return (
    <div className="relative">
      <svg viewBox={brasil.viewBox} role="img" aria-label="Licitações vigentes por estado" className="w-full h-auto max-h-64">
        {brasil.locations.map((estado) => {
          const linha = porSigla.get(estado.id);
          const opacidade = opacidadeDe(linha ? linha.quantidade : 0);
          return (
            <path
              key={estado.id}
              d={estado.path}
              onClick={() => aoClicarUf(estado.id.toUpperCase())}
              onMouseEnter={() => setFoco(estado.id)}
              onMouseLeave={() => setFoco((f) => (f === estado.id ? null : f))}
              onFocus={() => setFoco(estado.id)}
              onBlur={() => setFoco((f) => (f === estado.id ? null : f))}
              tabIndex={0}
              role="button"
              aria-label={`${estado.name}: ${linha ? linha.quantidade : 0} licitação(ões) vigente(s)`}
              className="cursor-pointer stroke-borda hover:stroke-texto transition-colors"
              strokeWidth={foco === estado.id ? 1.4 : 0.6}
              style={{ fill: opacidade ? `rgb(var(--cor-voltagem) / ${opacidade})` : 'rgb(var(--cor-borda) / 0.3)' }}
            />
          );
        })}
      </svg>

      <div className="flex items-center gap-2 mt-1 text-[10px] text-texto-suave">
        <span>menos</span>
        <span className="flex gap-0.5">
          {PASSOS_OPACIDADE.map((o) => (
            <span key={o} className="w-3 h-2 rounded-sm" style={{ background: `rgb(var(--cor-voltagem) / ${o})` }} />
          ))}
        </span>
        <span>mais licitações vigentes</span>
      </div>

      {destacado && (
        <p role="status" className="absolute top-0 right-0 px-2 py-1 text-[11px] rounded border border-borda bg-superficie shadow">
          <span className="font-medium">{destacado.uf}</span> · {destacado.quantidade} licitação(ões) · {moeda(destacado.valor)}
        </p>
      )}
    </div>
  );
}
