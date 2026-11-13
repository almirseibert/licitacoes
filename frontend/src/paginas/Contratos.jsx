import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCcw, Info, Check, Plus, ChevronRight, ChevronDown, Trash2, ExternalLink } from 'lucide-react';
import { api } from '../servicos/api';
import { moeda, moedaExata, data as comoData, resumir } from '../servicos/formato';

/**
 * Tela "Contratos" (seção 28.4).
 *
 * Ganhar é metade. A outra metade tem prazos com multa, e é isto que esta tela
 * vigia: o próximo marco de cada contrato e quantos dias faltam. No topo, o
 * faturado em 12 meses, a faixa da LC 123 e quanto falta para a próxima — com a
 * ressalva de que o número é o que passou pelo painel, não a contabilidade.
 */

const SITUACOES = [
  { chave: '', rotulo: 'Todos' },
  { chave: 'vigente', rotulo: 'Vigentes' },
  { chave: 'aguardando_assinatura', rotulo: 'Aguardando assinatura' },
  { chave: 'encerrado', rotulo: 'Encerrados' },
];

const ROTULO_SITUACAO = {
  aguardando_assinatura: 'aguardando assinatura',
  vigente: 'vigente',
  encerrado: 'encerrado',
  rescindido: 'rescindido',
  prorrogado: 'prorrogado',
};

