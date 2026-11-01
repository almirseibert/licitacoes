import { useEffect, useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { api } from '../servicos/api';
import { dataHora } from '../servicos/formato';

/**
 * Tela de Fontes — leitura e disparo de coleta. O CRUD com "Testar agora"
 * completo entra na Fase 2 (seção 16).
 */
export default function Fontes() {
  const [fontes, setFontes] = useState([]);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupada, setOcupada] = useState(null);

  const carregar = () => {
    api.fontes().then((r) => setFontes(r.dados)).catch((e) => setErro(e.message));
  };

  useEffect(() => {
    carregar();
  }, []);

  const coletar = async (fonte) => {
    setOcupada(fonte.id);
    setAviso(null);
    try {
      const r = await api.coletarFonte(fonte.id);
      setAviso(r.mensagem);
    } catch (e) {
      setAviso(e.message);
    } finally {
      setOcupada(null);
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="px-4 py-3 border-b border-borda flex items-center gap-4">
        <h1 className="font-titulo text-xl">Fontes</h1>
        <p className="text-xs text-texto-suave">
          Portais varridos pelo painel. Cadastro e edição entram na Fase 2.
        </p>
      </div>

      {erro && <p className="m-4 text-sm text-erro">{erro}</p>}
      {aviso && (
        <div className="mx-4 mt-3 px-3 py-2 text-xs border border-borda bg-superficie rounded text-texto-suave">
          {aviso}
        </div>
      )}

      <table className="w-full text-sm tabela-densa mt-2">
        <thead>
          <tr>
            <th>Fonte</th>
            <th className="w-32">Adaptador</th>
            <th className="w-16">Ativa</th>
            <th className="w-20">Intervalo</th>
            <th className="w-36">Última coleta</th>
            <th>Último status</th>
            <th className="w-24 text-right">Licitações</th>
            <th className="w-20"></th>
          </tr>
        </thead>
        <tbody>
          {fontes.map((f) => (
            <tr key={f.id}>
              <td>
                <span className="text-texto">{f.nome}</span>
                {f.observacao && <p className="text-[11px] text-texto-suave mt-0.5">{f.observacao}</p>}
              </td>
              <td className="text-xs font-mono text-texto-suave">
                {f.adaptador}
                {!f.adaptador_disponivel && <span className="ml-1 text-atencao">(pendente)</span>}
              </td>
              <td className="text-xs">{f.ativa ? <span className="text-ok">sim</span> : <span className="text-texto-suave">não</span>}</td>
              <td className="text-xs font-mono text-texto-suave">{f.intervalo_horas} h</td>
              <td className="text-xs font-mono text-texto-suave">{dataHora(f.ultima_coleta)}</td>
              <td className="text-xs text-texto-suave">{f.ultimo_status || '—'}</td>
              <td className="text-right font-mono text-xs">{f.total_licitacoes}</td>
              <td className="text-right">
                <button
                  onClick={() => coletar(f)}
                  disabled={!f.adaptador_disponivel || ocupada === f.id}
                  title="Coletar esta fonte agora"
                  className="text-texto-suave hover:text-texto disabled:opacity-30"
                >
                  {ocupada === f.id ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
