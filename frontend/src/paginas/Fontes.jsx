import { useEffect, useState } from 'react';
import { Loader2, Play, FlaskConical, Plus, Trash2, X } from 'lucide-react';
import { api } from '../servicos/api';
import { dataHora, moeda, faixaPontuacao } from '../servicos/formato';
import Chave from '../componentes/Chave';

/**
 * Tela de Fontes (seções 4.1 e 11.3): cadastrar, editar, desativar, testar e
 * coletar. "Testar agora" roda a coleta só dela e devolve quantos resultados
 * vieram — sem gravar nada.
 */
export default function Fontes() {
  const [fontes, setFontes] = useState([]);
  const [adaptadores, setAdaptadores] = useState([]);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupada, setOcupada] = useState(null);
  const [teste, setTeste] = useState(null);
  const [nova, setNova] = useState(null);

  const carregar = () =>
    api
      .fontes()
      .then((r) => {
        setFontes(r.dados);
        setAdaptadores(r.adaptadores || []);
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

  const agir = async (fonte, chamada, rotulo) => {
    setOcupada(`${rotulo}:${fonte.id}`);
    setAviso(null);
    setErro(null);
    try {
      const r = await chamada();
      if (rotulo === 'testar') setTeste({ fonte, ...r });
      else setAviso(r.mensagem);
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupada(null);
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="px-4 py-3 border-b border-borda flex items-center gap-4">
        <h1 className="font-titulo text-xl">Fontes</h1>
        <p className="text-xs text-texto-suave">
          {fontes.filter((f) => f.ativa).length} ativas de {fontes.length} portais cadastrados
        </p>
        <button
          className="botao ml-auto flex items-center gap-1"
          onClick={() =>
            setNova({ nome: '', adaptador: adaptadores[0] ? adaptadores[0].chave : '', url_base: '', intervalo_horas: 6, ativa: 1, config: '{}' })
          }
        >
          <Plus size={12} /> Nova fonte
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

      {nova && (
        <NovaFonte
          valores={nova}
          adaptadores={adaptadores}
          aoMudar={setNova}
          aoCancelar={() => setNova(null)}
          aoSalvar={async () => {
            await executar(() => api.criarFonte(nova));
            setNova(null);
          }}
        />
      )}

      <table className="w-full text-sm tabela-densa mt-2">
        <thead>
          <tr>
            <th className="w-12">Ativa</th>
            <th>Fonte</th>
            <th className="w-32">Adaptador</th>
            <th className="w-20">Intervalo</th>
            <th className="w-36">Última coleta</th>
            <th>Último status</th>
            <th className="w-24 text-right">Licitações</th>
            <th className="w-24"></th>
          </tr>
        </thead>
        <tbody>
          {fontes.map((f) => (
            <tr key={f.id}>
              <td>
                <Chave
                  ligada={Boolean(f.ativa)}
                  titulo={f.ativa ? 'entra na varredura' : 'fora da varredura'}
                  onChange={(v) => executar(() => api.salvarFonte(f.id, { ativa: v }))}
                />
              </td>
              <td>
                <input
                  className="campo"
                  defaultValue={f.nome}
                  onBlur={(e) =>
                    e.target.value !== f.nome && executar(() => api.salvarFonte(f.id, { nome: e.target.value }))
                  }
                />
                {f.observacao && <p className="px-2 text-[11px] text-texto-suave">{f.observacao}</p>}
              </td>
              <td className="text-xs font-mono text-texto-suave">
                {f.adaptador}
                {!f.adaptador_disponivel && (
                  <span className="ml-1 text-atencao" title="adaptador ainda não implementado">
                    (pendente)
                  </span>
                )}
              </td>
              <td>
                <input
                  className="campo text-right font-mono text-xs"
                  type="number"
                  min="1"
                  max="168"
                  defaultValue={f.intervalo_horas}
                  title="de quantas em quantas horas varrer"
                  onBlur={(e) =>
                    Number(e.target.value) !== f.intervalo_horas &&
                    executar(() => api.salvarFonte(f.id, { intervalo_horas: e.target.value }))
                  }
                />
              </td>
              <td className="text-xs font-mono text-texto-suave">{dataHora(f.ultima_coleta)}</td>
              <td className="text-xs text-texto-suave">{f.ultimo_status || '—'}</td>
              <td className="text-right font-mono text-xs">{f.total_licitacoes}</td>
              <td>
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => agir(f, () => api.testarFonte(f.id), 'testar')}
                    disabled={!f.adaptador_disponivel || ocupada === `testar:${f.id}`}
                    title="Testar agora — busca de verdade, sem gravar"
                    className="text-texto-suave hover:text-texto disabled:opacity-30"
                  >
                    {ocupada === `testar:${f.id}` ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <FlaskConical size={14} />
                    )}
                  </button>
                  <button
                    onClick={() => agir(f, () => api.coletarFonte(f.id), 'coletar')}
                    disabled={!f.adaptador_disponivel || ocupada === `coletar:${f.id}`}
                    title="Coletar esta fonte agora"
                    className="text-texto-suave hover:text-texto disabled:opacity-30"
                  >
                    {ocupada === `coletar:${f.id}` ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Play size={14} />
                    )}
                  </button>
                  <button
                    onClick={() => executar(() => api.apagarFonte(f.id), `Fonte ${f.nome} apagada.`)}
                    title="Apagar fonte"
                    className="text-texto-suave hover:text-erro"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {teste && <ResultadoTeste dados={teste} aoFechar={() => setTeste(null)} />}
    </div>
  );
}

function NovaFonte({ valores, adaptadores, aoMudar, aoSalvar, aoCancelar }) {
  const campo = (chave, valor) => aoMudar({ ...valores, [chave]: valor });

  return (
    <div className="mx-4 mt-3 border border-borda rounded bg-superficie p-3 grid gap-2 md:grid-cols-[1fr_160px_1fr_90px_auto_auto] items-center">
      <input
        className="campo-caixa"
        placeholder="nome do portal"
        value={valores.nome}
        onChange={(e) => campo('nome', e.target.value)}
      />
      <select className="campo-caixa" value={valores.adaptador} onChange={(e) => campo('adaptador', e.target.value)}>
        {adaptadores.map((a) => (
          <option key={a.chave} value={a.chave}>
            {a.chave}
          </option>
        ))}
      </select>
      <input
        className="campo-caixa"
        placeholder="https://..."
        value={valores.url_base}
        onChange={(e) => campo('url_base', e.target.value)}
      />
      <input
        className="campo-caixa text-right font-mono"
        type="number"
        min="1"
        max="168"
        title="intervalo em horas"
        value={valores.intervalo_horas}
        onChange={(e) => campo('intervalo_horas', e.target.value)}
      />
      <button className="botao-primario" onClick={aoSalvar}>
        Cadastrar
      </button>
      <button className="botao" onClick={aoCancelar}>
        Cancelar
      </button>
      <p className="md:col-span-6 text-[11px] text-texto-suave">
        Só existem adaptadores para os portais listados acima. Um portal novo precisa de um adaptador
        antes de coletar — até lá, a fonte fica cadastrada e marcada como pendente.
      </p>
    </div>
  );
}

function ResultadoTeste({ dados, aoFechar }) {
  return (
    <div className="fixed inset-0 bg-obsidiana/80 flex items-start justify-center p-6 z-20 overflow-auto">
      <div className="bg-superficie border border-borda rounded w-full max-w-4xl">
        <div className="px-4 py-3 border-b border-borda flex items-center gap-3">
          <h2 className="font-titulo text-lg">Teste de {dados.fonte.nome}</h2>
          <span className="text-xs text-texto-suave">
            {dados.termos} termos · {Math.round((dados.duracao_ms || 0) / 1000)} s · nada foi gravado
          </span>
          <button className="ml-auto text-texto-suave hover:text-texto" onClick={aoFechar}>
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-3 grid grid-cols-3 gap-4 border-b border-borda">
          <div>
            <p className="font-mono text-2xl text-voltagem">{dados.encontradas}</p>
            <p className="text-[11px] text-texto-suave uppercase tracking-wide">encontradas</p>
          </div>
          <div>
            <p className="font-mono text-2xl">{dados.ignoradas}</p>
            <p className="text-[11px] text-texto-suave uppercase tracking-wide">cortadas (encerrada ou excluída)</p>
          </div>
          <div>
            <p className="font-mono text-2xl">{(dados.erros || []).length}</p>
            <p className="text-[11px] text-texto-suave uppercase tracking-wide">falhas do portal</p>
          </div>
        </div>

        {(dados.erros || []).length > 0 && (
          <p className="px-4 py-2 text-[11px] text-atencao border-b border-borda">{dados.erros[0]}</p>
        )}

        <table className="w-full text-sm tabela-densa">
          <thead>
            <tr>
              <th className="w-14 text-right">Nota</th>
              <th className="w-12">UF</th>
              <th>Objeto</th>
              <th className="w-28 text-right">Valor</th>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
