import { useEffect, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { api } from '../servicos/api';
import { dataHora } from '../servicos/formato';

/**
 * Histórico do card (seções 4.9 e 10): anotações e mudanças de etapa na mesma
 * linha do tempo. Saber por que você descartou algo três meses atrás vale mais
 * do que parece quando o órgão republica a mesma licitação.
 */
export default function Historico({ id }) {
  const [dados, setDados] = useState(null);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const carregar = () =>
    api
      .anotacoes(id)
      .then((r) => {
        setDados(r.dados);
        setErro(null);
      })
      .catch((e) => setErro(e.message));

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const anotar = async () => {
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      await api.anotar(id, texto.trim());
      setTexto('');
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  if (erro && !dados) return <p className="text-sm text-erro">{erro}</p>;
  if (!dados) return <Loader2 size={16} className="animate-spin text-texto-suave" />;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          className="campo-caixa flex-1"
          placeholder="o que aconteceu? (ex.: pedi esclarecimento sobre o item 3)"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && anotar()}
        />
        <button className="botao-primario flex items-center gap-1" onClick={anotar} disabled={enviando}>
          {enviando ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Anotar
        </button>
      </div>

      {erro && <p className="text-xs text-erro">{erro}</p>}

      {dados.length === 0 ? (
        <p className="text-sm text-texto-suave">
          Nada registrado ainda. Mudanças de etapa entram aqui sozinhas.
        </p>
      ) : (
        <ul className="space-y-2">
          {dados.map((a) => (
            <li key={a.id} className="border-l-2 border-borda pl-3 py-0.5">
              <p className={`text-sm ${a.tipo === 'etapa' ? 'text-voltagem' : ''}`}>
                {a.tipo === 'etapa' ? `Etapa: ${a.texto}` : a.texto}
              </p>
              <p className="text-[11px] text-texto-suave">
                {dataHora(a.criado_em)}
                {a.autor && <span> · {a.autor}</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
