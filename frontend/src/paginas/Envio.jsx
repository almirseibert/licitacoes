import { useEffect, useRef, useState } from 'react';
import { Loader2, Download, Paperclip, Trash2, AlertTriangle, PackageCheck, RotateCcw, FileSignature, Eye } from 'lucide-react';
import { api } from '../servicos/api';
import { dataHora } from '../servicos/formato';

/**
 * Tela "Montar envio" (seção 17.4), em três blocos: documentos da empresa,
 * declarações e o que é específico desta licitação.
 *
 * A marcação inicial vem do cruzamento kit × exigências do edital. Documento
 * vencido entra desmarcado e em vermelho — marcar mesmo assim exige confirmar,
 * e isso fica registrado no histórico do pacote.
 */
export default function Envio({ id }) {
  const [dados, setDados] = useState(null);
  const [marcados, setMarcados] = useState(new Set());
  const [anexosMarcados, setAnexosMarcados] = useState(new Set());
  const [declaracoes, setDeclaracoes] = useState(new Set());
  const [vendo, setVendo] = useState(null);
  const [formato, setFormato] = useState('pdf');
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [gerando, setGerando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const campoAnexo = useRef(null);

  const carregar = (kitId) =>
    api
      .envio(id, kitId)
      .then((r) => {
        setDados(r);
        setMarcados(new Set(r.documentos.filter((d) => d.marcado).map((d) => d.documento_id)));
        setAnexosMarcados(new Set(r.anexos.map((a) => a.id)));
        setDeclaracoes(new Set(r.declaracoes.filter((d) => d.marcado).map((d) => d.modelo_id)));
        setErro(null);
      })
      .catch((e) => setErro(e.message));

  useEffect(() => {
    carregar(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const alternar = (documento) => {
    if (!documento.documento_id) return;
    const novo = new Set(marcados);
    if (novo.has(documento.documento_id)) {
      novo.delete(documento.documento_id);
    } else {
      if (documento.vencido && !window.confirm(
        `${documento.rotulo} está ${documento.semaforo.texto}. Enviar assim mesmo? Isso fica registrado no histórico do envio.`
      )) return;
      novo.add(documento.documento_id);
    }
    setMarcados(novo);
  };

  const anexar = async (arquivo) => {
    if (!arquivo) return;
    try {
      const r = await api.anexar(id, arquivo.name, arquivo);
      setAviso(r.mensagem);
      if (campoAnexo.current) campoAnexo.current.value = '';
      await carregar(dados.kit.id);
    } catch (e) {
      setErro(e.message);
    }
  };

  const gerar = async () => {
    setGerando(true);
    setErro(null);
    setResultado(null);
    try {
      const escolhidos = dados.documentos.filter((d) => marcados.has(d.documento_id));
      const r = await api.gerarEnvio(id, {
        kit_id: dados.kit.id,
        formato,
        documentos: escolhidos.map((d) => d.documento_id),
        declaracoes: [...declaracoes],
        anexos: [...anexosMarcados],
        confirma_vencidos: escolhidos.some((d) => d.vencido),
      });
      setResultado(r);
      setAviso(r.mensagem);
      await carregar(dados.kit.id);
    } catch (e) {
      setErro(e.message);
    } finally {
      setGerando(false);
    }
  };

  const repetir = async (pacoteId) => {
    try {
      const r = await api.repetirEnvio(id, pacoteId);
      setFormato(r.formato || 'pdf');
      await carregar(r.kit_id);
      setMarcados(new Set(r.documentos));
      setAviso(r.mensagem);
    } catch (e) {
      setErro(e.message);
    }
  };

  if (erro && !dados) return <p className="text-sm text-erro">{erro}</p>;
  if (!dados) return <Loader2 size={16} className="animate-spin text-texto-suave" />;

  const escolhidos = dados.documentos.filter((d) => marcados.has(d.documento_id)).length;

  return (
    <div className="space-y-4">
      {erro && <p className="text-xs text-erro">{erro}</p>}
      {aviso && (
        <p className="text-xs text-texto-suave border border-borda rounded px-3 py-2 bg-superficie">{aviso}</p>
      )}

      {/* ------------------------------------- 1. documentos da empresa */}
      <section className="border border-borda rounded">
        <header className="px-3 py-2 border-b border-borda flex items-center gap-3">
          <h3 className="text-xs uppercase tracking-wide text-texto-suave">1. Documentos da empresa</h3>
          <select
            className="campo-caixa ml-auto text-xs"
            value={dados.kit.id}
            onChange={(e) => carregar(e.target.value)}
          >
            {dados.kits.map((k) => (
              <option key={k.id} value={k.id}>
                {k.nome}
                {k.padrao ? ' (padrão)' : ''}
              </option>
            ))}
          </select>
        </header>

        <table className="w-full text-sm tabela-densa">
          <tbody>
            {dados.documentos.map((d, i) => (
              <tr key={d.codigo} className={d.disponivel ? '' : 'opacity-60'}>
                <td className="w-8">
                  <input
                    type="checkbox"
                    disabled={!d.disponivel}
                    checked={marcados.has(d.documento_id)}
                    onChange={() => alternar(d)}
                  />
                </td>
                <td className="w-10 font-mono text-xs text-texto-suave">{String(i + 1).padStart(2, '0')}</td>
                <td className="text-xs">
                  {d.rotulo}
                  {!d.exigido_no_edital && (
                    <span className="ml-2 text-[11px] text-texto-suave">não exigido neste edital</span>
                  )}
                </td>
                <td className="w-56 text-xs">
                  <span
                    className={
                      d.semaforo.cor === 'verde'
                        ? 'text-texto-suave'
                        : d.semaforo.cor === 'amarelo'
                          ? 'text-atencao'
                          : 'text-erro'
                    }
                  >
                    {d.disponivel ? d.semaforo.texto : 'não cadastrado no cofre'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {dados.fora_do_kit.length > 0 && (
          <div className="px-3 py-2 border-t border-borda text-[11px] text-atencao flex items-start gap-2">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span>
              O edital pede {dados.fora_do_kit.map((f) => f.rotulo).join(', ')} e esse código não está neste kit.
              Suba o documento no cofre ou acrescente ao kit.
            </span>
          </div>
        )}

        {dados.condicoes.length > 0 && (
          <p className="px-3 py-2 border-t border-borda text-[11px] text-texto-suave">
            Condições do edital que não são papel para anexar:{' '}
            {dados.condicoes.map((c) => c.rotulo).join(', ')}.
          </p>
        )}
      </section>

      {/* ------------------------------------------------ 2. declarações */}
      <section className="border border-borda rounded">
        <header className="px-3 py-2 border-b border-borda flex items-center gap-3">
          <h3 className="text-xs uppercase tracking-wide text-texto-suave">
            2. Declarações geradas com os dados desta licitação
          </h3>
          <span className="ml-auto text-[11px] text-texto-suave">
            número, órgão e objeto entram sozinhos · você só assina
          </span>
        </header>

        <table className="w-full text-sm tabela-densa">
          <tbody>
            {dados.declaracoes.map((d) => (
              <tr key={d.modelo_id}>
                <td className="w-8">
                  <input
                    type="checkbox"
                    checked={declaracoes.has(d.modelo_id)}
                    onChange={() => {
                      const novo = new Set(declaracoes);
                      if (novo.has(d.modelo_id)) novo.delete(d.modelo_id);
                      else novo.add(d.modelo_id);
                      setDeclaracoes(novo);
                    }}
                  />
                </td>
                <td className="text-xs">
                  <FileSignature size={11} className="inline mr-1 text-texto-suave" />
                  {d.titulo}
                  {!d.do_sistema && <span className="ml-2 text-[11px] text-voltagem">sua versão</span>}
                  {!d.exigido_no_edital && (
                    <span className="ml-2 text-[11px] text-texto-suave">de praxe, o edital não cita</span>
                  )}
                </td>
                <td className="w-10 text-right">
                  <button
                    className="text-texto-suave hover:text-texto"
                    title="ver o PDF preenchido"
                    onClick={async () => {
                      try {
                        const blob = await api.verDeclaracao(id, d.modelo_id);
                        if (vendo) URL.revokeObjectURL(vendo.url);
                        setVendo({ titulo: d.titulo, url: URL.createObjectURL(blob) });
                      } catch (e) {
                        setErro(e.message);
                      }
                    }}
                  >
                    <Eye size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {dados.declaracoes.some((d) => d.aviso) && (
          <p className="px-3 py-2 border-t border-borda text-[11px] text-atencao flex items-start gap-2">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            <span>{dados.declaracoes.find((d) => d.aviso).aviso}</span>
          </p>
        )}
      </section>

      {/* ------------------------------------- 3. específicos da licitação */}
      <section className="border border-borda rounded">
        <header className="px-3 py-2 border-b border-borda flex items-center gap-3">
          <h3 className="text-xs uppercase tracking-wide text-texto-suave">3. Específicos desta licitação</h3>
          <input
            ref={campoAnexo}
            type="file"
            className="ml-auto text-[11px] text-texto-suave w-56"
            onChange={(e) => anexar(e.target.files[0])}
          />
        </header>

        {dados.anexos.length ? (
          <table className="w-full text-sm tabela-densa">
            <tbody>
              {dados.anexos.map((a) => (
                <tr key={a.id}>
                  <td className="w-8">
                    <input
                      type="checkbox"
                      checked={anexosMarcados.has(a.id)}
                      onChange={() => {
                        const novo = new Set(anexosMarcados);
                        if (novo.has(a.id)) novo.delete(a.id);
                        else novo.add(a.id);
                        setAnexosMarcados(novo);
                      }}
                    />
                  </td>
                  <td className="text-xs">
                    <Paperclip size={11} className="inline mr-1 text-texto-suave" />
                    {a.titulo}
                  </td>
                  <td className="w-24 text-right font-mono text-xs text-texto-suave">
                    {a.tamanho_bytes ? `${Math.max(1, Math.round(a.tamanho_bytes / 1024))} KB` : '—'}
                  </td>
                  <td className="w-10 text-right">
                    <button
                      className="text-texto-suave hover:text-erro"
                      title="remover anexo"
                      onClick={async () => {
                        await api.removerAnexo(id, a.id).catch((e) => setErro(e.message));
                        await carregar(dados.kit.id);
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-3 py-3 text-xs text-texto-suave">
            Proposta comercial, planilha de preços, atestado específico — o que vale só para esta disputa.
          </p>
        )}
      </section>

      {/* ------------------------------------------------------- saída */}
      <div className="flex items-center gap-4 flex-wrap border-t border-borda pt-3">
        <label className="flex items-center gap-1 text-xs text-texto-suave">
          <input type="radio" checked={formato === 'pdf'} onChange={() => setFormato('pdf')} />
          PDF único com capa e índice
        </label>
        <label className="flex items-center gap-1 text-xs text-texto-suave">
          <input type="radio" checked={formato === 'zip'} onChange={() => setFormato('zip')} />
          ZIP numerado
        </label>

        <span className="text-xs text-texto-suave">
          {escolhidos} peça(s)
          {dados.faltando.length > 0 && <span className="text-erro"> · {dados.faltando.length} pendência(s)</span>}
        </span>

        <button className="botao-primario ml-auto flex items-center gap-1" onClick={gerar} disabled={gerando || !escolhidos}>
          {gerando ? <Loader2 size={12} className="animate-spin" /> : <PackageCheck size={12} />} Gerar envio
        </button>
      </div>

      {dados.faltando.length > 0 && (
        <div className="border border-erro/40 bg-erro/5 rounded px-3 py-2 text-[11px] space-y-0.5">
          {dados.faltando.map((f) => (
            <p key={f.codigo} className="text-erro">
              {f.rotulo}: {f.motivo}
            </p>
          ))}
          <p className="text-texto-suave pt-1">
            O envio é gerado assim mesmo — às vezes você resolve a pendência na hora.
          </p>
        </div>
      )}

      {resultado && (
        <div className="border border-ok/40 bg-ok/5 rounded px-3 py-2 text-xs flex items-center gap-3">
          <span className="text-ok">
            {resultado.nome_arquivo} · {resultado.pecas} peças
            {resultado.folhas ? ` · ${resultado.folhas} folhas` : ''}
          </span>
          <button
            className="botao ml-auto flex items-center gap-1"
            onClick={() => api.baixarPacote(id, resultado.id, resultado.nome_arquivo).catch((e) => setErro(e.message))}
          >
            <Download size={12} /> baixar
          </button>
        </div>
      )}

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

      {dados.pacotes.length > 0 && (
        <section className="border border-borda rounded">
          <header className="px-3 py-2 border-b border-borda text-xs uppercase tracking-wide text-texto-suave">
            Envios desta licitação
          </header>
          <table className="w-full text-sm tabela-densa">
            <tbody>
              {dados.pacotes.map((p) => (
                <tr key={p.id}>
                  <td className="text-xs">{p.nome_arquivo}</td>
                  <td className="w-24 text-xs text-texto-suave">
                    {p.formato === 'pdf' ? `${p.folhas || '?'} folhas` : 'zip'}
                  </td>
                  <td className="w-36 text-xs font-mono text-texto-suave">{dataHora(p.gerado_em)}</td>
                  <td className="w-24 text-right">
                    <button
                      className="text-texto-suave hover:text-texto mr-2"
                      title="repetir este envio com as versões atuais do cofre"
                      onClick={() => repetir(p.id)}
                    >
                      <RotateCcw size={13} />
                    </button>
                    <button
                      className="text-texto-suave hover:text-texto"
                      title="baixar"
                      onClick={() => api.baixarPacote(id, p.id, p.nome_arquivo).catch((e) => setErro(e.message))}
                    >
                      <Download size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
