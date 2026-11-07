import { useEffect, useState } from 'react';
import { Loader2, Sparkles, AlertTriangle, Check, X, RefreshCcw } from 'lucide-react';
import { api } from '../servicos/api';
import { dataHora } from '../servicos/formato';

/**
 * Bloco de leitura assistida (seção 23), na aba Resumo da licitação.
 *
 * Tudo aqui é **sugestão** até você confirmar, e a tela diz isso o tempo todo —
 * não por modéstia, mas porque a detecção por expressão regular da seção 8
 * continua sendo a fonte principal, e misturar as duas faria você confiar na
 * mais frágil. A IA não muda pontuação, etapa, preço nem documento do cofre:
 * só este quadro.
 */

const GRAVIDADE = {
  alta: 'text-erro',
  media: 'text-atencao',
  baixa: 'text-texto-suave',
};

export default function LeituraIA({ id }) {
  const [estado, setEstado] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(null);

  const carregar = () =>
    api
      .leituraIa(id)
      .then((r) => {
        setEstado(r);
        setErro(null);
      })
      .catch((e) => setErro(e.message));

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const ler = async (forcar = false) => {
    setOcupado('ler');
    setAviso(null);
    setErro(null);
    try {
      const r = await api.lerComIa(id, forcar);
      setAviso(r.mensagem);
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(null);
    }
  };

  const decidir = async (situacao) => {
    setOcupado(situacao);
    try {
      await api.decidirLeituraIa(id, situacao);
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(null);
    }
  };

  if (!estado) return null;

  // Sem chave configurada o bloco não some nem pede nada: diz o que falta, uma
  // linha, e sai do caminho.
  if (!estado.disponivel && !estado.dados) {
    return (
      <p className="mt-4 text-xs text-texto-suave flex items-start gap-2">
        <Sparkles size={13} className="shrink-0 mt-0.5" />
        Leitura assistida desligada. Para ligar, configure <span className="font-mono">GEMINI_API_KEY</span> no
        servidor — o painel funciona inteiro sem ela.
      </p>
    );
  }

  const d = estado.dados;
  const confirmado = estado.situacao === 'confirmado';
  const recusado = estado.situacao === 'recusado';

  return (
    <section className="mt-5 border border-borda rounded bg-superficie/40">
      <header className="px-3 py-2 border-b border-borda flex items-center gap-2 flex-wrap">
        <h3 className="font-titulo text-sm flex items-center gap-1.5">
          <Sparkles size={13} className="text-voltagem" />
          Leitura assistida
        </h3>
        <span
          className={`text-[11px] px-1.5 py-0.5 rounded border ${
            confirmado
              ? 'border-ok/40 text-ok'
              : recusado
                ? 'border-erro/40 text-erro'
                : 'border-atencao/40 text-atencao'
          }`}
        >
          {confirmado ? 'confirmado por você' : recusado ? 'recusado' : 'sugerido pela IA'}
        </span>
        {estado.em && <span className="text-[11px] text-texto-suave">{dataHora(estado.em)}</span>}

        <div className="ml-auto flex items-center gap-2">
          {d && !confirmado && (
            <button
              className="botao flex items-center gap-1"
              onClick={() => decidir('confirmado')}
              disabled={Boolean(ocupado)}
            >
              <Check size={11} /> conferi, está certo
            </button>
          )}
          {d && !recusado && (
            <button
              className="botao flex items-center gap-1"
              onClick={() => decidir('recusado')}
              disabled={Boolean(ocupado)}
            >
              <X size={11} /> não confere
            </button>
          )}
          {estado.disponivel && (
            <button
              className={d ? 'botao flex items-center gap-1' : 'botao-primario flex items-center gap-1'}
              onClick={() => ler(Boolean(d))}
              disabled={Boolean(ocupado)}
            >
              {ocupado === 'ler' ? <Loader2 size={11} className="animate-spin" /> : <RefreshCcw size={11} />}
              {d ? 'ler de novo' : 'ler o edital'}
            </button>
          )}
        </div>
      </header>

      <div className="p-3 space-y-3">
        {erro && <p className="text-xs text-erro">{erro}</p>}
        {aviso && <p className="text-xs text-texto-suave">{aviso}</p>}

        {!d ? (
          <p className="text-xs text-texto-suave">
            Ainda não lido. A IA resume o edital, lista o que pedem e aponta armadilhas — custo e risco que
            não aparecem na planilha. O que ela achar é sugestão: a detecção de exigências da aba
            Exigências continua sendo a fonte principal.
          </p>
        ) : (
          <>
            <p className="text-sm">{d.resumo}</p>

            {d.prazo_execucao && (
              <p className="text-xs text-texto-suave">
                <span className="uppercase tracking-wide">Prazo</span> · {d.prazo_execucao}
              </p>
            )}

            {d.o_que_pedem && d.o_que_pedem.length > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-texto-suave mb-1">O que pedem</p>
                <ul className="space-y-0.5">
                  {d.o_que_pedem.map((item) => (
                    <li key={item} className="text-xs">· {item}</li>
                  ))}
                </ul>
              </div>
            )}

            {d.exigencias_criticas && d.exigencias_criticas.length > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-texto-suave mb-1">Exigências críticas</p>
                <ul className="space-y-1">
                  {d.exigencias_criticas.map((e) => (
                    <li key={e.codigo} className="text-xs">
                      <span className={GRAVIDADE[e.gravidade] || ''}>{e.rotulo || e.codigo}</span>
                      <span className="text-texto-suave"> — {e.texto}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {d.armadilhas && d.armadilhas.length > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-atencao mb-1">Armadilhas</p>
                <ul className="space-y-1">
                  {d.armadilhas.map((a) => (
                    <li key={a} className="text-xs text-atencao flex items-start gap-1.5">
                      <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {d.pode_participar && (
              <p className="text-xs">
                <span className="uppercase tracking-wide text-texto-suave">Parecer da IA</span> ·{' '}
                <span className="font-mono">{d.pode_participar.resposta}</span> — {d.pode_participar.porque}
              </p>
            )}

            <Procedencia meta={d._meta} confianca={d.confianca} />
          </>
        )}
      </div>
    </section>
  );
}

/**
 * De onde veio e o que foi jogado fora na validação.
 *
 * O descarte aparece porque é sinal: resposta com campo fora do schema é o que
 * se vê quando o modelo começa a responder torto — ou quando o edital tentou
 * mandar nele (seção 23.4).
 */
function Procedencia({ meta, confianca }) {
  if (!meta) return null;
  return (
    <p className="text-[11px] text-texto-suave pt-1 border-t border-borda/60">
      {meta.modelo}
      {confianca !== null && confianca !== undefined && (
        <span> · confiança do modelo {Number(confianca).toFixed(2)}</span>
      )}
      {meta.secoes && <span> · leu {meta.secoes.join(', ')}</span>}
      {meta.cortado && <span> · texto cortado no limite</span>}
      {meta.descartados && meta.descartados.length > 0 && (
        <span className="block text-atencao mt-0.5">
          {meta.descartados.length} campo(s) descartado(s) na validação: {meta.descartados.join('; ')}
        </span>
      )}
    </p>
  );
}
