/**
 * Alternância "por mim / por todos" (Seção 8). "Por mim" é o que tenho como
 * responsável ou em que tenho tarefa — quem decide isso é o backend.
 */
export default function PorMim({ valor, aoMudar }) {
  return (
    <div role="group" aria-label="De quem" className="inline-flex border border-borda rounded overflow-hidden text-xs">
      {[
        ['todos', 'por todos'],
        ['mim', 'por mim'],
      ].map(([chave, rotulo]) => (
        <button
          key={chave}
          type="button"
          aria-pressed={valor === chave}
          onClick={() => aoMudar(chave)}
          className={`px-2.5 py-1 ${valor === chave ? 'bg-realce/[0.08] text-texto' : 'text-texto-suave hover:text-texto'}`}
        >
          {rotulo}
        </button>
      ))}
    </div>
  );
}
