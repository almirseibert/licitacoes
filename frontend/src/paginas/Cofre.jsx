import { useEffect, useRef, useState } from 'react';
import { Loader2, Upload, Eye, Download, Trash2, History, X, Mail, CheckCheck, ExternalLink, Archive } from 'lucide-react';
import { api } from '../servicos/api';
import { data as formatarData } from '../servicos/formato';
import Portais from './Portais';

/**
 * Cofre de documentos da empresa (seções 9.1 e 17.2).
 *
 * Semáforo de validade, arrastar e soltar para subir, e histórico: subir de
 * novo o mesmo código não apaga nada — vira versão nova, e a anterior fica
 * guardada para provar o que foi enviado em cada disputa.
 *
 * Seção 10: grupos e situação (com filtro), revisão de 90 dias do documento sem
 * validade, lote para baixar ou mandar por e-mail, e a agenda de portais.
 */
export default function Cofre() {
  // O aviso de portal no dashboard chega com #portais e abre direto a agenda.
  const [aba, setAba] = useState(() => (window.location.hash === '#portais' ? 'portais' : 'documentos'));
  return (
    <div className="h-full overflow-auto">
      <div className="px-4 pt-3 flex gap-1 border-b border-borda" role="tablist">
        {[
          ['documentos', 'Documentos'],
          ['portais', 'Agenda de portais'],
        ].map(([chave, rotulo]) => (
          <button
            key={chave}
            role="tab"
            aria-selected={aba === chave}
            className={`px-3 py-1.5 text-sm border-b-2 -mb-px ${
              aba === chave ? 'border-voltagem text-texto' : 'border-transparent text-texto-suave hover:text-texto'
            }`}
            onClick={() => setAba(chave)}
          >
            {rotulo}
          </button>
        ))}
      </div>
      {aba === 'documentos' ? <Documentos /> : <Portais />}
    </div>
  );
}

const SITUACOES = [
  ['disponivel', 'Disponível'],
  ['vencendo', 'Vencendo/revisar'],
  ['pendente', 'Pendente'],
];