export default function Contratos({ aoAbrir }) {
  const [situacao, setSituacao] = useState('');
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(null);
  const [aberto, setAberto] = useState(null);

  const carregar = async (filtro = situacao) => {
    try {
      setDados(await api.contratos(filtro || undefined));
      setErro(null);
    } catch (e) {
      setErro(e.message);
    }
  };

  useEffect(() => {
    carregar(situacao);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [situacao]);

  const rodarAvisos = async () => {
    setOcupado('avisos');
    setAviso(null);
    try {
      const r = await api.rodarAvisosContrato();
      setAviso(r.mensagem);
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(null);
    }
  };

  if (erro && !dados) return <p className="m-4 text-sm text-erro">{erro}</p>;
  if (!dados) return <Loader2 size={16} className="animate-spin text-texto-suave m-4" />;

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-borda flex items-center gap-4 shrink-0 flex-wrap">
        <h1 className="font-titulo text-xl">Contratos</h1>
        <div className="flex items-center gap-1">
          {SITUACOES.map((s) => (
            <button
              key={s.chave || 'todos'}
              onClick={() => setSituacao(s.chave)}
              className={`px-2 py-0.5 text-xs border rounded ${
                situacao === s.chave ? 'border-texto text-texto' : 'border-borda text-texto-suave hover:text-texto'
              }`}
            >
              {s.rotulo}
            </button>
          ))}
        </div>
        <button className="botao flex items-center gap-1 ml-auto" onClick={rodarAvisos} disabled={Boolean(ocupado)}>
          {ocupado === 'avisos' ? <Loader2 size={12} className="animate-spin" /> : <RefreshCcw size={12} />}
          rodar os avisos agora
        </button>
      </div>

      {erro && <p className="mx-4 mt-2 px-3 py-2 text-xs border border-erro/40 text-erro rounded bg-erro/5">{erro}</p>}
      {aviso && (
        <p className="mx-4 mt-2 px-3 py-2 text-xs border border-borda bg-superficie rounded text-texto-suave">{aviso}</p>
      )}

      <div className="flex-1 overflow-auto p-4 space-y-4">
        <Faixa receita={dados.receita} />

        {dados.dados.length === 0 ? (
          <p className="text-sm text-texto-suave max-w-2xl">
            Nenhum contrato registrado{situacao ? ' nesta situação' : ''}. O contrato nasce sozinho quando um card
            vai para “Ganhamos” no funil — já com o checklist de sete marcos da Lei 14.133 montado, para você
            conferir as datas contra o edital.
          </p>
        ) : (
          <ul className="space-y-2">
            {dados.dados.map((c) => (
              <Linha
                key={c.id}
                contrato={c}
                expandido={aberto === c.id}
                aoExpandir={() => setAberto(aberto === c.id ? null : c.id)}
                aoMudar={carregar}
                aoAbrirLicitacao={aoAbrir}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Faturado em 12 meses, faixa atual e quanto falta para a próxima (seção 28.4). */
function Faixa({ receita }) {
  const pct = receita.usado_da_faixa === null ? null : Math.min(1, receita.usado_da_faixa);

  return (
    <div className="border border-borda rounded p-3 bg-superficie/40 max-w-4xl">
      <div className="flex items-baseline gap-6 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-texto-suave">Faturado em 12 meses</p>
          <p className="font-mono text-lg text-voltagem">{moedaExata(receita.receita)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-texto-suave">Faixa atual</p>
          <p className="font-mono text-lg">{receita.faixa === 'acima' ? 'acima da EPP' : receita.faixa}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-texto-suave">
            Falta para {receita.proxima || 'sair da faixa'}
          </p>
          <p className="font-mono text-lg">
            {receita.falta_para_proxima === null ? '—' : moedaExata(receita.falta_para_proxima)}
          </p>
        </div>
      </div>

      {pct !== null && (
        <div className="mt-3">
          <div className="h-1.5 bg-realce/[0.06] rounded overflow-hidden">
            <div
              className={`h-full ${receita.perto_do_teto ? 'bg-atencao' : 'bg-voltagem'}`}
              style={{ width: `${(pct * 100).toFixed(1)}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-texto-suave font-mono">
            {(pct * 100).toFixed(1)}% do teto de {receita.faixa} ({moeda(receita.teto)})
            {receita.perto_do_teto && <span className="text-atencao"> · passou de 80%</span>}
          </p>
        </div>
      )}

      {receita.declaracao_desatualizada && (
        <p className="mt-2 px-2 py-1.5 text-[11px] border border-erro/40 text-erro rounded bg-erro/5">
          O perfil declara {receita.natureza_declarada}, mas esta receita cai em {receita.rotulo}. A declaração de
          enquadramento vai em cada proposta — confira com o contador.
        </p>
      )}

      <p className="mt-2 flex items-start gap-1.5 text-[11px] text-texto-suave">
        <Info size={12} className="shrink-0 mt-0.5" />
        {receita.ressalva} Pelo painel passaram {moedaExata(receita.receita_painel)} em{' '}
        {receita.contratos_somados} contrato(s). {receita.base_legal}.
      </p>
    </div>
  );
}

function Linha({ contrato, expandido, aoExpandir, aoMudar, aoAbrirLicitacao }) {
  const execucao = useMemo(() => {
    const valor = Number(contrato.valor || 0);
    if (!valor) return null;
    return Math.min(1, Number(contrato.valor_executado || 0) / valor);
  }, [contrato.valor, contrato.valor_executado]);

  const proximo = contrato.proximo;

  return (
    <li className="border border-borda rounded bg-superficie/40">
      <button className="w-full text-left p-3" onClick={aoExpandir}>
        <div className="flex items-baseline gap-3">
          {expandido ? (
            <ChevronDown size={14} className="shrink-0 mt-1 text-texto-suave" />
          ) : (
            <ChevronRight size={14} className="shrink-0 mt-1 text-texto-suave" />
          )}
          <span className="font-mono text-sm shrink-0 w-28 text-right text-voltagem">{moeda(contrato.valor)}</span>
          <span className="text-sm flex-1">{resumir(contrato.objeto, 120)}</span>
          <span className="text-[11px] text-texto-suave shrink-0">{ROTULO_SITUACAO[contrato.situacao]}</span>
        </div>

        <div className="mt-1.5 ml-8 flex items-center gap-3 flex-wrap text-[11px] text-texto-suave">
          <span>{contrato.orgao_nome || 'órgão não informado'}</span>
          {contrato.numero && <span className="font-mono">contrato {contrato.numero}</span>}
          {contrato.numero_empenho && <span className="font-mono">empenho {contrato.numero_empenho}</span>}
          {contrato.vigencia_fim && <span>vigência até {comoData(contrato.vigencia_fim)}</span>}
          <span className="font-mono">
            {contrato.marcos_concluidos}/{contrato.marcos_total} marcos
          </span>

          {proximo && (
            <span className={proximo.atrasado ? 'text-erro' : proximo.dias_restantes !== null && proximo.dias_restantes <= 7 ? 'text-atencao' : ''}>
              próximo: {proximo.titulo}
              {proximo.dias_restantes === null
                ? ' (sem data)'
                : proximo.atrasado
                  ? ` — atrasado há ${Math.abs(proximo.dias_restantes)}d`
                  : proximo.dias_restantes === 0
                    ? ' — hoje'
                    : ` — faltam ${proximo.dias_restantes}d`}
            </span>
          )}
        </div>

        {execucao !== null && (
          <div className="mt-2 ml-8 h-1 bg-realce/[0.06] rounded overflow-hidden">
            <div className="h-full bg-ok" style={{ width: `${(execucao * 100).toFixed(1)}%` }} />
          </div>
        )}
      </button>

      {expandido && <Detalhe contratoId={contrato.id} aoMudar={aoMudar} aoAbrirLicitacao={aoAbrirLicitacao} />}
    </li>
  );
}

const CAMPOS = [
  { chave: 'numero', rotulo: 'Número do contrato', tipo: 'text' },
  { chave: 'numero_empenho', rotulo: 'Número do empenho', tipo: 'text' },
  { chave: 'assinado_em', rotulo: 'Assinado em', tipo: 'date' },
  { chave: 'vigencia_inicio', rotulo: 'Vigência começa', tipo: 'date' },
  { chave: 'vigencia_fim', rotulo: 'Vigência termina', tipo: 'date' },
  { chave: 'valor', rotulo: 'Valor do contrato', tipo: 'number' },
  { chave: 'valor_executado', rotulo: 'Já executado', tipo: 'number' },
  { chave: 'gestor_nome', rotulo: 'Gestor do contrato', tipo: 'text' },
  { chave: 'gestor_contato', rotulo: 'Contato do gestor', tipo: 'text' },
];

function paraCampoData(valor) {
  if (!valor) return '';
  const puro = /^(\d{4}-\d{2}-\d{2})/.exec(String(valor));
  if (puro) return puro[1];
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function Detalhe({ contratoId, aoMudar, aoAbrirLicitacao }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [rascunho, setRascunho] = useState({});
  const [ocupado, setOcupado] = useState(null);
  const [novo, setNovo] = useState(null);

  const carregar = async () => {
    try {
      const r = await api.contrato(contratoId);
      setDados(r);
      setRascunho({
        ...Object.fromEntries(
          CAMPOS.map(({ chave, tipo }) => [
            chave,
            tipo === 'date' ? paraCampoData(r.contrato[chave]) : r.contrato[chave] === null ? '' : r.contrato[chave],
          ])
        ),
        situacao: r.contrato.situacao,
        garantia_exigida: r.contrato.garantia_exigida ? '1' : '0',
        observacao: r.contrato.observacao || '',
      });
      setErro(null);
    } catch (e) {
      setErro(e.message);
    }
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contratoId]);

  const salvar = async () => {
    setOcupado('salvar');
    setAviso(null);
    try {
      const r = await api.salvarContrato(contratoId, {
        ...rascunho,
        garantia_exigida: rascunho.garantia_exigida === '1',
      });
      setAviso(r.mensagem);
      await carregar();
      await aoMudar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(null);
    }
  };

  const mexerNoMarco = async (marco, campos) => {
    setOcupado(`marco-${marco.id}`);
    try {
      await api.salvarMarco(contratoId, marco.id, campos);
      await carregar();
      await aoMudar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(null);
    }
  };

  const apagarMarco = async (marco) => {
    try {
      await api.apagarMarco(contratoId, marco.id);
      await carregar();
      await aoMudar();
    } catch (e) {
      setErro(e.message);
    }
  };

  const acrescentar = async () => {
    setOcupado('novo');
    try {
      await api.criarMarco(contratoId, novo);
      setNovo(null);
      await carregar();
      await aoMudar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(null);
    }
  };

  if (!dados) return <div className="px-3 pb-3"><Loader2 size={14} className="animate-spin text-texto-suave" /></div>;

  const hoje = paraCampoData(new Date());

  return (
    <div className="border-t border-borda px-3 py-3 space-y-4">
      {erro && <p className="px-2 py-1.5 text-xs border border-erro/40 text-erro rounded bg-erro/5">{erro}</p>}
      {aviso && <p className="px-2 py-1.5 text-xs border border-borda bg-superficie rounded text-texto-suave">{aviso}</p>}

      {/* O checklist. É o que esta tela existe para mostrar. */}
      <div>
        <p className="text-[10px] uppercase tracking-widest text-texto-suave mb-2">Checklist de execução</p>
        <ul className="space-y-1">
          {dados.marcos.map((m) => {
            const concluido = Boolean(m.concluido_em);
            const dia = paraCampoData(m.previsto_para);
            const atrasado = !concluido && dia && dia < hoje;

            return (
              <li key={m.id} className="flex items-baseline gap-2 py-1 border-b border-borda/40">
                <button
                  className={`shrink-0 w-4 h-4 border rounded flex items-center justify-center ${
                    concluido ? 'border-ok text-ok' : 'border-borda text-transparent hover:border-texto-suave'
                  }`}
                  title={concluido ? 'Reabrir o marco' : 'Marcar como concluído'}
                  disabled={ocupado === `marco-${m.id}`}
                  onClick={() => mexerNoMarco(m, { concluido_em: concluido ? '' : hoje })}
                >
                  <Check size={11} />
                </button>

                <span className={`text-sm flex-1 ${concluido ? 'text-texto-suave line-through' : ''}`}>
                  {m.titulo}
                  {m.valor && <span className="ml-2 font-mono text-xs text-voltagem">{moedaExata(m.valor)}</span>}
                  {m.observacao && <span className="block text-[11px] text-texto-suave">{m.observacao}</span>}
                </span>

                <input
                  type="date"
                  className="campo text-xs w-32 shrink-0"
                  value={dia}
                  onChange={(e) => mexerNoMarco(m, { previsto_para: e.target.value })}
                />

                <span className={`text-[11px] font-mono shrink-0 w-24 text-right ${atrasado ? 'text-erro' : 'text-texto-suave'}`}>
                  {concluido ? comoData(m.concluido_em) : atrasado ? 'atrasado' : dia ? '' : 'sem data'}
                </span>

                {m.origem === 'manual' && (
                  <button className="shrink-0 text-texto-suave hover:text-erro" onClick={() => apagarMarco(m)}>
                    <Trash2 size={11} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {novo ? (
          <div className="mt-2 flex items-end gap-2 flex-wrap">
            <label className="text-xs">
              <span className="block text-texto-suave mb-0.5">Tipo</span>
              <select
                className="campo text-xs"
                value={novo.tipo}
                onChange={(e) => setNovo({ ...novo, tipo: e.target.value })}
              >
                {['medicao', 'entrega', 'aceite', 'nota_fiscal', 'pagamento', 'empenho'].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs flex-1 min-w-48">
              <span className="block text-texto-suave mb-0.5">Título</span>
              <input
                className="campo text-xs w-full"
                value={novo.titulo}
                onChange={(e) => setNovo({ ...novo, titulo: e.target.value })}
                placeholder="Medição de dezembro"
              />
            </label>
            <label className="text-xs">
              <span className="block text-texto-suave mb-0.5">Previsto</span>
              <input
                type="date"
                className="campo text-xs"
                value={novo.previsto_para}
                onChange={(e) => setNovo({ ...novo, previsto_para: e.target.value })}
              />
            </label>
            <button className="botao" onClick={acrescentar} disabled={ocupado === 'novo' || !novo.titulo}>
              {ocupado === 'novo' ? <Loader2 size={12} className="animate-spin" /> : 'acrescentar'}
            </button>
            <button className="text-xs text-texto-suave hover:text-texto" onClick={() => setNovo(null)}>
              cancelar
            </button>
          </div>
        ) : (
          <button
            className="mt-2 flex items-center gap-1 text-xs text-texto-suave hover:text-texto"
            onClick={() => setNovo({ tipo: 'medicao', titulo: '', previsto_para: '' })}
          >
            <Plus size={11} /> acrescentar marco
          </button>
        )}
      </div>

      {/* Os dados do contrato. Tudo seu: o painel não lê contrato de portal. */}
      <div>
        <p className="text-[10px] uppercase tracking-widest text-texto-suave mb-2">Dados do contrato</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {CAMPOS.map(({ chave, rotulo, tipo }) => (
            <label key={chave} className="text-xs">
              <span className="block text-texto-suave mb-0.5">{rotulo}</span>
              <input
                type={tipo}
                step={tipo === 'number' ? '0.01' : undefined}
                className="campo text-xs w-full"
                value={rascunho[chave] ?? ''}
                onChange={(e) => setRascunho({ ...rascunho, [chave]: e.target.value })}
              />
            </label>
          ))}

          <label className="text-xs">
            <span className="block text-texto-suave mb-0.5">Situação</span>
            <select
              className="campo text-xs w-full"
              value={rascunho.situacao}
              onChange={(e) => setRascunho({ ...rascunho, situacao: e.target.value })}
            >
              {Object.entries(ROTULO_SITUACAO).map(([chave, rotulo]) => (
                <option key={chave} value={chave}>
                  {rotulo}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs">
            <span className="block text-texto-suave mb-0.5">O edital exige garantia?</span>
            <select
              className="campo text-xs w-full"
              value={rascunho.garantia_exigida}
              onChange={(e) => setRascunho({ ...rascunho, garantia_exigida: e.target.value })}
            >
              <option value="0">Não</option>
              <option value="1">Sim — até 5% do valor</option>
            </select>
          </label>
        </div>

        <label className="block mt-2 text-xs">
          <span className="block text-texto-suave mb-0.5">Observação</span>
          <textarea
            rows={2}
            className="campo text-xs w-full"
            value={rascunho.observacao}
            onChange={(e) => setRascunho({ ...rascunho, observacao: e.target.value })}
          />
        </label>

        <div className="mt-2 flex items-center gap-3">
          <button className="botao" onClick={salvar} disabled={ocupado === 'salvar'}>
            {ocupado === 'salvar' ? <Loader2 size={12} className="animate-spin" /> : 'salvar'}
          </button>
          {aoAbrirLicitacao && (
            <button
              className="flex items-center gap-1 text-xs text-texto-suave hover:text-texto"
              onClick={() => aoAbrirLicitacao(dados.contrato.licitacao_id)}
            >
              <ExternalLink size={11} /> abrir a licitação
            </button>
          )}
          <p className="text-[11px] text-texto-suave ml-auto">
            Marcar garantia como exigida faz o marco dela entrar no checklist, com 5% do valor calculado.
          </p>
        </div>
      </div>
    </div>
  );
}
