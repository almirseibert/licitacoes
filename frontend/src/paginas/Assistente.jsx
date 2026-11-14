import { useState } from 'react';
import { Check, Circle, Loader2 } from 'lucide-react';
import { api } from '../servicos/api';
import { data as formatarData, moeda } from '../servicos/formato';

const EMAIL_SEM_ENVIO = {
  sem_email: 'O servidor ainda não tem e-mail configurado, então nada foi enviado — a lista abaixo é o que o boletim traria.',
  sem_destinatario: 'Todos da equipe se descadastraram deste boletim.',
  sem_itens: 'Nenhuma licitação casou desta vez.',
  erro: 'O envio do e-mail falhou. A lista abaixo é o que o boletim trazia.',
};

/**
 * Assistente de primeiro acesso (Seção 17): empresa → palavras e região → primeiro
 * boletim. Tudo o que grava pode ser mudado depois nas telas de sempre. Dado que
 * a pessoa não sabe fica em branco — o painel não preenche por ela.
 */
export default function Assistente({ estado, aoConcluir, aoIr }) {
  if (!estado) return <div className="p-6 text-sm text-texto-suave"><span className="flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> carregando…</span></div>;
  return <Passos estado={estado} aoConcluir={aoConcluir} aoIr={aoIr} />;
}

