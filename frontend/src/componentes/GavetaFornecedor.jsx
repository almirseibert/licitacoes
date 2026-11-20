import { X } from 'lucide-react';
import PerfilFornecedor from './PerfilFornecedor';

/** A gaveta com o perfil de um fornecedor no mercado (por CNPJ). Some quando `fornecedor` é null. */
export default function GavetaFornecedor({ fornecedor, aoFechar }) {
  if (!fornecedor) return null;
  return (
    <div className="fixed inset-0 bg-obsidiana/80 flex justify-end z-20" onClick={aoFechar}>
      <aside
        className="w-full max-w-2xl bg-superficie border-l border-borda h-full overflow-auto"
        onClick={(e) => e.stopPropagation()}
        aria-label="Perfil do fornecedor"
      >
        <header className="px-4 py-3 border-b border-borda flex items-start gap-2 sticky top-0 bg-superficie z-10">
          <div className="flex-1 min-w-0">
            <h2 className="font-titulo text-base truncate">{fornecedor.empresa || 'Fornecedor'}</h2>
            <p className="font-mono text-xs text-texto-suave">{fornecedor.cnpj}</p>
          </div>
          <button className="text-texto-suave hover:text-texto" onClick={aoFechar} aria-label="Fechar">
            <X size={16} />
          </button>
        </header>
        <div className="p-4">
          <PerfilFornecedor cnpj={fornecedor.cnpj} />
        </div>
      </aside>
    </div>
  );
}
