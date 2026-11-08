import { useEffect, useState } from 'react';
import { Loader2, Play, FlaskConical, Plus, Trash2, X, Settings2 } from 'lucide-react';
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
  // Qual fonte está com a configuração aberta (seção 5.3).
  const [configurando, setConfigurando] = useState(null);

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
                    onClick={() => setConfigurando(configurando === f.id ? null : f.id)}
                    title="Configuração do adaptador — o mapa de campos da seção 5.3"
                    className={configurando === f.id ? 'text-texto' : 'text-texto-suave hover:text-texto'}
                  >
                    <Settings2 size={14} />
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

      {configurando && (
        <Configuracao
          fonte={fontes.find((f) => f.id === configurando)}
          adaptador={adaptadores.find(
            (a) => a.chave === (fontes.find((f) => f.id === configurando) || {}).adaptador
          )}
          aoFechar={() => setConfigurando(null)}
          aoSalvar={async (config) => {
            await executar(() => api.salvarFonte(configurando, { config }), 'Configuração salva.');
            setConfigurando(null);
          }}
        />
      )}

      {teste && <ResultadoTeste dados={teste} aoFechar={() => setTeste(null)} />}
    </div>
  );
}

/**
 * A configuração do adaptador (seção 5.3) — o que torna o `generico_html`
 * utilizável sem tocar em código.
 *
 * O JSON é editado como texto, de propósito: o mapa de campos é aninhado, e um
 * formulário de seletor CSS por campo seria mais trabalhoso de usar do que o
 * próprio JSON. O que a tela dá é o modelo pronto e a validação antes de
 * salvar — configuração com JSON quebrado só apareceria como "0 resultados" na
 * próxima coleta, e aí ninguém saberia por quê.
 */
const MODELO_GENERICO = {
  url_busca: 'https://portal.exemplo.gov.br/licitacoes?busca={termo}&pagina={pagina}',
  seletor_lista: 'table.licitacoes tbody tr',
  campos: {
    identificador: { seletor: 'td:nth-child(1)' },
    orgao: { seletor: 'td:nth-child(2)' },
    objeto: { seletor: 'td:nth-child(3)' },
    valor: { seletor: 'td:nth-child(4)' },
    fim: { seletor: 'td:nth-child(5)', formato_data: 'DD/MM/YYYY HH:mm' },
    link: { seletor: 'a', atributo: 'href' },
  },
  paginas_max: 5,
  uf_padrao: '',
  municipio_padrao: '',
};

function Configuracao({ fonte, adaptador, aoFechar, aoSalvar }) {
  const [texto, setTexto] = useState(() => JSON.stringify(fonte.config || {}, null, 2));
  const [erro, setErro] = useState(null);

  if (!fonte) return null;

  const salvar = () => {
    try {
      const objeto = JSON.parse(texto || '{}');
      setErro(null);
      aoSalvar(objeto);
    } catch (e) {
      setErro(`O JSON está inválido: ${e.message}`);
    }
  };

  return (
    <div className="mx-4 my-3 border border-borda rounded bg-superficie p-3">
      <div className="flex items-baseline gap-3 mb-2">
        <p className="text-sm">
          Configuração de <span className="font-mono">{fonte.nome}</span>
        </p>
        <span className="text-[11px] font-mono text-texto-suave">{fonte.adaptador}</span>
        {fonte.adaptador === 'generico_html' && (
          <button
            className="text-[11px] text-texto-suave hover:text-texto underline"
            onClick={() => setTexto(JSON.stringify(MODELO_GENERICO, null, 2))}
          >
            usar o modelo da seção 5.3
          </button>
        )}
        <button className="ml-auto text-texto-suave hover:text-texto" onClick={aoFechar}>
          <X size={14} />
        </button>
      </div>

      <textarea
        className="campo-caixa w-full font-mono text-xs"
        rows={14}
        spellCheck={false}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
      />

      {erro && <p className="mt-1 text-xs text-erro">{erro}</p>}

      {adaptador && adaptador.camposConfig && adaptador.camposConfig.length > 0 && (
        <div className="mt-2 text-[11px] text-texto-suave">
          <p className="mb-1">Campos que este adaptador entende:</p>
          <ul className="grid md:grid-cols-2 gap-x-6">
            {adaptador.camposConfig.map((c) => (
              <li key={c.campo}>
                <span className="font-mono text-texto">{c.campo}</span> — {c.rotulo}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-2 flex items-center gap-3">
        <button className="botao-primario" onClick={salvar}>
          Salvar configuração
        </button>
        <button className="botao" onClick={aoFechar}>
          Cancelar
        </button>
        {fonte.adaptador === 'generico_html' && (
          <p className="text-[11px] text-texto-suave">
            Depois de salvar, use “Testar agora” — ele busca de verdade e mostra o que o seletor pegou, sem
            gravar nada.
          </p>
        )}
      </div>
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