function Passos({ estado, aoConcluir, aoIr }) {
  const [erro, setErro] = useState(null);
  const [passo, setPasso] = useState(1);
  const [ocupado, setOcupado] = useState(false);
  // Quem volta ao assistente vê o que já está salvo.
  const [campos, setCampos] = useState({
    razao_social: estado.empresa.razao_social || '',
    cnpj: estado.empresa.cnpj || '',
    cnaes: (estado.empresa.cnaes || []).map((x) => x.codigo).join('\n'),
    palavras: '',
    exclusoes: '',
    ufs: [],
  });
  const [descartadas, setDescartadas] = useState([]);
  const [boletim, setBoletim] = useState(null);

  const mudar = (chave) => (e) => setCampos({ ...campos, [chave]: e.target.value });
  const alternarUf = (uf) =>
    setCampos({ ...campos, ufs: campos.ufs.includes(uf) ? campos.ufs.filter((u) => u !== uf) : [...campos.ufs, uf] });

  const salvar = async () => {
    setOcupado(true);
    setErro(null);
    try {
      const r = await api.concluirAssistente({
        empresa: {
          razao_social: campos.razao_social,
          cnpj: campos.cnpj,
          cnaes: campos.cnaes.split(/[\n;,]+/).map((c) => c.trim()).filter(Boolean),
        },
        palavras: campos.palavras,
        exclusoes: campos.exclusoes,
        ufs: campos.ufs,
      });
      setDescartadas(r.descartadas || []);
      setPasso(3);
      aoConcluir();
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(false);
    }
  };

  const gerar = async () => {
    setOcupado(true);
    setErro(null);
    try {
      setBoletim(await api.primeiroBoletim());
      aoConcluir();
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(false);
    }
  };

  if (!['dono', 'admin'].includes(estado.papel)) {
    return (
      <div className="p-6 text-sm">
        <h1 className="font-titulo text-xl mb-2">Primeiros passos</h1>
        <p className="text-texto-suave">Quem configura a empresa é o dono ou um administrador da organização. Peça a eles para concluir o assistente.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <header className="mb-5">
        <h1 className="font-titulo text-xl">Primeiros passos</h1>
        <p className="text-xs text-texto-suave">
          Três passos e o primeiro boletim sai agora. Tudo pode ser ajustado depois em Palavras-chave, Boletins e Configurações.
        </p>
      </header>

      <ol className="flex flex-wrap gap-x-5 gap-y-1 mb-6 text-xs" aria-label="Passos do assistente">
        {estado.passos.map((p) => (
          <li key={p.chave} className={`flex items-center gap-1.5 ${p.feito ? 'text-ok' : 'text-texto-suave'}`}>
            {p.feito ? <Check size={12} /> : <Circle size={10} />}
            {p.rotulo}
          </li>
        ))}
      </ol>

      <div className="max-w-xl">
        {passo === 1 && (
          <section aria-label="Passo 1: a empresa">
            <h2 className="font-titulo text-base mb-3">1. A empresa</h2>
            <Campo rotulo="Razão social" valor={campos.razao_social} aoMudar={mudar('razao_social')} />
            <Campo rotulo="CNPJ" valor={campos.cnpj} aoMudar={mudar('cnpj')} placeholder="00.000.000/0000-00" ajuda="Opcional agora. Os documentos e declarações usam depois." />
            <label className="block mb-4">
              <span className="block text-[11px] uppercase tracking-wide text-texto-suave mb-1">CNAEs (um por linha)</span>
              <textarea className="campo-caixa w-full h-20" value={campos.cnaes} onChange={mudar('cnaes')} placeholder={'4751-2/01\n4789-0/99'} />
              <span className="block text-[11px] text-texto-suave mt-1">Opcional. Com 7 dígitos; o painel usa para checar o objeto social.</span>
            </label>
            <button className="botao-primario" onClick={() => setPasso(2)}>Continuar</button>
          </section>
        )}

        {passo === 2 && (
          <section aria-label="Passo 2: o que vocês vendem">
            <h2 className="font-titulo text-base mb-3">2. O que a empresa vende, e onde</h2>
            <label className="block mb-4">
              <span className="block text-[11px] uppercase tracking-wide text-texto-suave mb-1">Palavras-chave (uma por linha) *</span>
              <textarea className="campo-caixa w-full h-28" value={campos.palavras} onChange={mudar('palavras')} placeholder={'toner para impressora\nmaterial de escritório'} />
              <span className="block text-[11px] text-texto-suave mt-1">Quanto mais específica, menos ruído. Dá para começar curto e ajustar.</span>
            </label>
            <label className="block mb-4">
              <span className="block text-[11px] uppercase tracking-wide text-texto-suave mb-1">Palavras que tiram a licitação da lista (uma por linha)</span>
              <textarea className="campo-caixa w-full h-16" value={campos.exclusoes} onChange={mudar('exclusoes')} placeholder="usado" />
            </label>
            <fieldset className="mb-4">
              <legend className="text-[11px] uppercase tracking-wide text-texto-suave mb-1">Estados onde atendem (nenhum = o Brasil todo)</legend>
              <div className="flex flex-wrap gap-1">
                {estado.ufs.map((uf) => (
                  <button
                    key={uf}
                    type="button"
                    aria-pressed={campos.ufs.includes(uf)}
                    onClick={() => alternarUf(uf)}
                    className={`px-2 py-1 text-xs border rounded ${campos.ufs.includes(uf) ? 'border-voltagem text-voltagem' : 'border-borda text-texto-suave hover:text-texto'}`}
                  >
                    {uf}
                  </button>
                ))}
              </div>
            </fieldset>
            {erro && <p className="text-xs text-erro mb-3" role="alert">{erro}</p>}
            <div className="flex gap-2">
              <button className="botao" onClick={() => setPasso(1)} disabled={ocupado}>Voltar</button>
              <button className="botao-primario flex items-center gap-2" onClick={salvar} disabled={ocupado}>
                {ocupado && <Loader2 size={12} className="animate-spin" />} Salvar e continuar
              </button>
            </div>
          </section>
        )}

        {passo === 3 && (
          <section aria-label="Passo 3: o primeiro boletim">
            <h2 className="font-titulo text-base mb-3">3. O primeiro boletim</h2>
            <p className="text-sm text-texto-suave mb-3">
              Salvo. Agora o painel procura, nos últimos 15 dias do catálogo, o que casa com as suas palavras
              {campos.ufs.length ? ` em ${campos.ufs.join(', ')}` : ''} e manda o boletim para o e-mail da equipe.
              Depois disso ele sai sozinho às 7h, 12h e 18h.
            </p>
            {descartadas.length > 0 && (
              <p className="text-xs text-atencao mb-3">
                Ficaram de fora: {descartadas.map((d) => `“${d.termo}” (${d.motivo})`).join('; ')}.
              </p>
            )}
            {erro && <p className="text-xs text-erro mb-3" role="alert">{erro}</p>}
            {!boletim && (
              <button className="botao-primario flex items-center gap-2" onClick={gerar} disabled={ocupado}>
                {ocupado && <Loader2 size={12} className="animate-spin" />} Gerar meu primeiro boletim
              </button>
            )}
            {boletim && <ResultadoBoletim r={boletim} aoIr={aoIr} aoAjustar={() => { setBoletim(null); setPasso(2); }} />}
          </section>
        )}
      </div>
    </div>
  );
}

function ResultadoBoletim({ r, aoIr, aoAjustar }) {
  const b = r.boletim;
  const aviso = EMAIL_SEM_ENVIO[b.email_status];
  return (
    <div>
      <p className="text-sm mb-1">
        <strong>{b.total_itens}</strong> licitação(ões) no boletim nº {b.numero || '—'}
        {b.email_status === 'enviado' ? ' — enviado por e-mail.' : '.'}
      </p>
      {aviso && b.email_status !== 'sem_itens' && <p className="text-xs text-atencao mb-3">{aviso}</p>}
      {b.total_itens === 0 ? (
        <p className="text-xs text-texto-suave mb-4">
          Nada casou nos últimos {r.dias} dias. Tente palavras mais gerais ou tire a restrição de estado.
          O boletim continua rodando e avisa quando aparecer algo.
        </p>
      ) : (
        <ul className="border border-borda rounded divide-y divide-borda mb-4 text-xs">
          {r.itens.map((i) => (
            <li key={i.id} className="p-2.5">
              <p className="mb-0.5">{i.objeto}</p>
              <p className="text-texto-suave">
                {i.orgao_nome} · {i.uf} · {i.valor_estimado ? moeda(i.valor_estimado) : 'valor sigiloso ou não informado'} · propostas até {formatarData(i.fim_propostas)}
                {i.palavra ? ` · casou com “${i.palavra}”` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="botao-primario" onClick={() => aoIr('radar')}>Ver no Radar</button>
        <button className="botao" onClick={() => aoIr('boletins')}>Ajustar o boletim</button>
        <button className="botao" onClick={aoAjustar}>Mudar as palavras</button>
        <button className="botao" onClick={() => aoIr('ajuda')}>Central de ajuda</button>
      </div>
    </div>
  );
}

function Campo({ rotulo, valor, aoMudar, placeholder, ajuda }) {
  return (
    <label className="block mb-4">
      <span className="block text-[11px] uppercase tracking-wide text-texto-suave mb-1">{rotulo}</span>
      <input className="campo-caixa w-full" value={valor} onChange={aoMudar} placeholder={placeholder} />
      {ajuda && <span className="block text-[11px] text-texto-suave mt-1">{ajuda}</span>}
    </label>
  );
}
