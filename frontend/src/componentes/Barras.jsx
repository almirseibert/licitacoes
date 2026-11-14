import { useState } from 'react';
import { BarChart3, Table2 } from 'lucide-react';
import { moeda } from '../servicos/formato';

/**
 * Barras horizontais de uma série só (Seção 13): o título diz o que é, então
 * não há legenda; rótulo e valor ficam em texto ao lado da barra — a cor nunca
 * carrega sozinha o número. A outra medida (quantidade ou valor) vai na dica e
 * na tabela, nunca num segundo eixo.
 *
 * linhas: [{ chave?, rotulo, quantidade, valor }]
 * medida: 'valor' | 'quantidade' — o comprimento da barra.
 */
export default function Barras({ titulo, linhas, medida = 'valor', vazio = 'Nada no período.', aoClicar, nota }) {
  const [tabela, setTabela] = useState(false);
  const [foco, setFoco] = useState(null);
  const id = `barras-${titulo.replace(/\W+/g, '-').toLowerCase()}`;
  const maximo = Math.max(1, ...linhas.map((l) => Number(l[medida]) || 0));
  const chaveDe = (l) => l.chave || l.rotulo;
  const principal = (l) => (medida === 'valor' ? moeda(l.valor) : String(l.quantidade));
  const dica = (l) => `${l.rotulo} · ${l.quantidade} contrato(s) · ${moeda(l.valor)}`;

  return (
    <section aria-labelledby={id} className="border border-borda rounded p-3 min-w-0">
      <div className="flex items-center gap-2 mb-2">
        <h2 id={id} className="text-sm">{titulo}</h2>
        {linhas.length > 0 && (
          <button
            type="button"
            className="ml-auto text-xs text-texto-suave hover:text-texto flex items-center gap-1"
            onClick={() => setTabela((t) => !t)}
          >
            {tabela ? <BarChart3 size={12} /> : <Table2 size={12} />} {tabela ? 'ver gráfico' : 'ver tabela'}
          </button>
        )}
      </div>
      {nota && <p className="text-[11px] text-texto-suave mb-2">{nota}</p>}

      {linhas.length === 0 ? (
        <p className="text-sm text-texto-suave">{vazio}</p>
      ) : tabela ? (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-texto-suave text-left">
              <th className="py-1 font-normal">{titulo}</th>
              <th className="py-1 font-normal text-right">Contratos</th>
              <th className="py-1 font-normal text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={chaveDe(l)} className="border-t border-borda">
                <td className="py-1 pr-2 break-words">{l.rotulo}</td>
                <td className="py-1 text-right font-mono">{l.quantidade}</td>
                <td className="py-1 text-right font-mono whitespace-nowrap">{moeda(l.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="space-y-1" onMouseLeave={() => setFoco(null)}>
          {linhas.map((l) => {
            const k = chaveDe(l);
            const Rotulo = aoClicar ? 'button' : 'span';
            return (
              <li
                key={k}
                className="relative"
                onMouseEnter={() => setFoco(k)}
                onFocus={() => setFoco(k)}
                onBlur={() => setFoco(null)}
                tabIndex={aoClicar ? undefined : 0}
                aria-label={dica(l)}
              >
                <div className="flex items-baseline gap-2 text-xs">
                  <Rotulo
                    type={aoClicar ? 'button' : undefined}
                    onClick={aoClicar ? () => aoClicar(l) : undefined}
                    className={`truncate min-w-0 flex-1 text-left ${aoClicar ? 'hover:text-voltagem' : ''}`}
                    title={l.rotulo}
                  >
                    {l.rotulo}
                  </Rotulo>
                  <span className="font-mono shrink-0">{principal(l)}</span>
                </div>
                <span className="block h-2 mt-0.5">
                  <span
                    className={`block h-2 rounded-r bg-voltagem transition-opacity ${foco && foco !== k ? 'opacity-40' : ''}`}
                    style={{ width: `${Math.max(0.5, ((Number(l[medida]) || 0) / maximo) * 100)}%` }}
                  />
                </span>
                {foco === k && (
                  <span
                    role="tooltip"
                    className="absolute left-0 -top-7 z-10 max-w-full truncate px-2 py-1 text-[11px] rounded border border-borda bg-superficie shadow pointer-events-none"
                  >
                    {dica(l)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
