/** Barra de abas das telas da Seção 17. `abas` = [[chave, rótulo], …]. */
export default function Abas({ abas, ativa, aoMudar }) {
  return (
    <div className="flex gap-1 mb-5 border-b border-borda overflow-x-auto" role="tablist">
      {abas.map(([chave, rotulo]) => (
        <button
          key={chave}
          role="tab"
          aria-selected={ativa === chave}
          onClick={() => aoMudar(chave)}
          className={`px-3 py-2 text-xs border-b-2 -mb-px whitespace-nowrap shrink-0 ${
            ativa === chave ? 'border-texto text-texto' : 'border-transparent text-texto-suave hover:text-texto'
          }`}
        >
          {rotulo}
        </button>
      ))}
    </div>
  );
}
