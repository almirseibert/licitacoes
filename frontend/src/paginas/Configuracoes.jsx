import { useEffect, useState } from 'react';
import { Loader2, RotateCcw, Save, RefreshCw } from 'lucide-react';
import { api } from '../servicos/api';
import { moeda } from '../servicos/formato';

/**
 * Configurações (seção 11.13): pesos da pontuação e CNAEs do perfil da empresa.
 *
 * Mudar um peso aqui não reescreve o passado sozinho — por isso o botão
 * "Repontuar", que recalcula o que já está gravado sem ir aos portais.
 */
export default function Configuracoes() {
  const [pesos, setPesos] = useState([]);
  const [perfil, setPerfil] = useState(null);
  const [objetoSocial, setObjetoSocial] = useState(null);
  const [alterados, setAlterados] = useState({});
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = () =>
    api
      .configuracoes()
      .then((r) => {
        setPesos(r.pesos);
        setPerfil(r.perfis[0] || null);
        setObjetoSocial(r.objeto_social);
        setAlterados({});
        setErro(null);
      })
      .catch((e) => setErro(e.message));

  useEffect(() => {
    carregar();
  }, []);

  const mudar = (chave, valor) => setAlterados({ ...alterados, [chave]: valor });

  const salvar = async () => {
    const corpo = {};
    for (const [chave, valor] of Object.entries(alterados)) {
      if (chave.startsWith('modalidade.')) {
        corpo.modalidade = { ...(corpo.modalidade || {}), [chave.slice(11)]: Number(valor) };
      } else {
        corpo[chave] = Number(valor);
      }
    }
    setSalvando(true);
    try {
      const r = await api.salvarPesos(corpo);
      setAviso(r.mensagem);
      setErro(null);
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const repontuar = async () => {
    try {
      const r = await api.repontuar();
      setAviso(r.mensagem);
      setErro(null);
    } catch (e) {
      setErro(e.message);
    }
  };

  const grupos = [...new Set(pesos.map((p) => p.grupo))];
  const temAlteracao = Object.keys(alterados).length > 0;

  return (
    <div className="h-full overflow-auto">
      <div className="px-4 py-3 border-b border-borda flex items-center gap-3 sticky top-0 bg-obsidiana z-10">
        <h1 className="font-titulo text-xl">Configurações</h1>
        <p className="text-xs text-texto-suave">Pesos da pontuação e objeto social da empresa</p>
        <button className="botao ml-auto flex items-center gap-1" onClick={repontuar}>
          <RefreshCw size={12} /> Repontuar o Radar
        </button>
        <button className="botao-primario flex items-center gap-1" onClick={salvar} disabled={!temAlteracao || salvando}>
          {salvando ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          Salvar pesos
        </button>
      </div>

      {erro && (
        <p className="mx-4 mt-3 px-3 py-2 text-xs border border-erro/40 text-erro rounded bg-erro/5">{erro}</p>
      )}
      {aviso && (
        <p className="mx-4 mt-3 px-3 py-2 text-xs border border-borda bg-superficie rounded text-texto-suave">
          {aviso}
        </p>
      )}

      <div className="p-4 grid gap-4 lg:grid-cols-2 items-start">
        {grupos.map((grupo) => (
          <section key={grupo} className="border border-borda rounded bg-superficie">
            <h2 className="px-3 py-2 text-xs uppercase tracking-wide text-texto-suave border-b border-borda">
              {grupo}
            </h2>
            <ul className="divide-y divide-borda/60">
              {pesos
                .filter((p) => p.grupo === grupo)
                .map((p) =>
                  p.chave === 'modalidade' ? (
                    <li key={p.chave} className="px-3 py-2">
                      <p className="text-sm mb-1">{p.rotulo}</p>
                      <div className="grid grid-cols-2 gap-x-4">
                        {Object.entries(p.valor).map(([tipo, pontos]) => (
                          <Linha
                            key={tipo}
                            rotulo={tipo.replace(/_/g, ' ')}
                            valor={alterados[`modalidade.${tipo}`] ?? pontos}
                            padrao={p.padrao[tipo]}
                            aoMudar={(v) => mudar(`modalidade.${tipo}`, v)}
                          />
                        ))}
                      </div>
                    </li>
                  ) : (
                    <li key={p.chave} className="px-3 py-1.5">
                      <Linha
                        rotulo={p.rotulo}
                        descricao={p.descricao}
                        valor={alterados[p.chave] ?? p.valor}
                        padrao={p.padrao}
                        alterado={p.alterado}
                        aoMudar={(v) => mudar(p.chave, v)}
                        aoRestaurar={
                          p.alterado
                            ? async () => {
                                await api.restaurarPeso(p.chave);
                                carregar();
                              }
                            : null
                        }
                      />
                    </li>
                  )
                )}
            </ul>
          </section>
        ))}

        {/* ------------------------------------------------- objeto social */}
        <section className="border border-borda rounded bg-superficie lg:col-span-2">
          <h2 className="px-3 py-2 text-xs uppercase tracking-wide text-texto-suave border-b border-borda">
            Objeto social — {perfil ? perfil.nome : 'sem perfil'} · {perfil ? perfil.cnaes.length : 0} CNAEs
          </h2>

          {objetoSocial && (
            <div className="px-3 py-3 flex gap-8 border-b border-borda">
              <Contagem rotulo="coberto" valor={objetoSocial.cobertura.coberto} cor="text-ok" />
              <Contagem rotulo="parcial" valor={objetoSocial.cobertura.parcial} cor="text-atencao" />
              <Contagem rotulo="fora" valor={objetoSocial.cobertura.fora} cor="text-erro" />
              <Contagem rotulo="sem checagem" valor={objetoSocial.cobertura.sem_checagem} cor="text-texto-suave" />
            </div>
          )}

          <div className="grid lg:grid-cols-2">
            <div className="border-r border-borda">
              <h3 className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-texto-suave bg-navy/40">
                CNAEs e as palavras que eles cobrem
              </h3>
              <ul className="divide-y divide-borda/60 max-h-80 overflow-auto">
                {perfil &&
                  perfil.cnaes.map((c) => (
                    <li key={c.codigo} className="px-3 py-2">
                      <p className="text-sm font-mono">
                        {c.codigo}
                        {c.principal && <span className="ml-2 text-[10px] text-voltagem uppercase">principal</span>}
                      </p>
                      <p className="text-[11px] text-texto-suave">{c.descricao}</p>
                      <p className="text-[11px] text-texto-suave mt-0.5">{(c.cobertura || []).join(' · ')}</p>
                    </li>
                  ))}
              </ul>
            </div>

            <div>
              <h3 className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-texto-suave bg-navy/40">
                O que estamos perdendo por falta de CNAE
              </h3>
              {objetoSocial && objetoSocial.ranking.length > 0 ? (
                <table className="w-full text-sm tabela-densa">
                  <thead>
                    <tr>
                      <th>Termo</th>
                      <th className="w-16 text-right">Fora</th>
                      <th className="w-32 text-right">Valor médio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {objetoSocial.ranking.map((r) => (
                      <tr key={r.termo}>
                        <td className="text-xs">
                          {r.termo}
                          {r.grupo && <span className="ml-2 text-[11px] text-texto-suave">{r.grupo}</span>}
                        </td>
                        <td className="text-right font-mono text-xs">{r.fora}</td>
                        <td className="text-right font-mono text-xs text-texto-suave">{moeda(r.valor_medio)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="px-3 py-6 text-sm text-texto-suave">
                  Nenhuma licitação ficou de fora por objeto social. Repontue depois de mexer nos CNAEs
                  para esta lista se atualizar.
                </p>
              )}
              <p className="px-3 py-2 text-[11px] text-texto-suave border-t border-borda">
                Termo que aparece muito aqui é candidato a entrar no contrato social na próxima alteração
                (seção 6.2).
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Linha({ rotulo, descricao, valor, padrao, alterado, aoMudar, aoRestaurar }) {
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm truncate">{rotulo}</p>
        {descricao && <p className="text-[11px] text-texto-suave">{descricao}</p>}
      </div>
      {alterado && (
        <span className="text-[10px] text-texto-suave font-mono" title="padrão de fábrica">
          era {padrao}
        </span>
      )}
      {aoRestaurar && (
        <button className="text-texto-suave hover:text-texto" title="voltar ao padrão" onClick={aoRestaurar}>
          <RotateCcw size={12} />
        </button>
      )}
      <input
        className="campo-caixa w-16 text-right font-mono"
        type="number"
        min="-100"
        max="100"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
      />
    </div>
  );
}

function Contagem({ rotulo, valor, cor }) {
  return (
    <div>
      <p className={`font-mono text-xl ${cor}`}>{valor ?? 0}</p>
      <p className="text-[11px] text-texto-suave uppercase tracking-wide">{rotulo}</p>
    </div>
  );
}