function Documentos() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [historico, setHistorico] = useState(false);
  const [grupo, setGrupo] = useState('');
  const [situacao, setSituacao] = useState('');
  const [marcados, setMarcados] = useState(() => new Set());
  const [envio, setEnvio] = useState(null); // { para, mensagem } quando o formulário está aberto
  const [ocupado, setOcupado] = useState(false);
  const [novo, setNovo] = useState({ codigo: '', titulo: '', emitido_em: '', valido_ate: '' });
  const [arquivo, setArquivo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [vendo, setVendo] = useState(null);
  const [arrastando, setArrastando] = useState(false);
  const campoArquivo = useRef(null);

  const carregar = () =>
    api
      .cofre({ historico: historico ? '1' : '', grupo, situacao })
      .then((r) => {
        setDados(r);
        setErro(null);
      })
      .catch((e) => setErro(e.message));

  useEffect(() => {
    // Trocar o filtro limpa a marcação: o lote nunca leva o que saiu da tela.
    setMarcados(new Set());
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historico, grupo, situacao]);

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

  const alternar = (id) =>
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  const baixarLote = async () => {
    setOcupado(true);
    try {
      await api.baixarLote([...marcados]);
      setErro(null);
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(false);
    }
  };

  const enviarLote = async () => {
    setOcupado(true);
    try {
      const r = await api.enviarLote({ ids: [...marcados], para: envio.para, mensagem: envio.mensagem });
      setAviso(r.mensagem);
      setErro(null);
      setEnvio(null);
      setMarcados(new Set());
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(false);
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

  const comArquivo = dados.dados.filter((d) => d.tem_arquivo);
  const todosMarcados = comArquivo.length > 0 && comArquivo.every((d) => marcados.has(d.id));
  const r = dados.resumo;

  return (
    <div>
      <div className="px-4 py-3 border-b border-borda flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="font-titulo text-xl">Documentos da empresa</h1>
        <p className="text-xs text-texto-suave">
          {dados.resumo.total} no cofre
          {dados.resumo.vencendo > 0 && <span className="text-atencao"> · {dados.resumo.vencendo} vencendo</span>}
          {dados.resumo.vencidos > 0 && <span className="text-erro"> · {dados.resumo.vencidos} vencidos</span>}
          {r.revisar > 0 && <span className="text-atencao"> · {r.revisar} para revisar</span>}
        </p>
        <button className="botao ml-auto flex items-center gap-1" onClick={() => setHistorico(!historico)}>
          <History size={12} /> {historico ? 'só os atuais' : 'ver versões antigas'}
        </button>
      </div>

      {erro && <p className="mx-4 mt-3 px-3 py-2 text-xs border border-erro/40 text-erro rounded bg-erro/5">{erro}</p>}
      {aviso && (
        <p className="mx-4 mt-3 px-3 py-2 text-xs border border-borda bg-superficie rounded text-texto-suave">{aviso}</p>
      )}

      {/* ------------------------------------------- filtros e lote (Seção 10) */}
      <div className="mx-4 mt-3 flex flex-wrap items-center gap-2 text-xs">
        <select className="campo-caixa" value={grupo} onChange={(e) => setGrupo(e.target.value)} aria-label="grupo">
          <option value="">todos os grupos</option>
          {dados.grupos.map((g) => (
            <option key={g.chave} value={g.chave}>
              {g.rotulo} ({r.por_grupo[g.chave] || 0})
            </option>
          ))}
        </select>
        <div className="flex gap-1" role="group" aria-label="situação">
          {[['', 'Todas'], ...SITUACOES].map(([chave, rotulo]) => (
            <button
              key={chave || 'todas'}
              className={situacao === chave ? 'botao-primario' : 'botao'}
              onClick={() => setSituacao(chave)}
            >
              {rotulo}
              {chave && ` ${r.por_situacao[chave] || 0}`}
            </button>
          ))}
        </div>
        <span className="ml-auto text-texto-suave">{marcados.size} marcado(s)</span>
        <button className="botao flex items-center gap-1" disabled={!marcados.size || ocupado} onClick={baixarLote}>
          <Archive size={12} /> baixar ZIP
        </button>
        <button
          className="botao flex items-center gap-1"
          disabled={!marcados.size || ocupado}
          onClick={() => setEnvio(envio ? null : { para: '', mensagem: '' })}
        >
          <Mail size={12} /> enviar por e-mail
        </button>
      </div>
      {envio && (
        <div className="mx-4 mt-2 border border-borda rounded bg-superficie p-3 grid gap-2 md:grid-cols-[1fr_2fr_auto] items-start text-xs">
          <input
            className="campo-caixa"
            placeholder="para (até 5, separados por vírgula)"
            value={envio.para}
            onChange={(e) => setEnvio({ ...envio, para: e.target.value })}
          />
          <textarea
            className="campo-caixa"
            rows={2}
            placeholder="mensagem (opcional)"
            value={envio.mensagem}
            onChange={(e) => setEnvio({ ...envio, mensagem: e.target.value })}
          />
          <button className="botao-primario flex items-center gap-1" disabled={ocupado || !envio.para} onClick={enviarLote}>
            {ocupado ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />} Enviar {marcados.size}
          </button>
          <p className="md:col-span-3 text-[11px] text-texto-suave">
            Sai pelo e-mail do painel, com resposta para o seu. Até 15 MB de anexos.
          </p>
        </div>
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
            <th className="w-6">
              <input
                type="checkbox"
                aria-label="marcar todos"
                checked={todosMarcados}
                onChange={() => setMarcados(todosMarcados ? new Set() : new Set(comArquivo.map((d) => d.id)))}
              />
            </th>
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
                <input
                  type="checkbox"
                  aria-label={`marcar ${d.titulo}`}
                  disabled={!d.tem_arquivo}
                  checked={marcados.has(d.id)}
                  onChange={() => alternar(d.id)}
                />
              </td>
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
                  {(dados.grupos.find((g) => g.chave === d.grupo) || {}).rotulo}
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
                    d.situacao === 'disponivel' ? 'text-texto-suave' : d.situacao === 'vencendo' ? 'text-atencao' : 'text-erro'
                  }
                >
                  {d.motivo}
                </span>
                <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px]">
                  {d.ativo && d.revisao && d.revisao.devida ? (
                    <button
                      className="text-voltagem hover:underline flex items-center gap-1"
                      title="conferi: continua valendo"
                      onClick={() => executar(() => api.revisarDocumento(d.id))}
                    >
                      <CheckCheck size={11} /> conferi
                    </button>
                  ) : null}
                  {d.emitir_em ? (
                    <a
                      className="text-voltagem hover:underline flex items-center gap-1"
                      href={d.emitir_em}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="abre a página oficial de emissão"
                    >
                      <ExternalLink size={11} /> emitir
                    </a>
                  ) : (
                    d.renovavel_em && <span className="text-texto-suave truncate">{d.renovavel_em}</span>
                  )}
                </div>
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

      {!dados.dados.length && r.total > 0 && (
        <p className="m-4 text-sm text-texto-suave">Nenhum documento neste filtro.</p>
      )}
      {!dados.dados.length && !r.total && (
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
        Validades conferidas todo dia pelo worker: alerta em 30, 15 e 3 dias antes do vencimento. Documento
        sem validade formal volta para revisão a cada 90 dias. O painel não emite certidão (a emissão pede
        CAPTCHA ou gov.br): o botão “emitir” abre a página oficial.
        Último cadastro em {dados.dados[0] ? formatarData(dados.dados[0].criado_em) : '—'}.
      </p>
    </div>
  );
}
