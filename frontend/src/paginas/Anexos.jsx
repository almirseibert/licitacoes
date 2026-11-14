import { useEffect, useRef, useState } from 'react';
import { Loader2, Trash2, Paperclip } from 'lucide-react';
import { api } from '../servicos/api';
import { dataHora } from '../servicos/formato';

/**
 * Aba Anexos (Seção 8): o que a equipe anexou à licitação — o mesmo anexo que
 * a tela "Montar envio" oferece para entrar no pacote.
 */
export default function Anexos({ id }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const campo = useRef(null);

  const carregar = () =>
    api
      .anexosDa(id)
      .then((r) => {
        setDados(r.dados);
        setErro(null);
      })
      .catch((e) => setErro(e.message));

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const anexar = async (arquivo) => {
    if (!arquivo) return;
    setEnviando(true);
    try {
      await api.anexar(id, arquivo.name, arquivo);
      if (campo.current) campo.current.value = '';
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const remover = async (a) => {
    if (!window.confirm(`Remover o anexo "${a.titulo}"?`)) return;
    try {
      await api.removerAnexo(id, a.id);
      await carregar();
    } catch (e) {
      setErro(e.message);
    }
  };

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-xs text-texto-suave">
        {enviando ? <Loader2 size={12} className="animate-spin" /> : <Paperclip size={12} />}
        anexar arquivo
        <input ref={campo} type="file" className="text-[11px] w-56" onChange={(e) => anexar(e.target.files[0])} />
      </label>
      {erro && <p className="text-xs text-erro">{erro}</p>}
      {!dados ? (
        <Loader2 size={16} className="animate-spin text-texto-suave" />
      ) : dados.length === 0 ? (
        <p className="text-sm text-texto-suave">Nenhum anexo. Proposta assinada, atestado específico, procuração — o que for só desta licitação.</p>
      ) : (
        <ul className="divide-y divide-borda border border-borda rounded">
          {dados.map((a) => (
            <li key={a.id} className="px-3 py-2 flex items-center gap-3 text-sm">
              <span className="flex-1 min-w-0 truncate">{a.titulo}</span>
              <span className="text-[11px] text-texto-suave font-mono">
                {a.tamanho_bytes ? `${Math.max(1, Math.round(a.tamanho_bytes / 1024))} KB · ` : ''}
                {dataHora(a.criado_em)}
              </span>
              <button onClick={() => remover(a)} className="text-texto-suave hover:text-erro" aria-label={`Remover ${a.titulo}`}>
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
