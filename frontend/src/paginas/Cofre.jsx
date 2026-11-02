import { useEffect, useRef, useState } from 'react';
import { Loader2, Upload, Eye, Download, Trash2, History, X } from 'lucide-react';
import { api } from '../servicos/api';
import { data as formatarData } from '../servicos/formato';

/**
 * Cofre de documentos da empresa (seções 9.1 e 17.2).
 *
 * Semáforo de validade, arrastar e soltar para subir, e histórico: subir de
 * novo o mesmo código não apaga nada — vira versão nova, e a anterior fica
 * guardada para provar o que foi enviado em cada disputa.
 */
export default function Cofre() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [historico, setHistorico] = useState(false);
  const [novo, setNovo] = useState({ codigo: '', titulo: '', emitido_em: '', valido_ate: '' });
  const [arquivo, setArquivo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [vendo, setVendo] = useState(null);
  const [arrastando, setArrastando] = useState(false);
  const campoArquivo = useRef(null);

  const carregar = () =>
    api
      .cofre(historico)
      .then((r) => {
        setDados(r);
        setErro(null);
      })
      .catch((e) => setErro(e.message));

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historico]);

  useEffect(() => () => vendo && URL.revokeObjectURL(vendo.url), [vendo]);

  const escolherCodigo = (codigo) => {
    const item = (dados.codigos || []).find((c) => c.codigo === codigo);
    setNovo((atual) => ({ ...atual, codigo, titulo: atual.titulo || (item ? item.rotulo : '') }));
  };

  const guardar = async () => {
    if (!novo.codigo) return setErro('Escolha o tipo de documento.');
    if (!arquivo) return setErro('Escolha o arquivo.');
    setEnviando(true);
    setErro(null);
    try {
      const r = await api.guardarDocumento(novo, arquivo);
      setAviso(r.mensagem);
      setNovo({ codigo: '', titulo: '', emitido_em: '', valido_ate: '' });
      setArquivo(null);
      if (campoArquivo.current) campoArquivo.current.value = '';
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

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

  const ver = async (documento) => {
    try {
      const blob = await api.verDocumento(documento.id);
      if (vendo) URL.revokeObjectURL(vendo.url);
      setVendo({ documento, url: URL.createObjectURL(blob) });
    } catch (e) {
      setErro(e.message);
    }
  };

  if (erro && !dados) return <p className="m-4 text-sm text-erro">{erro}</p>;
  if (!dados) return <Loader2 size={16} className="animate-spin text-texto-suave m-4" />;

  const soltar = (evento) => {
    evento.preventDefault();
    setArrastando(false);
    const caiu = evento.dataTransfer.files && evento.dataTransfer.files[0];
    if (caiu) setArquivo(caiu);
  };

  return (
    <div className="h-full overflow-auto">
      <div className="px-4 py-3 border-b border-borda flex items-center gap-4">
        <h1 className="font-titulo text-xl">Documentos da empresa</h1>
        <p className="text-xs text-texto-suave">
          {dados.resumo.total} no cofre
          {dados.resumo.vencendo > 0 && <span className="text-atencao"> · {dados.resumo.vencendo} vencendo</span>}
          {dados.resumo.vencidos > 0 && <span className="text-erro"> · {dados.resumo.vencidos} vencidos</span>}
        </p>
        <button className="botao ml-auto flex items-center gap-1" onClick={() => setHistorico(!historico)}>
          <History size={12} /> {historico ? 'só os atuais' : 'ver versões antigas'}
        </button>
      </div>

      {erro && <p className="mx-4 mt-3 px-3 py-2 text-xs border border-erro/40 text-erro rounded bg-erro/5">{erro}</p>}
      {aviso && (
        <p className="mx-4 mt-3 px-3 py-2 text-xs border border-borda bg-superficie rounded text-texto-suave">{aviso}</p>
      )}

      {/* ------------------------------------------------- novo documento */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={soltar}
        className={`mx-4 mt-3 border rounded bg-superficie p-3 grid gap-2 md:grid-cols-[180px_1fr_120px_120px_auto_auto] items-center transition-colors ${
          arrastando ? 'border-voltagem' : 'border-borda'
        }`}
      >
        <select className="campo-caixa" value={novo.codigo} onChange={(e) => escolherCodigo(e.target.value)}>
          <option value="">tipo de documento…</option>
          {(dados.codigos || []).map((c) => (
            <option key={c.codigo} value={c.codigo}>
              {c.rotulo}
            </option>
          ))}
        </select>
        <input
          className="campo-caixa"
          placeholder="título como aparece no envio"
          value={novo.titulo}
          onChange={(e) => setNovo({ ...novo, titulo: e.target.value })}
        />
        <input
          className="campo-caixa"
          type="date"
          title="emitido em"
          value={novo.emitido_em}
          onChange={(e) => setNovo({ ...novo, emitido_em: e.target.value })}
        />
        <input
          className="campo-caixa"
          type="date"
          title="válido até (em branco = calculado pela validade padrão)"
          value={novo.valido_ate}
          onChange={(e) => setNovo({ ...novo, valido_ate: e.target.value })}
        />
        <input
          ref={campoArquivo}
          type="file"
          className="text-[11px] text-texto-suave w-40"
          onChange={(e) => setArquivo(e.target.files[0] || null)}
        />
        <button className="botao-primario flex items-center gap-1" onClick={guardar} disabled={enviando}>
          {enviando ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Guardar
        </button>
        <p className="md:col-span-6 text-[11px] text-texto-suave">
          Arraste o arquivo para cá. Deixe a validade em branco e o painel calcula pela regra do documento
          (federal 180 dias, estadual e municipal 90, FGTS 30, CNDT 180). Subir o mesmo tipo de novo cria
          uma versão nova — a anterior continua no histórico.
        </p>
      </div>

      <table className="w-full text-sm tabela-densa mt-3">
        <thead>
          <tr>
            <th className="w-6"></th>
            <th>Documento</th>
            <th className="w-28">Emitido</th>
            <th className="w-28">Válido até</th>
            <th className="w-44">Situação</th>
            <th className="w-16 text-right">Versão</th>
            <th className="w-24"></th>
          </tr>
        </thead>
        <tbody>
          {dados.dados.map((d) => (
            <tr key={d.id} className={d.ativo ? '' : 'opacity-50'}>
              <td>
                <span
                  title={d.semaforo.texto}
                  className={`block w-2 h-2 rounded-full ${
                    d.semaforo.cor === 'verde' ? 'bg-ok' : d.semaforo.cor === 'amarelo' ? 'bg-atencao' : 'bg-erro'
                  }`}
                />
              </td>
              <td>
                <input
                  className="campo text-xs"
                  defaultValue={d.titulo}
                  onBlur={(e) =>
                    e.target.value !== d.titulo && executar(() => api.salvarDocumento(d.id, { titulo: e.target.value }))
                  }
                />
                <p className="px-2 text-[11px] text-texto-suave">
                  {d.codigo}
                  {d.nome_arquivo && <span className="ml-2">{d.nome_arquivo}</span>}
                  {!d.ativo && <span className="ml-2 text-atencao">versão antiga</span>}
                </p>
              </td>
              <td>
                <input
                  className="campo text-xs font-mono"
                  type="date"
                  defaultValue={d.emitido_em ? String(d.emitido_em).slice(0, 10) : ''}
                  onBlur={(e) => executar(() => api.salvarDocumento(d.id, { emitido_em: e.target.value }))}
                />
              </td>
              <td>
                <input
                  className="campo text-xs font-mono"
                  type="date"
                  defaultValue={d.valido_ate ? String(d.valido_ate).slice(0, 10) : ''}
                  onBlur={(e) => executar(() => api.salvarDocumento(d.id, { valido_ate: e.target.value }))}
                />
              </td>
              <td className="text-xs">
                <span
                  className={
                    d.semaforo.cor === 'verde' ? 'text-texto-suave' : d.semaforo.cor === 'amarelo' ? 'text-atencao' : 'text-erro'
                  }
                >
                  {d.semaforo.texto}
                </span>
                {d.renovavel_em && <p className="text-[11px] text-texto-suave truncate">{d.renovavel_em}</p>}
              </td>
              <td className="text-right font-mono text-xs text-texto-suave">v{d.versao}</td>
              <td>
                <div className="flex items-center justify-end gap-2">
                  <button className="text-texto-suave hover:text-texto" title="ver" onClick={() => ver(d)}>
                    <Eye size={13} />
                  </button>
                  <button
                    className="text-texto-suave hover:text-texto"
                    title="baixar"
                    onClick={() => api.baixarDocumento(d.id, d.nome_arquivo).catch((e) => setErro(e.message))}
                  >
                    <Download size={13} />
                  </button>
                  {d.ativo && (
                    <button
                      className="text-texto-suave hover:text-erro"
                      title="tirar do cofre (continua no histórico)"
                      onClick={() => executar(() => api.removerDocumento(d.id))}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {!dados.dados.length && (
        <p className="m-4 text-sm text-texto-suave">
          O cofre está vazio. Comece pelo contrato social e pelas certidões — são eles que entram em
          praticamente todo envio.
        </p>
      )}

      {vendo && (
        <div className="fixed inset-0 bg-obsidiana/80 flex items-start justify-center p-6 z-20">
          <div className="bg-superficie border border-borda rounded w-full max-w-4xl">
            <div className="px-4 py-2 border-b border-borda flex items-center gap-2 text-xs">
              <span className="truncate">{vendo.documento.titulo}</span>
              <button
                className="ml-auto text-texto-suave hover:text-texto"
                onClick={() => {
                  URL.revokeObjectURL(vendo.url);
                  setVendo(null);
                }}
              >
                <X size={14} />
              </button>
            </div>
            <iframe title={vendo.documento.titulo} src={vendo.url} className="w-full h-[70vh] bg-white" />
          </div>
        </div>
      )}

      <p className="px-4 py-3 text-[11px] text-texto-suave">
        Validades conferidas todo dia pelo worker: alerta em 30, 15 e 3 dias antes do vencimento.
        Último cadastro em {dados.dados[0] ? formatarData(dados.dados[0].criado_em) : '—'}.
      </p>
    </div>
  );
}
