import { useState } from 'react';
import { api } from '../servicos/api';

/**
 * Pesquisa de NPS depois de 30 dias de uso (Seção 17). Um cartão no canto, que não
 * bloqueia nada: "agora não" dispensa e o backend só volta a perguntar em 30 dias.
 */
export default function PesquisaNps({ aoFechar }) {
  const [nota, setNota] = useState(null);
  const [comentario, setComentario] = useState('');
  const [erro, setErro] = useState(null);
  const [agradecido, setAgradecido] = useState(false);

  const enviar = async () => {
    try {
      await api.enviarNps(nota, comentario);
      setAgradecido(true);
      setTimeout(aoFechar, 2500);
    } catch (e) {
      setErro(e.message);
    }
  };
  const dispensar = async () => {
    await api.dispensarNps().catch(() => {});
    aoFechar();
  };

  return (
    <aside className="fixed bottom-4 right-4 z-40 w-80 max-w-[calc(100vw-2rem)] bg-obsidiana border border-borda rounded p-4 shadow-lg" aria-label="Pesquisa de satisfação">
      {agradecido ? (
        <p className="text-sm" role="status">Obrigado! Sua resposta ajuda a melhorar o painel.</p>
      ) : (
        <>
          <p className="text-sm mb-3">De 0 a 10, o quanto você recomendaria o painel a um colega de outra empresa?</p>
          <div className="flex flex-wrap gap-1 mb-1" role="group" aria-label="Nota de 0 a 10">
            {Array.from({ length: 11 }, (_, n) => (
              <button
                key={n}
                aria-pressed={nota === n}
                onClick={() => setNota(n)}
                className={`w-6 h-7 text-xs border rounded ${nota === n ? 'border-voltagem text-voltagem' : 'border-borda text-texto-suave hover:text-texto'}`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="flex justify-between text-[10px] text-texto-suave mb-3"><span>nada provável</span><span>muito provável</span></p>
          {nota !== null && (
            <textarea className="campo-caixa w-full h-16 mb-2" placeholder="Quer contar o motivo? (opcional)" aria-label="Comentário" value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={1000} />
          )}
          {erro && <p className="text-xs text-erro mb-2" role="alert">{erro}</p>}
          <div className="flex gap-2">
            <button className="botao-primario" disabled={nota === null} onClick={enviar}>Enviar</button>
            <button className="botao" onClick={dispensar}>Agora não</button>
          </div>
        </>
      )}
    </aside>
  );
}
