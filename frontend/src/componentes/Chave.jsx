/**
 * Switch de ligar/desligar. Usa contraste, não a cor de destaque: o #22D3EE
 * fica reservado para a pontuação alta (seção 15 — um acento por tela).
 */
export default function Chave({ ligada, onChange, titulo }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligada}
      title={titulo}
      onClick={() => onChange(!ligada)}
      className={`w-8 h-[18px] rounded-full border transition-colors shrink-0 ${
        ligada ? 'bg-ok/30 border-ok/60' : 'bg-transparent border-borda'
      }`}
    >
      <span
        className={`block w-3 h-3 rounded-full transition-transform ${
          ligada ? 'translate-x-4 bg-ok' : 'translate-x-[2px] bg-texto-suave'
        }`}
      />
    </button>
  );
}
