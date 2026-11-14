import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../servicos/api';

const ABAS = [
  ['termos', 'Termos de uso'],
  ['privacidade', 'Política de privacidade'],
  ['aviso_ia', 'Aviso sobre a IA'],
];

/**
 * Termos, política e aviso da IA (Seção 17). Vêm do backend (rota pública), com a
 * versão vigente. Enquanto o texto não tiver revisão de advogado, a faixa avisa —
 * é o que a API devolve em `revisado_por_advogado`.
 */
export default function TextoLegal({ abaInicial = 'termos' }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [aba, setAba] = useState(abaInicial);

  useEffect(() => {
    api.legal().then(setDados).catch((e) => setErro(e.message));
  }, []);

  if (erro) return <p className="text-sm text-erro" role="alert">{erro}</p>;
  if (!dados) {
    return (
      <p className="flex items-center gap-2 text-sm text-texto-suave">
        <Loader2 size={14} className="animate-spin" /> carregando…
      </p>
    );
  }

  return (
    <div>
      {!dados.revisado_por_advogado && (
        <p className="text-xs text-atencao bg-atencao/[0.06] border border-borda rounded px-3 py-2 mb-4" role="note">
          Minuta ainda sem revisão de advogado. Vale como descrição do que o painel faz, e pode mudar.
        </p>
      )}
      <div className="flex gap-1 mb-4 border-b border-borda" role="tablist">
        {ABAS.map(([chave, rotulo]) => (
          <button
            key={chave}
            role="tab"
            aria-selected={aba === chave}
            onClick={() => setAba(chave)}
            className={`px-3 py-2 text-xs border-b-2 -mb-px ${
              aba === chave ? 'border-texto text-texto' : 'border-transparent text-texto-suave hover:text-texto'
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {aba === 'aviso_ia' ? (
        <div className="space-y-3 text-sm leading-relaxed">
          {dados.aviso_ia.map((p) => <p key={p}>{p}</p>)}
        </div>
      ) : (
        <div className="space-y-5">
          {dados[aba].map((secao) => (
            <section key={secao.titulo}>
              <h3 className="font-titulo text-sm mb-1.5">{secao.titulo}</h3>
              <div className="space-y-2 text-sm leading-relaxed text-texto-suave">
                {secao.paragrafos.map((p) => <p key={p}>{p}</p>)}
              </div>
            </section>
          ))}
        </div>
      )}
      <p className="text-[11px] text-texto-suave mt-6">Versão {dados.versao}</p>
    </div>
  );
}
