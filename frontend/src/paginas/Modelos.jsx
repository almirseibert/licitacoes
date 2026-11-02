import { useEffect, useState } from 'react';
import { Loader2, Copy, Save, Trash2, Eye, Plus, Lock } from 'lucide-react';
import { api } from '../servicos/api';

/**
 * Modelos de declaração (seção 18.3): editor simples, lista de variáveis
 * clicáveis ao lado e pré-visualização com os dados de uma licitação real.
 *
 * Modelo do sistema não se edita: duplica e edita a cópia. Assim um ajuste
 * feito às pressas numa disputa não estraga o modelo da próxima.
 */
export default function Modelos() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [aberto, setAberto] = useState(null); // modelo em edição
  const [corpo, setCorpo] = useState('');
  const [titulo, setTitulo] = useState('');
  const [previa, setPrevia] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [vendo, setVendo] = useState(null);

  const carregar = () =>
    api
      .modelos()
      .then((r) => {
        setDados(r);
        setErro(null);
      })
      .catch((e) => setErro(e.message));

  useEffect(() => {
    carregar();
  }, []);

  useEffect(() => () => vendo && URL.revokeObjectURL(vendo.url), [vendo]);

  const abrir = (modelo) => {
    setAberto(modelo);
    setCorpo(modelo.corpo);
    setTitulo(modelo.titulo);
    setPrevia(null);
  };

  const executar = async (acao, mensagem) => {
    try {
      const r = await acao();
      setAviso((r && r.mensagem) || mensagem || null);
      setErro(null);
      await carregar();
      return r;
    } catch (e) {
      setErro(e.message);
      return null;
    }
  };

  const verPrevia = async () => {
    setOcupado(true);
    try {
      const r = await api.previaModelo(corpo);
      setPrevia(r);
      setErro(null);
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(false);
    }
  };

  const verPdf = async (modelo) => {
    try {
      const blob = await api.previaPdf(modelo.id);
      if (vendo) URL.revokeObjectURL(vendo.url);
      setVendo({ titulo: modelo.titulo, url: URL.createObjectURL(blob) });
    } catch (e) {
      setErro(e.message);
    }
  };

  const inserirVariavel = (nome) => setCorpo((atual) => `${atual}{{${nome}}}`);

  if (erro && !dados) return <p className="m-4 text-sm text-erro">{erro}</p>;
  if (!dados) return <Loader2 size={16} className="animate-spin text-texto-suave m-4" />;

  return (
    <div className="h-full overflow-auto">
      <div className="px-4 py-3 border-b border-borda flex items-center gap-4">
        <h1 className="font-titulo text-xl">Modelos de declaração</h1>
        <p className="text-xs text-texto-suave">
          {dados.dados.length} modelos · os do sistema são duplicados para editar
        </p>
        <button
          className="botao ml-auto flex items-center gap-1"
          onClick={async () => {
            const r = await executar(() =>
              api.criarModelo({ titulo: 'Nova declaração', codigo: 'outros', corpo: 'A empresa {{razao_social}}…' })
            );
            if (r) setAviso('Modelo criado. Edite o texto ao lado.');
          }}
        >
          <Plus size={12} /> Novo modelo
        </button>
      </div>

      {erro && <p className="mx-4 mt-3 px-3 py-2 text-xs border border-erro/40 text-erro rounded bg-erro/5">{erro}</p>}
      {aviso && (
        <p className="mx-4 mt-3 px-3 py-2 text-xs border border-borda bg-superficie rounded text-texto-suave">{aviso}</p>
      )}

      <div className="p-4 grid gap-4 lg:grid-cols-[320px_1fr] items-start">
        {/* ------------------------------------------------- lista */}
        <section className="border border-borda rounded bg-superficie">
          <h2 className="px-3 py-2 text-xs uppercase tracking-wide text-texto-suave border-b border-borda">
            Modelos
          </h2>
          <ul className="divide-y divide-borda/60 max-h-[70vh] overflow-auto">
            {dados.dados.map((m) => (
              <li
                key={m.id}
                className={`px-3 py-2 cursor-pointer hover:bg-white/[0.03] ${
                  aberto && aberto.id === m.id ? 'bg-white/[0.06]' : ''
                }`}
                onClick={() => abrir(m)}
              >
                <p className="text-sm flex items-center gap-1">
                  {m.padrao_sistema && <Lock size={10} className="text-texto-suave shrink-0" />}
                  <span className={m.ativo ? '' : 'line-through text-texto-suave'}>{m.titulo}</span>
                </p>
                <p className="text-[11px] text-texto-suave">{m.rotulo_codigo}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* ------------------------------------------------- editor */}
        {aberto ? (
          <section className="border border-borda rounded bg-superficie">
            <header className="px-3 py-2 border-b border-borda flex items-center gap-2">
              <input
                className="campo-caixa flex-1"
                value={titulo}
                disabled={Boolean(aberto.padrao_sistema)}
                onChange={(e) => setTitulo(e.target.value)}
              />
              {aberto.padrao_sistema ? (
                <button
                  className="botao flex items-center gap-1"
                  onClick={async () => {
                    const r = await executar(() => api.duplicarModelo(aberto.id));
                    if (r) setAberto(null);
                  }}
                >
                  <Copy size={12} /> Duplicar para editar
                </button>
              ) : (
                <>
                  <button
                    className="botao-primario flex items-center gap-1"
                    onClick={() => executar(() => api.salvarModelo(aberto.id, { titulo, corpo }), 'Modelo salvo.')}
                  >
                    <Save size={12} /> Salvar
                  </button>
                  <button
                    className="botao text-erro"
                    onClick={async () => {
                      await executar(() => api.apagarModelo(aberto.id), 'Modelo apagado.');
                      setAberto(null);
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </>
              )}
              <button className="botao flex items-center gap-1" onClick={() => verPdf(aberto)}>
                <Eye size={12} /> PDF
              </button>
            </header>

            <div className="grid lg:grid-cols-[1fr_220px]">
              <div className="p-3">
                <textarea
                  className="w-full h-72 bg-obsidiana border border-borda rounded p-3 text-sm font-mono leading-relaxed focus:border-voltagem focus:outline-none"
                  value={corpo}
                  readOnly={Boolean(aberto.padrao_sistema)}
                  onChange={(e) => setCorpo(e.target.value)}
                />
                <div className="flex items-center gap-2 mt-2">
                  <button className="botao flex items-center gap-1" onClick={verPrevia} disabled={ocupado}>
                    {ocupado ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />} Pré-visualizar
                  </button>
                  {aberto.padrao_sistema && (
                    <span className="text-[11px] text-texto-suave">
                      modelo do sistema — duplique para editar
                    </span>
                  )}
                </div>

                {previa && (
                  <div className="mt-3 border border-borda rounded bg-obsidiana p-3">
                    <p className="text-[11px] text-texto-suave mb-2">
                      Com os dados de: {previa.exemplo.orgao} · {previa.exemplo.modalidade} nº {previa.exemplo.numero}
                    </p>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{previa.texto}</p>
                    {previa.faltando.length > 0 && (
                      <p className="text-[11px] text-atencao mt-2">
                        Sem dado no perfil da empresa: {previa.faltando.join(', ')} — aparecem como lacuna.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <aside className="p-3 border-l border-borda">
                <p className="text-[11px] uppercase tracking-wide text-texto-suave mb-2">Variáveis</p>
                <ul className="space-y-1">
                  {dados.variaveis.map((v) => (
                    <li key={v.nome}>
                      <button
                        className="text-left w-full text-[11px] font-mono text-texto-suave hover:text-voltagem disabled:opacity-40"
                        title={v.descricao}
                        disabled={Boolean(aberto.padrao_sistema)}
                        onClick={() => inserirVariavel(v.nome)}
                      >
                        {`{{${v.nome}}}`}
                      </button>
                    </li>
                  ))}
                </ul>
              </aside>
            </div>
          </section>
        ) : (
          <p className="text-sm text-texto-suave">
            Escolha um modelo à esquerda. Os onze do sistema seguem a Lei 14.133/2021 e a LC 123/2006 —
            são genéricos: se o edital trouxer anexo próprio de declaração, use o anexo do edital.
          </p>
        )}
      </div>

      {vendo && (
        <div className="fixed inset-0 bg-obsidiana/80 flex items-start justify-center p-6 z-20">
          <div className="bg-superficie border border-borda rounded w-full max-w-3xl">
            <div className="px-4 py-2 border-b border-borda flex items-center gap-2 text-xs">
              <span className="truncate">{vendo.titulo}</span>
              <button
                className="ml-auto text-texto-suave hover:text-texto"
                onClick={() => {
                  URL.revokeObjectURL(vendo.url);
                  setVendo(null);
                }}
              >
                fechar
              </button>
            </div>
            <iframe title={vendo.titulo} src={vendo.url} className="w-full h-[70vh] bg-white" />
          </div>
        </div>
      )}
    </div>
  );
}
