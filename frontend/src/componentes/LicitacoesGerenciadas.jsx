// Donut de identidade própria: cinza para o que é trabalho em curso,
// o único acento do tema (voltagem) reservado para "Ganhas" — o resultado
// que a organização quer ver em destaque. Nada de arco-íris categórico,
// para não competir com o acento de urgência usado no resto do painel.
const SEGMENTOS = [
  { chave: 'favoritadas', lista: 'favoritas', rotulo: 'Favoritadas', cor: 'rgb(var(--cor-texto-suave) / 0.35)' },
  { chave: 'gerenciadas', lista: 'gerenciadas', rotulo: 'Gerenciadas', cor: 'rgb(var(--cor-texto-suave) / 0.7)' },
  { chave: 'finalizadas', lista: 'finalizadas', rotulo: 'Finalizadas', cor: 'rgb(var(--cor-apagado))' },
  { chave: 'ganhas', lista: null, rotulo: 'Ganhas', cor: 'rgb(var(--cor-voltagem))' },
];

/**
 * "Licitações Gerenciadas" (Dashboard): as quatro listas do ciclo de
 * trabalho (Seção 8), num anel só — cada fatia e cada linha da legenda leva
 * ao Radar já com aquele filtro, exceto Ganhas, que vai direto ao Funil
 * (é lá que o resultado fica registrado por licitação).
 */
export default function LicitacoesGerenciadas({ dados, aoIr, tamanho = 120, espessura = 16 }) {
  const raio = (tamanho - espessura) / 2;
  const circunferencia = 2 * Math.PI * raio;
  const total = SEGMENTOS.reduce((s, seg) => s + (dados[seg.chave] || 0), 0);
  const gap = 3;

  let acumulado = 0;
  const arcos = total === 0 ? [] : SEGMENTOS.filter((seg) => dados[seg.chave] > 0).map((seg) => {
    const fatia = (dados[seg.chave] / total) * circunferencia;
    const arco = {
      ...seg,
      comprimento: Math.max(0, fatia - gap),
      deslocamento: -acumulado,
    };
    acumulado += fatia;
    return arco;
  });

  const irPara = (seg) => aoIr(seg.lista ? 'radar' : 'funil', seg.lista ? { lista: seg.lista } : {});

  return (
    <section aria-label="Licitações gerenciadas" className="border border-voltagem/20 rounded bg-superficie/40 p-3 flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: tamanho, height: tamanho }}>
        <svg width={tamanho} height={tamanho} className="-rotate-90">
          <circle cx={tamanho / 2} cy={tamanho / 2} r={raio} fill="none" className="stroke-borda" strokeWidth={espessura} />
          {arcos.map((arco) => (
            <circle
              key={arco.chave}
              cx={tamanho / 2}
              cy={tamanho / 2}
              r={raio}
              fill="none"
              style={{ stroke: arco.cor }}
              strokeWidth={espessura}
              strokeLinecap="round"
              strokeDasharray={`${arco.comprimento} ${circunferencia - arco.comprimento}`}
              strokeDashoffset={arco.deslocamento}
            />
          ))}
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-xl">{total}</span>
          <span className="text-[10px] text-texto-suave">no total</span>
        </span>
      </div>

      <ul className="flex-1 space-y-1">
        {SEGMENTOS.map((seg) => (
          <li key={seg.chave}>
            <button onClick={() => irPara(seg)} className="w-full flex items-center gap-2 text-sm hover:text-texto text-texto-suave">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: seg.cor }} />
              <span className="flex-1 text-left">{seg.rotulo}</span>
              <span className="font-mono text-texto">{dados[seg.chave] || 0}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
