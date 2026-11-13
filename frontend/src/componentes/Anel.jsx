import { faixaPontuacao } from '../servicos/formato';

/** Anel de pontuação do card/linha do Radar (seção 11.1). */
export default function Anel({ pontuacao = 0, tamanho = 38 }) {
  const faixa = faixaPontuacao(pontuacao);
  const raio = (tamanho - 5) / 2;
  const circunferencia = 2 * Math.PI * raio;
  const preenchido = (Math.min(100, Math.max(0, pontuacao)) / 100) * circunferencia;

  return (
    <div className="relative shrink-0" style={{ width: tamanho, height: tamanho }} title={`${faixa.rotulo} — ${pontuacao} de 100`}>
      <svg width={tamanho} height={tamanho} className="-rotate-90">
        {/* `stroke` por classe/estilo, não por atributo: atributo SVG não lê var() do tema. */}
        <circle cx={tamanho / 2} cy={tamanho / 2} r={raio} fill="none" className="stroke-borda" strokeWidth="3" />
        <circle
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={raio}
          fill="none"
          style={{ stroke: faixa.cor }}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${preenchido} ${circunferencia}`}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-mono text-[11px] font-medium"
        style={{ color: faixa.cor }}
      >
        {pontuacao}
      </span>
    </div>
  );
}
