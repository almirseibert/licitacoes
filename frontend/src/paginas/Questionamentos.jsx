import { useEffect, useState } from 'react';
import { Loader2, FileQuestion, Clock, Check, Copy, AlertTriangle } from 'lucide-react';
import { api } from '../servicos/api';
import { dataHora, data as formatarData } from '../servicos/formato';

/**
 * Aba "Questionar" da licitação (seção 25).
 *
 * Não é lembrete de prazo. Pedido de esclarecimento é ferramenta: destrava
 * exigência desproporcional, confirma por escrito que um documento seu serve,
 * e corrige especificação impossível antes que o item fracasse. Por isso a
 * tela começa pelo prazo, mas termina no texto pronto para enviar.
 *
 * A conta do prazo fica aberta — os dias úteis contados e o que foi pulado,
 * com o motivo. Prazo é coisa que se confere, não que se acredita.
 */
export default function Questionamentos({ id, inicial = null, aoUsarInicial }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(null);
  const [rascunho, setRascunho] = useState(null);

  const carregar = () =>
    api
      .questionamentos(id)
      .then((r) => {
        setDados(r);
        setErro(null);
      })
      .catch((e) => setErro(e.message));

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Seção 11: vindo de um "possível questionamento" do Resumo do Edital, o
  // rascunho já abre com o trecho citado no lugar da primeira lacuna.
  useEffect(() => {
    if (!inicial) return;
    montar(inicial.codigo, inicial.questionamento, inicial.ponto);
    if (aoUsarInicial) aoUsarInicial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicial]);

  const montar = async (codigo, questionamento, ponto) => {
    setOcupado(codigo);
    setErro(null);
    try {
      setRascunho(await api.montarQuestionamento(id, codigo, questionamento, ponto));
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(null);
    }
  };

  const registrar = async () => {
    setOcupado('registrar');
    try {
      await api.criarQuestionamento(id, {
        tipo: rascunho.tipo,
        assunto: rascunho.titulo,
        texto: rascunho.texto,
      });
      setAviso('Registrado. Ao enviar pelo portal, anote o protocolo e cole a resposta aqui — ela vale como parte do edital.');
      setRascunho(null);
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(null);
    }
  };

  if (erro && !dados) return <p className="text-sm text-erro">{erro}</p>;
  if (!dados) return <Loader2 size={16} className="animate-spin text-texto-suave" />;

  const p = dados.prazo;

  return (
    <div className="space-y-5">
      <section className="border border-borda rounded p-3 bg-superficie/40">
        {!p ? (
          <p className="text-sm text-texto-suave flex items-start gap-2">
            <Clock size={14} className="shrink-0 mt-0.5" />
            {dados.motivo || 'Sem data de abertura das propostas no portal, não há como contar os 3 dias úteis.'}
          </p>
        ) : (
          <>
            <div className="flex items-baseline gap-2 flex-wrap">
              <Clock size={14} className={p.vencido ? 'text-erro' : p.urgente ? 'text-atencao' : 'text-voltagem'} />
              <span className="text-sm">
                {p.vencido ? (
                  <span className="text-erro">
                    Prazo de esclarecimento e impugnação vencido em {dataHora(p.limite)}.
                  </span>
                ) : (
                  <>
                    Até <span className="font-mono">{dataHora(p.limite)}</span> para pedir esclarecimento ou
                    impugnar
                    {p.urgente && <span className="text-atencao"> — último dia</span>}
                  </>
                )}
              </span>
              {!p.vencido && (
                <span className="font-mono text-xs text-texto-suave ml-auto">
                  faltam {Math.max(0, Math.round(p.horas_restantes))} h
                </span>
              )}
            </div>

            {p.vencido && (
              <p className="mt-1.5 text-xs text-texto-suave">
                Depois deste prazo, exigência restritiva já não se discute — só resta decidir se disputa assim.
              </p>
            )}

            {/* A conta aberta: é isso que permite conferir contra o edital. */}
            <p className="mt-2 text-[11px] text-texto-suave">
              {p.dias_uteis} dias úteis antes da abertura, contados de trás para frente:{' '}
              <span className="font-mono">{p.uteis_contados.join(', ')}</span>
              {p.pulados.length > 0 && (
                <span>
                  {' '}
                  · pulou {p.pulados.map((x) => `${x.data} (${x.motivo})`).join(', ')}
                </span>
              )}
              . Hora limite suposta: {p.hora_limite}h — confira no edital, a lei não fixa.
            </p>
            <p className="text-[11px] text-texto-suave">{p.base_legal}</p>
          </>
        )}
      </section>

      {erro && <p className="text-xs text-erro">{erro}</p>}
      {aviso && (
        <p className="px-3 py-2 text-xs border border-borda bg-superficie rounded text-texto-suave">{aviso}</p>
      )}

      <section>
        <h3 className="font-titulo text-sm mb-2">Modelos</h3>
        <div className="flex gap-2 flex-wrap">
          {dados.modelos.map((m) => (
            <button
              key={m.codigo}
              className="botao flex items-center gap-1"
              onClick={() => montar(m.codigo)}
              disabled={Boolean(ocupado)}
            >
              {ocupado === m.codigo ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <FileQuestion size={11} />
              )}
              {m.titulo}
            </button>
          ))}
        </div>
      </section>

      {rascunho && (
        <section className="border border-borda rounded">
          <header className="px-3 py-2 border-b border-borda flex items-center gap-2">
            <h3 className="font-titulo text-sm">{rascunho.titulo}</h3>
            {rascunho.faltando.length > 0 && (
              <span className="text-[11px] text-atencao flex items-center gap-1">
                <AlertTriangle size={11} />
                falta no perfil: {rascunho.faltando.join(', ')}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button
                className="botao flex items-center gap-1"
                onClick={() => {
                  navigator.clipboard.writeText(rascunho.texto);
                  setAviso('Texto copiado.');
                }}
              >
                <Copy size={11} /> copiar
              </button>
              <button className="botao-primario flex items-center gap-1" onClick={registrar} disabled={Boolean(ocupado)}>
                {ocupado === 'registrar' ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                registrar
              </button>
            </div>
          </header>
          <textarea
            className="campo-caixa w-full font-mono text-xs leading-relaxed p-3 border-0 rounded-none"
            rows={18}
            value={rascunho.texto}
            onChange={(e) => setRascunho({ ...rascunho, texto: e.target.value })}
          />
          <p className="px-3 py-2 text-[11px] text-texto-suave border-t border-borda">
            As lacunas <span className="font-mono">____________</span> são suas: o painel não inventa o que o
            edital diz. Preencha o item, o que ele exige e por que a exigência não cabe.
            {rascunho.origem && (
              <span className="block mt-1 text-atencao">
                Trecho e ponto vieram do Resumo do Edital (IA): confira no edital antes de enviar. Ponto: {rascunho.origem.ponto}.
                {rascunho.origem.lei && <> Fundamento sugerido pela IA, a conferir: {rascunho.origem.lei}.</>}
              </span>
            )}
          </p>
        </section>
      )}

      <section>
        <h3 className="font-titulo text-sm mb-2">Enviados</h3>
        {dados.enviados.length === 0 ? (
          <p className="text-sm text-texto-suave">
            Nenhum ainda. A resposta do órgão vale como parte do edital — guarde-a aqui quando chegar.
          </p>
        ) : (
          <ul className="space-y-2">
            {dados.enviados.map((q) => (
              <li key={q.id} className="border border-borda rounded p-2.5">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-sm">{q.assunto || q.tipo}</span>
                  <span className="text-[11px] text-texto-suave uppercase tracking-wide">{q.tipo}</span>
                  {q.resultado && (
                    <span
                      className={`text-[11px] ${
                        q.resultado === 'acolhido'
                          ? 'text-ok'
                          : q.resultado === 'negado'
                            ? 'text-erro'
                            : 'text-atencao'
                      }`}
                    >
                      {q.resultado}
                    </span>
                  )}
                  <span className="ml-auto font-mono text-[11px] text-texto-suave">
                    {q.enviado_em ? `enviado ${formatarData(q.enviado_em)}` : 'não enviado'}
                    {q.protocolo && ` · protocolo ${q.protocolo}`}
                  </span>
                </div>
                <Resposta questionamento={q} aoSalvar={carregar} aoErro={setErro} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** A resposta do órgão: é ela que vale como parte do edital. */
function Resposta({ questionamento: q, aoSalvar, aoErro }) {
  const [abrir, setAbrir] = useState(false);
  const [campos, setCampos] = useState({
    protocolo: q.protocolo || '',
    resposta: q.resposta || '',
    resultado: q.resultado || '',
  });
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    setSalvando(true);
    try {
      await api.salvarQuestionamento(q.licitacao_id, q.id, {
        ...campos,
        resultado: campos.resultado || null,
        enviado_em: q.enviado_em || new Date().toISOString().slice(0, 19).replace('T', ' '),
        respondido_em: campos.resposta ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null,
      });
      setAbrir(false);
      await aoSalvar();
    } catch (e) {
      aoErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  if (!abrir) {
    return (
      <div className="mt-1">
        {q.resposta && <p className="text-xs text-texto-suave whitespace-pre-wrap">{q.resposta}</p>}
        <button className="text-[11px] text-texto-suave hover:text-texto mt-1" onClick={() => setAbrir(true)}>
          {q.resposta ? 'editar resposta' : 'registrar envio e resposta'}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-2">
        <input
          className="campo-caixa flex-1"
          placeholder="protocolo no portal"
          value={campos.protocolo}
          onChange={(e) => setCampos({ ...campos, protocolo: e.target.value })}
        />
        <select
          className="campo-caixa"
          value={campos.resultado}
          onChange={(e) => setCampos({ ...campos, resultado: e.target.value })}
        >
          <option value="">resultado…</option>
          <option value="acolhido">acolhido</option>
          <option value="parcial">parcialmente acolhido</option>
          <option value="negado">negado</option>
          <option value="sem_resposta">sem resposta</option>
        </select>
      </div>
      <textarea
        className="campo-caixa w-full text-xs"
        rows={5}
        placeholder="cole aqui a resposta do órgão — ela vale como parte do edital"
        value={campos.resposta}
        onChange={(e) => setCampos({ ...campos, resposta: e.target.value })}
      />
      <div className="flex gap-2">
        <button className="botao-primario" onClick={salvar} disabled={salvando}>
          {salvando ? 'salvando…' : 'Salvar'}
        </button>
        <button className="botao" onClick={() => setAbrir(false)}>
          cancelar
        </button>
      </div>
    </div>
  );
}
