import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, FlaskConical, X } from 'lucide-react';
import { api } from '../servicos/api';
import { moeda, faixaPontuacao } from '../servicos/formato';
import Chave from '../componentes/Chave';

/**
 * Tela de Palavras-chave (seção 11.4): duas listas lado a lado — "Buscar por" e
 * "Ignorar quando aparecer". Edição em linha, sem modal.
 *
 * O botão "Simular" é o que permite testar um termo antes de ativá-lo: ele vai
 * ao portal de verdade, mostra quantas licitações viriam e com que pontuação,
 * e não grava nada.
 */
export default function Palavras() {
  const [palavras, setPalavras] = useState([]);
  const [excluidas, setExcluidas] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [nova, setNova] = useState({ termo: '', grupo: '', peso: 10, usar_aspas: true });
  const [novaExcluida, setNovaExcluida] = useState('');
  const [simulando, setSimulando] = useState(null);
  const [simulacao, setSimulacao] = useState(null);

  const carregar = () =>
    api
      .palavras()
      .then((r) => {
        setPalavras(r.dados);
        setExcluidas(r.excluidas);
        setGrupos(r.grupos || []);
        setErro(null);
      })
      .catch((e) => setErro(e.message));

  useEffect(() => {
    carregar();
  }, []);

  const executar = async (acao, mensagem) => {
    try {
      const r = await acao();
      setAviso((r && r.mensagem) || mensagem || null);
      setErro(null);
      await carregar();
    } catch (e) {
      setErro(e.message);
    }
  };

  const simular = async (termo, peso, usarAspas) => {
    if (!termo.trim()) return setErro('Escreva o termo antes de simular.');
    setSimulando(termo);
    setErro(null);
    try {
      const r = await api.simularPalavra({ termo: termo.trim(), peso, usar_aspas: usarAspas });
      setSimulacao(r);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSimulando(null);
    }
  };

  const criar = async () => {
    if (!nova.termo.trim()) return setErro('Escreva o termo.');
    if (!nova.grupo.trim()) return setErro('Escolha o grupo.');
    await executar(() => api.criarPalavra(nova));
    setNova({ termo: '', grupo: nova.grupo, peso: 10, usar_aspas: true });
  };

  const porGrupo = [...new Set(palavras.map((p) => p.grupo))];

  return (
    <div className="h-full overflow-auto">
      <div className="px-4 py-3 border-b border-borda flex items-center gap-4">
        <h1 className="font-titulo text-xl">Palavras-chave</h1>
        <p className="text-xs text-texto-suave">
          {palavras.filter((p) => p.ativa).length} ativas de {palavras.length} · {excluidas.length} palavras de corte
        </p>
      </div>

      {erro && (
        <p className="mx-4 mt-3 px-3 py-2 text-xs border border-erro/40 text-erro rounded bg-erro/5">{erro}</p>
      )}
      {aviso && (
        <p className="mx-4 mt-3 px-3 py-2 text-xs border border-borda bg-superficie rounded text-texto-suave">
          {aviso}
        </p>
      )}

      <div className="p-4 grid gap-4 lg:grid-cols-[2fr_1fr] items-start">
        {/* ------------------------------------------------------ buscar por */}
        <section className="border border-borda rounded bg-superficie">
          <h2 className="px-3 py-2 text-xs uppercase tracking-wide text-texto-suave border-b border-borda">
            Buscar por
          </h2>

          <div className="px-3 py-2 border-b border-borda grid grid-cols-[1fr_140px_60px_auto_auto] gap-2 items-center">
            <input
              className="campo-caixa"
              placeholder="novo termo (ex.: videomonitoramento)"
              value={nova.termo}
              onChange={(e) => setNova({ ...nova, termo: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && criar()}
            />
            <input
              className="campo-caixa"
              list="grupos"
              placeholder="grupo"
              value={nova.grupo}
              onChange={(e) => setNova({ ...nova, grupo: e.target.value })}
            />
            <datalist id="grupos">
              {grupos.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
            <input
              className="campo-caixa text-right font-mono"
              type="number"
              min="1"
              max="40"
              title="peso na pontuação (1 a 40)"
              value={nova.peso}
              onChange={(e) => setNova({ ...nova, peso: e.target.value })}
            />
            <button
              className="botao flex items-center gap-1"
              onClick={() => simular(nova.termo, Number(nova.peso) || 10, nova.usar_aspas)}
              disabled={simulando === nova.termo}
            >
              {simulando === nova.termo ? <Loader2 size={12} className="animate-spin" /> : <FlaskConical size={12} />}
              Simular
            </button>
            <button className="botao-primario flex items-center gap-1" onClick={criar}>
              <Plus size={12} /> Adicionar
            </button>
          </div>

          {porGrupo.map((grupo) => (
            <div key={grupo}>
              <h3 className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-texto-suave bg-navy/40">
                {grupo}
              </h3>
              <ul className="divide-y divide-borda/60">
                {palavras
                  .filter((p) => p.grupo === grupo)
                  .map((p) => (
                    <li
                      key={p.id}
                      className="px-3 py-1 grid grid-cols-[auto_1fr_56px_52px_auto_auto] gap-2 items-center text-sm"
                    >
                      <Chave
                        ligada={Boolean(p.ativa)}
                        titulo={p.ativa ? 'ativa na coleta' : 'fora da coleta'}
                        onChange={(v) => executar(() => api.salvarPalavra(p.id, { ativa: v }))}
                      />
                      <input
                        className={`campo ${p.ativa ? '' : 'text-texto-suave line-through'}`}
                        defaultValue={p.termo}
                        onBlur={(e) =>
                          e.target.value !== p.termo &&
                          executar(() => api.salvarPalavra(p.id, { termo: e.target.value }))
                        }
                      />
                      <input
                        className="campo text-right font-mono text-xs"
                        type="number"
                        min="1"
                        max="40"
                        title="peso na pontuação"
                        defaultValue={p.peso}
                        onBlur={(e) =>
                          Number(e.target.value) !== p.peso &&
                          executar(() => api.salvarPalavra(p.id, { peso: e.target.value }))
                        }
                      />
                      <span
                        className="font-mono text-[11px] text-texto-suave text-right"
                        title="licitações no radar trazidas por este termo"
                      >
                        {p.licitacoes}
                      </span>
                      <button
                        className="text-texto-suave hover:text-texto"
                        title="simular este termo agora"
                        onClick={() => simular(p.termo, p.peso, Boolean(p.usar_aspas))}
                      >
                        {simulando === p.termo ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <FlaskConical size={13} />
                        )}
                      </button>
                      <button
                        className="text-texto-suave hover:text-erro"
                        title="apagar termo"
                        onClick={() =>
                          executar(() => api.apagarPalavra(p.id), `"${p.termo}" saiu da busca.`)
                        }
                      >
                        <Trash2 size={13} />
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </section>

        {/* -------------------------------------------- ignorar quando aparecer */}
        <section className="border border-borda rounded bg-superficie">
          <h2 className="px-3 py-2 text-xs uppercase tracking-wide text-texto-suave border-b border-borda">
            Ignorar quando aparecer
          </h2>

          <div className="px-3 py-2 border-b border-borda flex gap-2">
            <input
              className="campo-caixa flex-1"
              placeholder="ex.: merenda"
              value={novaExcluida}
              onChange={(e) => setNovaExcluida(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || !novaExcluida.trim()) return;
                executar(() => api.criarExcluida(novaExcluida.trim()));
                setNovaExcluida('');
              }}
            />
            <button
              className="botao"
              onClick={() => {
                if (!novaExcluida.trim()) return;
                executar(() => api.criarExcluida(novaExcluida.trim()));
                setNovaExcluida('');
              }}
            >
              <Plus size={12} />
            </button>
          </div>

          <ul className="divide-y divide-borda/60">
            {excluidas.map((e) => (
              <li key={e.id} className="px-3 py-1 flex items-center gap-2 text-sm">
                <Chave
                  ligada={Boolean(e.ativa)}
                  titulo={e.ativa ? 'cortando resultados' : 'desligada'}
                  onChange={(v) => executar(() => api.salvarExcluida(e.id, { ativa: v }))}
                />
                <input
                  className={`campo flex-1 ${e.ativa ? '' : 'text-texto-suave line-through'}`}
                  defaultValue={e.termo}
                  onBlur={(ev) =>
                    ev.target.value !== e.termo &&
                    executar(() => api.salvarExcluida(e.id, { termo: ev.target.value }))
                  }
                />
                <button
                  className="text-texto-suave hover:text-erro"
                  title="apagar"
                  onClick={() => executar(() => api.apagarExcluida(e.id))}
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>

          <p className="px-3 py-2 text-[11px] text-texto-suave border-t border-borda">
            Uma palavra de corte vale na próxima coleta. Para aplicar ao que já está no Radar,
            use <strong className="text-texto">Repontuar</strong> em Configurações.
          </p>
        </section>
      </div>

      {simulacao && <Simulacao dados={simulacao} aoFechar={() => setSimulacao(null)} />}
    </div>
  );
}

/** Resultado do "Simular": o que o termo traria agora, sem gravar nada. */
function Simulacao({ dados, aoFechar }) {
  return (
    <div className="fixed inset-0 bg-obsidiana/80 flex items-start justify-center p-6 z-20 overflow-auto">
      <div className="bg-superficie border border-borda rounded w-full max-w-4xl">
        <div className="px-4 py-3 border-b border-borda flex items-center gap-3">
          <h2 className="font-titulo text-lg">Simulação de “{dados.termo}”</h2>
          <span className="text-xs text-texto-suave">em {dados.fonte} · nada foi gravado</span>
          <button className="ml-auto text-texto-suave hover:text-texto" onClick={aoFechar}>
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-3 grid grid-cols-3 gap-4 border-b border-borda">
          <Numero rotulo="viriam do portal agora" valor={dados.no_portal} destaque />
          <Numero rotulo="já no Radar (30 dias)" valor={dados.ja_no_radar} />
          <Numero rotulo="cortadas na hora" valor={dados.descartadas_na_hora} />
        </div>

        {dados.erros && dados.erros.length > 0 && (
          <p className="px-4 py-2 text-[11px] text-atencao border-b border-borda">
            O portal falhou em parte da busca: {dados.erros[0]}
          </p>
        )}

        <table className="w-full text-sm tabela-densa">
          <thead>
            <tr>
              <th className="w-14 text-right">Nota</th>
              <th className="w-12">UF</th>
              <th>Objeto</th>
              <th className="w-28 text-right">Valor</th>
              <th className="w-24">Objeto social</th>
            </tr>
          </thead>
          <tbody>
            {(dados.amostra || []).map((a, i) => (
              <tr key={i}>
                <td className="text-right font-mono" style={{ color: faixaPontuacao(a.pontuacao).cor }}>
                  {a.pontuacao}
                </td>
                <td className="font-mono text-xs text-texto-suave">{a.uf}</td>
                <td className="text-xs">{a.objeto}</td>
                <td className="text-right font-mono text-xs text-texto-suave">{moeda(a.valor_estimado)}</td>
                <td className="text-xs text-texto-suave">{a.objeto_social || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {!(dados.amostra || []).length && (
          <p className="px-4 py-6 text-sm text-texto-suave text-center">
            Esse termo não trouxe nada agora. Tente sem aspas ou com uma palavra mais genérica.
          </p>
        )}
      </div>
    </div>
  );
}

function Numero({ rotulo, valor, destaque }) {
  return (
    <div>
      <p className={`font-mono text-2xl ${destaque ? 'text-voltagem' : 'text-texto'}`}>{valor}</p>
      <p className="text-[11px] text-texto-suave uppercase tracking-wide">{rotulo}</p>
    </div>
  );
}
