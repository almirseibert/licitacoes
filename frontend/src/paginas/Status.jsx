import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { api } from '../servicos/api';
import { dataHora } from '../servicos/formato';

const NIVEL = {
  ok: { rotulo: 'No ar', cor: 'text-ok', ponto: 'bg-ok' },
  atrasado: { rotulo: 'Atrasado', cor: 'text-atencao', ponto: 'bg-atencao' },
  parado: { rotulo: 'Parado', cor: 'text-erro', ponto: 'bg-erro' },
  desligado: { rotulo: 'Desligado', cor: 'text-texto-suave', ponto: 'bg-apagado' },
};
const GERAL = {
  ok: 'Tudo no ar.',
  atrasado: 'Algo está atrasado. Os dados podem demorar a aparecer.',
  parado: 'Há uma ferramenta parada. Avise o suporte se continuar assim.',
};

/**
 * Status das ferramentas (Seção 17): a primeira coisa a olhar quando "o painel
 * parou". A cor nunca vem sozinha — sempre a palavra ao lado.
 */
export default function Status({ aoIr }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(() => {
    setOcupado(true);
    api.statusFerramentas().then((d) => { setDados(d); setErro(null); }).catch((e) => setErro(e.message)).finally(() => setOcupado(false));
  }, []);
  useEffect(() => {
    carregar();
    const t = setInterval(() => { if (!document.hidden) carregar(); }, 60000);
    return () => clearInterval(t);
  }, [carregar]);

  if (!dados) {
    return <div className="p-6 text-sm text-texto-suave">{erro || <span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> verificando…</span>}</div>;
  }
  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <header className="mb-5 flex items-start gap-3">
        <div>
          <h1 className="font-titulo text-xl">Status das ferramentas</h1>
          <p className={`text-sm ${NIVEL[dados.geral].cor}`} role="status">{GERAL[dados.geral]}</p>
          <p className="text-[11px] text-texto-suave">Verificado em {dataHora(dados.verificado_em)}; atualiza a cada minuto.</p>
        </div>
        <button className="botao ml-auto flex items-center gap-1.5" onClick={carregar} disabled={ocupado}>
          <RefreshCw size={12} className={ocupado ? 'animate-spin' : ''} /> Atualizar
        </button>
      </header>
      {erro && <p className="text-xs text-erro mb-3" role="alert">{erro}</p>}

      <ul className="max-w-2xl border border-borda rounded divide-y divide-borda mb-8">
        {dados.itens.map((i) => (
          <li key={i.chave} className="p-3 flex items-start gap-3">
            <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${NIVEL[i.nivel].ponto}`} aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm">{i.rotulo}</p>
              <p className="text-xs text-texto-suave">{i.mensagem}</p>
            </div>
            <span className={`text-xs ${NIVEL[i.nivel].cor}`}>{NIVEL[i.nivel].rotulo}</span>
          </li>
        ))}
      </ul>

      <h2 className="font-titulo text-base mb-2">Fontes de coleta</h2>
      <table className="tabela-densa w-full max-w-2xl text-left mb-6">
        <thead><tr><th>Fonte</th><th>Última coleta</th><th>Situação</th></tr></thead>
        <tbody>
          {dados.fontes.map((f) => (
            <tr key={f.nome}>
              <td>{f.nome}{!f.ativa && <span className="text-texto-suave"> (desligada)</span>}</td>
              <td>{f.ultima_coleta ? dataHora(f.ultima_coleta) : 'ainda não coletou'}</td>
              <td className="text-texto-suave">{f.ultimo_status || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {dados.fontes.length === 0 && <p className="text-sm text-texto-suave mb-6 -mt-4">Nenhuma fonte cadastrada.</p>}
      <button className="botao" onClick={() => aoIr('ajuda', { aba: 'solicitacoes' })}>Falar com o suporte</button>
    </div>
  );
}
