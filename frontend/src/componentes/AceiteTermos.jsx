import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../servicos/api';
import TextoLegal from './TextoLegal';

/**
 * Aparece por cima do painel quando a pessoa ainda não aceitou a versão vigente
 * dos termos (convidada por e-mail, ou os termos mudaram). Só sai aceitando — ou
 * saindo da conta.
 */
export default function AceiteTermos({ aoAceitar, aoSair }) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState(null);

  const aceitar = async () => {
    setOcupado(true);
    setErro(null);
    try {
      await api.aceitarTermos();
      aoAceitar();
    } catch (e) {
      setErro(e.message);
      setOcupado(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-obsidiana/80 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Termos de uso">
      <div className="bg-obsidiana border border-borda rounded max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="p-4 border-b border-borda">
          <h2 className="font-titulo text-lg">Antes de continuar</h2>
          <p className="text-xs text-texto-suave">Leia os termos de uso e a política de privacidade. O aceite fica registrado.</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4"><TextoLegal /></div>
        <div className="p-4 border-t border-borda flex items-center gap-3">
          {erro && <p className="text-xs text-erro mr-auto" role="alert">{erro}</p>}
          <button className="botao ml-auto" onClick={aoSair} disabled={ocupado}>Sair</button>
          <button className="botao-primario flex items-center gap-2" onClick={aceitar} disabled={ocupado}>
            {ocupado && <Loader2 size={12} className="animate-spin" />}
            Li e aceito
          </button>
        </div>
      </div>
    </div>
  );
}
