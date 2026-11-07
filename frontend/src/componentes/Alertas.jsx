import { useEffect, useState } from 'react';
import { Bell, Check, AlertTriangle } from 'lucide-react';
import { api } from '../servicos/api';
import { dataHora } from '../servicos/formato';

/**
 * Sino de alertas (seção 4.9). Fica na navegação, com a contagem do que ainda
 * não foi lido — prazo de 48 h e 2 h, documento vencendo e licitação nova com
 * pontuação alta.
 */
export default function Alertas({ aoAbrirLicitacao }) {
  const [dados, setDados] = useState({ dados: [], nao_lidos: 0 });
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState(null);

  const carregar = () =>
    api
      .alertas()
      .then(setDados)
      .catch((e) => setErro(e.message));

  useEffect(() => {
    carregar();
    // O worker cria alertas o tempo todo; a cada minuto a contagem se atualiza.
    const relogio = setInterval(carregar, 60000);
    return () => clearInterval(relogio);
  }, []);

  const marcar = async (alerta) => {
    await api.marcarAlerta(alerta.id, true).catch((e) => setErro(e.message));
    carregar();
  };

  // O nível vem do backend desde a Fase 10: alerta vermelho é o que não pode
  // passar batido — edital alterado, hoje (seção 21.3). O tipo continua
  // pintando o que o backend ainda manda como 'info'.
  const POR_NIVEL = { vermelho: 'text-erro', atencao: 'text-atencao' };
  const CORES = {
    prazo_2h: 'text-erro',
    prazo_48h: 'text-atencao',
    validade_vencido: 'text-erro',
    nova_licitacao_alta: 'text-voltagem',
    edital_alterado: 'text-erro',
    reabertura: 'text-atencao',
    resultado: 'text-voltagem',
  };
  const corDe = (a) => POR_NIVEL[a.nivel] || CORES[a.tipo] || 'text-texto';

  return (
    <div className="relative">
      <button
        onClick={() => setAberto(!aberto)}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-texto-suave hover:text-texto border-l-2 border-transparent"
      >
        <span className="relative">
          <Bell size={16} />
          {dados.nao_lidos > 0 && (
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-voltagem" />
          )}
        </span>
        <span className="hidden md:inline">Alertas</span>
        {dados.nao_lidos > 0 && (
          <span className="hidden md:inline ml-auto font-mono text-[11px] text-voltagem">{dados.nao_lidos}</span>
        )}
      </button>

      {aberto && (
        <div className="absolute left-full bottom-0 ml-2 w-96 max-h-[70vh] overflow-auto bg-superficie border border-borda rounded shadow-xl z-30">
          <div className="px-3 py-2 border-b border-borda flex items-center gap-2 sticky top-0 bg-superficie">
            <span className="text-xs uppercase tracking-wide text-texto-suave">
              Alertas {dados.nao_lidos > 0 && `· ${dados.nao_lidos} não lidos`}
            </span>
            {dados.nao_lidos > 0 && (
              <button
                className="ml-auto text-[11px] text-texto-suave hover:text-texto"
                onClick={async () => {
                  await api.marcarAlertasLidos().catch((e) => setErro(e.message));
                  carregar();
                }}
              >
                marcar todos como lidos
              </button>
            )}
          </div>

          {erro && <p className="px-3 py-2 text-xs text-erro">{erro}</p>}

          {dados.dados.length === 0 && (
            <p className="px-3 py-6 text-xs text-texto-suave text-center">
              Nada por aqui. Mova um card para “Vou disputar” e o painel passa a vigiar o prazo.
            </p>
          )}

          <ul className="divide-y divide-borda/60">
            {dados.dados.map((a) => (
              <li key={a.id} className={`px-3 py-2 ${a.lido ? 'opacity-50' : ''}`}>
                <div className="flex items-start gap-2">
                  <button
                    className="text-left flex-1"
                    onClick={() => {
                      if (a.licitacao_id && aoAbrirLicitacao) {
                        aoAbrirLicitacao(a.licitacao_id);
                        setAberto(false);
                      }
                    }}
                  >
                    <p className={`text-xs ${corDe(a)}`}>
                      {a.nivel === 'vermelho' && <AlertTriangle size={11} className="inline mr-1 -translate-y-px" />}
                      {a.mensagem}
                    </p>
                    <p className="text-[11px] text-texto-suave mt-0.5">
                      {dataHora(a.criado_em)}
                      {a.quando && <span> · fim das propostas {dataHora(a.quando)}</span>}
                    </p>
                  </button>
                  {!a.lido && (
                    <button
                      className="text-texto-suave hover:text-ok shrink-0"
                      title="marcar como lido"
                      onClick={() => marcar(a)}
                    >
                      <Check size={13} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
