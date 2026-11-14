import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, ExternalLink } from 'lucide-react';
import { api } from '../servicos/api';

const TIPOS = { compras: 'Portal de compras', cadastro: 'Cadastro de fornecedor', certidao: 'Certidão', outro: 'Outro' };
const VAZIO = { nome: '', url: '', tipo: 'compras', login_vence_em: '', observacao: '' };
const COR = { verde: 'text-texto-suave', amarelo: 'text-atencao', vermelho: 'text-erro', cinza: 'text-texto-suave' };

/**
 * Agenda de portais (Seção 10): onde a empresa tem cadastro e quando vence.
 * Sem login e sem senha — o painel não guarda credencial de portal; guarde-as
 * no seu gerenciador de senhas. O alerta de vencimento vai ao sino e ao dashboard.
 */
export default function Portais() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [novo, setNovo] = useState(VAZIO);

  const carregar = () =>
    api
      .portais()
      .then((r) => {
        setDados(r);
        setErro(null);
      })
      .catch((e) => setErro(e.message));

  useEffect(() => {
    carregar();
  }, []);

  const executar = async (acao) => {
    try {
      await acao();
      await carregar();
    } catch (e) {
      setErro(e.message);
    }
  };

  const criar = () =>
    executar(async () => {
      await api.criarPortal(novo);
      setNovo(VAZIO);
    });

  if (erro && !dados) return <p className="m-4 text-sm text-erro">{erro}</p>;
  if (!dados) return <Loader2 size={16} className="animate-spin text-texto-suave m-4" />;

  return (
    <div>
      <div className="px-4 py-3 border-b border-borda flex flex-wrap items-center gap-x-4 gap-y-1">
        <h1 className="font-titulo text-xl">Agenda de portais</h1>
        <p className="text-xs text-texto-suave">
          {dados.resumo.total} portal(is)
          {dados.resumo.vencendo > 0 && <span className="text-atencao"> · {dados.resumo.vencendo} vencendo</span>}
          {dados.resumo.vencidos > 0 && <span className="text-erro"> · {dados.resumo.vencidos} vencido(s)</span>}
        </p>
      </div>

      {erro && <p className="mx-4 mt-3 px-3 py-2 text-xs border border-erro/40 text-erro rounded bg-erro/5">{erro}</p>}

      <div className="mx-4 mt-3 border border-borda rounded bg-superficie p-3 grid gap-2 md:grid-cols-[1fr_1.4fr_160px_140px_auto] items-center">
        <input
          className="campo-caixa"
          placeholder="nome do portal"
          value={novo.nome}
          onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
        />
        <input
          className="campo-caixa"
          placeholder="https://…"
          value={novo.url}
          onChange={(e) => setNovo({ ...novo, url: e.target.value })}
        />
        <select className="campo-caixa" value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value })}>
          {dados.tipos.map((t) => (
            <option key={t} value={t}>
              {TIPOS[t] || t}
            </option>
          ))}
        </select>
        <input
          className="campo-caixa"
          type="date"
          title="vencimento do cadastro"
          value={novo.login_vence_em}
          onChange={(e) => setNovo({ ...novo, login_vence_em: e.target.value })}
        />
        <button className="botao-primario flex items-center gap-1" disabled={!novo.nome} onClick={criar}>
          <Plus size={12} /> Adicionar
        </button>
        <input
          className="campo-caixa md:col-span-5"
          placeholder="observação (ex.: quem cuida, documento que o cadastro exige)"
          value={novo.observacao}
          onChange={(e) => setNovo({ ...novo, observacao: e.target.value })}
        />
        <p className="md:col-span-5 text-[11px] text-texto-suave">
          O painel não guarda login nem senha de portal. Guarde-os no seu gerenciador de senhas — aqui fica
          só onde é e quando o cadastro vence. O aviso chega 30, 15 e 3 dias antes.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm tabela-densa mt-3">
          <thead>
            <tr>
              <th>Portal</th>
              <th className="w-44">Tipo</th>
              <th className="w-36">Cadastro vence</th>
              <th className="w-48">Situação</th>
              <th className="w-16"></th>
            </tr>
          </thead>
          <tbody>
            {dados.dados.map((p) => (
              <tr key={p.id}>
                <td>
                  <input
                    className="campo text-xs"
                    defaultValue={p.nome}
                    aria-label="nome"
                    onBlur={(e) =>
                      e.target.value !== p.nome && executar(() => api.salvarPortal(p.id, { nome: e.target.value }))
                    }
                  />
                  <input
                    className="campo text-[11px] text-texto-suave"
                    defaultValue={p.observacao || ''}
                    placeholder="observação"
                    aria-label="observação"
                    onBlur={(e) =>
                      e.target.value !== (p.observacao || '') &&
                      executar(() => api.salvarPortal(p.id, { observacao: e.target.value }))
                    }
                  />
                </td>
                <td>
                  <select
                    className="campo text-xs"
                    value={p.tipo}
                    onChange={(e) => executar(() => api.salvarPortal(p.id, { tipo: e.target.value }))}
                  >
                    {dados.tipos.map((t) => (
                      <option key={t} value={t}>
                        {TIPOS[t] || t}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    className="campo text-xs font-mono"
                    type="date"
                    defaultValue={p.login_vence_em || ''}
                    onBlur={(e) =>
                      e.target.value !== (p.login_vence_em || '') &&
                      executar(() => api.salvarPortal(p.id, { login_vence_em: e.target.value }))
                    }
                  />
                </td>
                <td className={`text-xs ${COR[p.situacao.cor]}`}>{p.situacao.texto}</td>
                <td>
                  <div className="flex items-center justify-end gap-2">
                    {p.url && (
                      <a
                        className="text-texto-suave hover:text-texto"
                        href={p.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="abrir o portal"
                      >
                        <ExternalLink size={13} />
                      </a>
                    )}
                    <button
                      className="text-texto-suave hover:text-erro"
                      title="tirar da agenda"
                      onClick={() => executar(() => api.apagarPortal(p.id))}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!dados.dados.length && (
        <p className="m-4 text-sm text-texto-suave">
          Nenhum portal na agenda. Comece pelos que você mais usa — Compras.gov.br, o portal do estado, o
          cadastro de fornecedor do município.
        </p>
      )}
    </div>
  );
}
