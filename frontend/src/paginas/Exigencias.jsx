import { useEffect, useState } from 'react';
import { Loader2, AlertTriangle, BookOpenCheck, Check, Minus, Lock, X } from 'lucide-react';
import { api } from '../servicos/api';
import { dataHora } from '../servicos/formato';

/**
 * Checklist de exigências do edital (seção 8.4): o que o edital pede, o trecho
 * que gerou a decisão e o que a empresa tem.
 *
 * O trecho fica à vista e no title da linha — é o que permite conferir em
 * segundos em vez de reler o PDF. Discordou? Corrige na hora, e a leitura
 * automática não mexe mais naquela linha.
 */
export default function Exigencias({ id }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [mostrarTudo, setMostrarTudo] = useState(false);

  const carregar = () =>
    api
      .exigencias(id)
      .then((r) => {
        setDados(r);
        setErro(null);
      })
      .catch((e) => setErro(e.message));

  useEffect(() => {
    carregar();
    // A leitura roda no worker: enquanto estiver em andamento, a tela se atualiza sozinha.
    const relogio = setInterval(() => {
      setDados((atual) => {
        if (atual && (atual.status === 'na_fila' || atual.status === 'lendo')) carregar();
        return atual;
      });
    }, 5000);
    return () => clearInterval(relogio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const ler = async () => {
    setOcupado(true);
    setErro(null);
    try {
      const r = await api.lerEdital(id);
      setAviso(r.mensagem);
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(false);
    }
  };

  const corrigir = async (codigo, detectado) => {
    try {
      const r = await api.corrigirExigencia(id, codigo, detectado);
      setAviso(r.mensagem);
      await carregar();
    } catch (e) {
      setErro(e.message);
    }
  };

  if (erro && !dados) return <p className="text-sm text-erro">{erro}</p>;
  if (!dados) return <Loader2 size={16} className="animate-spin text-texto-suave" />;

  const visiveis = mostrarTudo ? dados.dados : dados.dados.filter((d) => d.detectado !== 'nao');
  const grupos = [...new Set(visiveis.map((d) => d.grupo))];
  const semDocumentacao = !['ok', 'parcial'].includes(dados.arquivos_status);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <button className="botao-primario flex items-center gap-1" onClick={ler} disabled={ocupado}>
          {ocupado ? <Loader2 size={12} className="animate-spin" /> : <BookOpenCheck size={12} />}
          {dados.status === 'ok' ? 'Ler o edital de novo' : 'Ler o edital'}
        </button>
        <button className="botao" onClick={() => setMostrarTudo(!mostrarTudo)}>
          {mostrarTudo ? 'só o que aparece no edital' : `ver as ${dados.dados.length} do catálogo`}
        </button>
        <span className="text-xs text-texto-suave">
          {dados.status === 'ok' && `${dados.exigidas} exigências · ${dados.dispensadas} dispensadas`}
          {dados.status === 'na_fila' && 'leitura na fila'}
          {dados.status === 'lendo' && 'lendo o edital…'}
          {dados.status === 'sem_texto' && 'o PDF não tem camada de texto'}
          {dados.status === 'nao_lido' && 'edital ainda não lido'}
          {dados.lido_em && <span className="ml-2">· {dataHora(dados.lido_em)}</span>}
        </span>
      </div>

      {aviso && (
        <p className="text-xs text-texto-suave border border-borda rounded px-3 py-2 bg-superficie">{aviso}</p>
      )}
      {erro && <p className="text-xs text-erro">{erro}</p>}

      {dados.status === 'sem_texto' && (
        <div className="flex items-start gap-2 text-xs border border-atencao/40 bg-atencao/5 rounded px-3 py-2">
          <AlertTriangle size={14} className="text-atencao shrink-0 mt-0.5" />
          <span className="text-texto-suave">
            Edital escaneado: o painel não consegue ler o texto e o checklist fica em branco. Abra o PDF
            na aba Arquivos e confira à mão — o que você marcar aqui fica salvo.
          </span>
        </div>
      )}

      {semDocumentacao && (
        <p className="text-sm text-texto-suave">
          Baixe a documentação primeiro, na aba Arquivos. A leitura trabalha só com o que já está no volume.
        </p>
      )}

      {grupos.map((grupo) => (
        <section key={grupo}>
          <h3 className="text-[11px] uppercase tracking-wide text-texto-suave mb-1">{grupo}</h3>
          <table className="w-full text-sm tabela-densa">
            <thead>
              <tr>
                <th>Exigência</th>
                <th className="w-36">O edital pede?</th>
                <th className="w-52">Você tem?</th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              {visiveis
                .filter((d) => d.grupo === grupo)
                .map((d) => (
                  <tr key={d.codigo} title={d.trecho || ''}>
                    <td className="text-xs">
                      {d.rotulo}
                      {d.confirmado_por_usuario && (
                        <span
                          className="ml-2 text-[10px] text-texto-suave inline-flex items-center gap-0.5"
                          title="você confirmou esta linha — a leitura automática não mexe nela"
                        >
                          <Lock size={9} /> confirmado
                        </span>
                      )}
                      {d.trecho && <p className="text-[11px] text-texto-suave mt-0.5">{resumir(d.trecho)}</p>}
                    </td>
                    <td className="text-xs">
                      <Pedido detectado={d.detectado} pagina={d.pagina} arquivo={d.arquivo} />
                    </td>
                    <td className="text-xs">
                      <Possui situacao={d.situacao} nota={d.nota} />
                    </td>
                    <td className="text-right">
                      <select
                        value={d.detectado}
                        onChange={(e) => corrigir(d.codigo, e.target.value)}
                        title="corrigir à mão"
                        className="bg-transparent border border-transparent hover:border-borda rounded text-[11px] text-texto-suave px-1 py-0.5"
                      >
                        <option value="sim">pede</option>
                        <option value="negado">dispensa</option>
                        <option value="nao">não cita</option>
                        <option value="indefinido">não sei</option>
                      </select>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ))}

      {dados.status === 'ok' && (
        <p className="text-sm border-t border-borda pt-3">
          Pronto para disputar:{' '}
          <strong className="font-mono">
            {dados.atendidas} de {dados.exigidas}
          </strong>{' '}
          exigências atendidas.{' '}
          <span className="text-texto-suave text-xs">
            O resto depende do cofre de documentos, que entra na Fase 5.
          </span>
        </p>
      )}
    </div>
  );
}

function resumir(trecho) {
  return trecho.length > 170 ? `${trecho.slice(0, 170)}…` : trecho;
}

function Pedido({ detectado, pagina, arquivo }) {
  if (detectado === 'sim') {
    return (
      <span className="text-texto">
        Sim
        {pagina && <span className="text-texto-suave font-mono ml-1">p.{pagina}</span>}
        {arquivo && <span className="block text-[11px] text-texto-suave truncate">{arquivo}</span>}
      </span>
    );
  }
  if (detectado === 'negado') return <span className="text-ok">Dispensado</span>;
  if (detectado === 'indefinido') return <span className="text-atencao">Não deu para ler</span>;
  return <span className="text-texto-suave">Não cita</span>;
}

function Possui({ situacao, nota }) {
  const estilos = {
    tem: ['text-ok', Check, 'atendido'],
    nao_tem: ['text-erro', X, 'não atendido'],
    depende: ['text-atencao', Minus, 'depende'],
  }[situacao];

  if (!estilos) return <span className="text-texto-suave text-[11px]">—</span>;

  const [cor, Icone, padrao] = estilos;
  return (
    <span className={`${cor} inline-flex items-start gap-1`}>
      <Icone size={12} className="mt-0.5 shrink-0" />
      <span className="text-[11px]">{nota || padrao}</span>
    </span>
  );
}
