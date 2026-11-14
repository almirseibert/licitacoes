import { useEffect, useState } from 'react';
import { Loader2, ExternalLink, Star, Search, AlertTriangle } from 'lucide-react';
import { api } from '../servicos/api';
import { moedaExata, data as comoData, dataHora, resumir } from '../servicos/formato';

/**
 * Contratos do mercado, Atas e Acompanhamentos (Seção 12 do PLANO_SAAS_CONLICITACAO.md).
 *
 * É o banco PÚBLICO do PNCP — de qualquer órgão e qualquer empresa — e não os
 * contratos que a organização ganhou (esses são "Meus contratos", seção 28).
 * A ata do PNCP não publica fornecedor nem valor: a tela mostra a lacuna em vez
 * de um traço que pareça zero.
 */

const TITULOS = {
  contratos: {
    titulo: 'Contratos do mercado',
    subtitulo: 'Contratos e empenhos publicados no PNCP por qualquer órgão — não são os seus (esses ficam em “Meus contratos”).',
  },
  atas: {
    titulo: 'Atas de registro de preços',
    subtitulo: 'Atas publicadas no PNCP. As que vencem em até 60 dias aparecem marcadas: é quando o órgão costuma abrir a próxima.',
  },
  acompanhamentos: {
    titulo: 'Acompanhamentos',
    subtitulo: 'O que saiu depois do edital — homologação, contrato, ata, revogação — de qualquer licitação. Favorita com publicação nova vira alerta.',
  },
};

const VIGENCIAS = [
  { chave: '', rotulo: 'Qualquer vigência' },
  { chave: 'vigente', rotulo: 'Vigentes hoje' },
  { chave: 'vence60', rotulo: 'Vencem em 60 dias' },
  { chave: 'vence90', rotulo: 'Vencem em 90 dias' },
  { chave: 'encerrada', rotulo: 'Encerradas' },
];

const ESTADO_COLETA = { ok: 'em dia', parcial: 'parcial', erro: 'falhou na última rodada' };
const ESFERAS = ['Federal', 'Estadual', 'Municipal', 'Distrital'];
const LACUNA = '____________';

function paraParametros(tipo, f) {
  const p = { ...f };
  if (tipo !== 'acompanhamentos') {
    if (f.vigencia === 'vence60') Object.assign(p, { vigencia: '', vence_em: '60' });
    if (f.vigencia === 'vence90') Object.assign(p, { vigencia: '', vence_em: '90' });
  }
  return Object.fromEntries(Object.entries(p).filter(([, v]) => v !== '' && v !== null && v !== undefined));
}

// App.jsx monta com `key={tipo}`: trocar de tela recomeça do zero (filtro de uma
// lista não vale na outra) sem uma requisição a mais com os filtros antigos.
export default function Mercado({ tipo, aoAbrir }) {
  const [filtros, setFiltros] = useState({});
  const [aplicados, setAplicados] = useState({});
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState(null);
  const [resumo, setResumo] = useState(null);
  const [palavras, setPalavras] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);
  // No celular a grade de filtros ocupa a tela inteira: começa fechada.
  const [verFiltros, setVerFiltros] = useState(false);

  useEffect(() => {
    api.palavras().then((r) => setPalavras(r.dados || r || [])).catch(() => setPalavras([]));
    // O resumo traz as listas (modalidade, poder, tipo) que as três telas usam.
    api.resumoMercado().then(setResumo).catch(() => setResumo(null));
    if (tipo === 'acompanhamentos') api.tiposAcompanhamento().then((r) => setTipos(r.dados)).catch(() => setTipos([]));
  }, [tipo]);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    const chamar = { contratos: api.contratosMercado, atas: api.atasMercado, acompanhamentos: api.acompanhamentos }[tipo];
    chamar({ ...paraParametros(tipo, aplicados), pagina })
      .then((r) => {
        if (!vivo) return;
        setDados(r);
        setErro(null);
      })
      .catch((e) => vivo && setErro(e.message))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [tipo, aplicados, pagina]);

  const mudar = (campo) => (e) =>
    setFiltros((f) => ({ ...f, [campo]: e.target.type === 'checkbox' ? (e.target.checked ? '1' : '') : e.target.value }));
  const aplicar = (e) => {
    e.preventDefault();
    setPagina(1);
    setAplicados(filtros);
  };
  const limpar = () => {
    setFiltros({});
    setPagina(1);
    setAplicados({});
  };

  const opcoes = (resumo && resumo.opcoes) || {};
  const { titulo, subtitulo } = TITULOS[tipo];
  const totalPaginas = dados ? Math.max(1, Math.ceil(dados.total / dados.por_pagina)) : 1;
  const coletas = resumo ? resumo.coletas.filter((c) => c.tipo === (tipo === 'contratos' ? 'contrato' : 'ata')) : [];

  const campo = (rotulo, nome, props = {}) => (
    <label className="flex flex-col gap-0.5 text-[11px] text-texto-suave min-w-0">
      {rotulo}
      <input className="campo-caixa w-full" value={filtros[nome] || ''} onChange={mudar(nome)} {...props} />
    </label>
  );
  const escolha = (rotulo, nome, itens, vazio = 'Todos') => (
    <label className="flex flex-col gap-0.5 text-[11px] text-texto-suave min-w-0">
      {rotulo}
      <select className="campo-caixa w-full" value={filtros[nome] || ''} onChange={mudar(nome)}>
        <option value="">{vazio}</option>
        {itens.map((i) => (
          <option key={i.chave ?? i} value={i.chave ?? i}>
            {i.rotulo ?? i}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-borda shrink-0">
        <h1 className="font-titulo text-xl">{titulo}</h1>
        <p className="text-xs text-texto-suave max-w-3xl">{subtitulo}</p>
        {coletas.length > 0 && (
          <p className="text-[11px] text-texto-suave mt-1">
            Coleta do PNCP:{' '}
            {coletas
              .map((c) => `${c.uf} ${ESTADO_COLETA[c.ultimo_status] || c.ultimo_status}, com dados até ${dataHora(c.ate) || '—'}`)
              .join(' · ')}
          </p>
        )}
      </div>

      <button type="button" className="sm:hidden mx-4 mt-2 botao self-start" onClick={() => setVerFiltros(!verFiltros)}>
        {verFiltros ? 'esconder filtros' : 'filtros'}
      </button>
      <form
        onSubmit={aplicar}
        className={`px-4 py-3 border-b border-borda gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 shrink-0 sm:grid ${verFiltros ? 'grid' : 'hidden'}`}
      >
        {campo('Objeto', 'busca', { placeholder: 'ex.: merenda' })}
        {campo('UF', 'uf', { maxLength: 2, placeholder: 'RS' })}
        {campo('Cidade', 'municipio')}
        {campo('Órgão (nome ou CNPJ)', 'orgao')}
        {escolha('Esfera', 'esfera', ESFERAS)}
        {escolha('Modalidade', 'modalidade', opcoes.modalidade || [])}
        {tipo !== 'acompanhamentos' && (
          <>
            {escolha('Vigência', 'vigencia', VIGENCIAS.slice(1), VIGENCIAS[0].rotulo)}
            {escolha('Poder', 'poder', opcoes.poder || [])}
            {tipo === 'contratos' && escolha('Tipo', 'tipo', opcoes.tipo || [])}
            {tipo === 'contratos' && campo('Empresa', 'empresa')}
            {tipo === 'contratos' && campo('CNPJ do fornecedor', 'cnpj', { inputMode: 'numeric' })}
            {campo('Contratado de (R$)', 'valor_min', { inputMode: 'decimal' })}
            {campo('Contratado até (R$)', 'valor_max', { inputMode: 'decimal' })}
            {campo('Estimado de (R$)', 'estimado_min', { inputMode: 'decimal' })}
            {campo('Estimado até (R$)', 'estimado_max', { inputMode: 'decimal' })}
          </>
        )}
        {tipo === 'acompanhamentos' && (
          <>
            {escolha('Publicação', 'tipo', tipos)}
            {campo('Edital', 'edital', { placeholder: 'número ou ID PNCP' })}
          </>
        )}
        {escolha(
          'Atividade (palavra-chave)',
          'atividade',
          palavras.map((p) => ({ chave: String(p.id), rotulo: p.termo })),
          'Qualquer'
        )}
        {campo(tipo === 'acompanhamentos' ? 'Publicado de' : 'Assinado de', 'de', { type: 'date' })}
        {campo('até', 'ate', { type: 'date' })}
        <div className="flex items-end gap-2 col-span-2 sm:col-span-3 lg:col-span-6 flex-wrap">
          {tipo === 'acompanhamentos' && (
            <label className="text-xs text-texto-suave flex items-center gap-1 mr-2">
              <input type="checkbox" checked={filtros.favoritas === '1'} onChange={mudar('favoritas')} /> só as minhas favoritas
            </label>
          )}
          {tipo === 'atas' && (
            <label className="text-xs text-texto-suave flex items-center gap-1 mr-2">
              <input type="checkbox" checked={filtros.adesao === '1'} onChange={mudar('adesao')} /> aceita adesão (carona)
            </label>
          )}
          <button type="submit" className="botao-primario flex items-center gap-1">
            <Search size={12} /> filtrar
          </button>
          <button type="button" className="botao" onClick={limpar}>
            limpar
          </button>
          {dados && (
            <span className="text-xs text-texto-suave ml-auto">
              {dados.total.toLocaleString('pt-BR')} resultado(s)
              {carregando && <Loader2 size={12} className="inline animate-spin ml-1" />}
            </span>
          )}
        </div>
      </form>

      {erro && <p className="mx-4 mt-2 px-3 py-2 text-xs border border-erro/40 text-erro rounded bg-erro/5">{erro}</p>}

      <div className="flex-1 overflow-auto p-4">
        {!dados ? (
          <Loader2 size={16} className="animate-spin text-texto-suave" />
        ) : dados.dados.length === 0 ? (
          <p className="text-sm text-texto-suave max-w-2xl">
            Nada com esses filtros. A coleta do PNCP roda todo dia às 02h para as UFs de MERCADO_UFS; o que foi publicado
            antes da primeira coleta não está aqui.
          </p>
        ) : (
          <ul className="space-y-2 max-w-5xl">
            {dados.dados.map((item) =>
              tipo === 'acompanhamentos' ? (
                <Publicacao key={item.id} p={item} aoAbrir={aoAbrir} />
              ) : (
                <Registro key={item.id} r={item} tipo={tipo} aoAbrir={aoAbrir} />
              )
            )}
          </ul>
        )}

        {dados && totalPaginas > 1 && (
          <div className="flex items-center gap-2 mt-4 text-xs text-texto-suave">
            <button className="botao" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>
              anterior
            </button>
            página {pagina} de {totalPaginas.toLocaleString('pt-BR')}
            <button className="botao" disabled={pagina >= totalPaginas} onClick={() => setPagina(pagina + 1)}>
              próxima
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function linkPncp(numeroControle, tipo) {
  // 92402510000103-2-000135/2026 → /app/contratos/92402510000103/2026/135
  const m = /^(\d{14})-\d-(\d{6})\/(\d{4})(?:-(\d{6}))?$/.exec(numeroControle || '');
  if (!m) return null;
  const [, cnpj, seq, ano, seqAta] = m;
  if (tipo === 'atas' && seqAta) return `https://pncp.gov.br/app/atas/${cnpj}/${ano}/${Number(seq)}/${Number(seqAta)}`;
  if (tipo === 'contratos') return `https://pncp.gov.br/app/contratos/${cnpj}/${ano}/${Number(seq)}`;
  return `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${Number(seq)}`;
}

function Rotulo({ children }) {
  return <span className="text-[10px] uppercase tracking-widest text-texto-suave">{children}</span>;
}

function Registro({ r, tipo, aoAbrir }) {
  const link = linkPncp(r.numero_controle, tipo);
  const fim = r.dias_para_fim;
  return (
    <li className="border border-borda rounded p-3 bg-superficie/40">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="text-sm break-words">{resumir(r.objeto, 220) || LACUNA}</p>
          <p className="text-xs text-texto-suave mt-0.5 break-words">
            {r.orgao_nome} · {r.municipio}/{r.uf} · {r.esfera}
            {r.modalidade ? ` · ${r.modalidade}` : ''}
          </p>
        </div>
        {r.perto_do_fim && (
          <span className="text-[11px] px-2 py-0.5 border border-atencao/60 text-atencao rounded flex items-center gap-1">
            <AlertTriangle size={11} /> vence em {fim} dia(s)
          </span>
        )}
        {r.cancelado ? <span className="text-[11px] px-2 py-0.5 border border-erro/50 text-erro rounded">cancelado</span> : null}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-xs">
        <div>
          <Rotulo>{tipo === 'contratos' ? r.tipo || 'Contrato' : 'Ata'}</Rotulo>
          <p className="font-mono break-all">{r.numero_contrato || r.numero_ata || r.numero_controle}</p>
        </div>
        <div className="min-w-0">
          <Rotulo>Fornecedor</Rotulo>
          {r.fornecedor_nome ? (
            <p className="break-words">
              {r.fornecedor_nome} <span className="font-mono text-texto-suave">{r.fornecedor_ni}</span>
            </p>
          ) : (
            <p className="text-texto-suave" title="O PNCP não publica o fornecedor na ata">
              {LACUNA} <span className="text-[10px]">não publicado {tipo === 'atas' ? 'na ata' : ''}</span>
            </p>
          )}
        </div>
        <div>
          <Rotulo>Contratado / estimado</Rotulo>
          <p className="font-mono">
            {r.valor_global !== null ? moedaExata(r.valor_global) : LACUNA}
            <span className="text-texto-suave"> / {r.valor_estimado !== null ? moedaExata(r.valor_estimado) : '—'}</span>
          </p>
        </div>
        <div>
          <Rotulo>Vigência</Rotulo>
          <p>
            {comoData(r.vigencia_inicio) || LACUNA} → {comoData(r.vigencia_fim) || LACUNA}
          </p>
          <p className="text-texto-suave">assinado em {comoData(r.data_assinatura) || LACUNA}</p>
        </div>
      </div>
      <div className="flex gap-3 mt-2 text-xs">
        {link && (
          <a href={link} target="_blank" rel="noreferrer" className="text-voltagem flex items-center gap-1">
            ver no PNCP <ExternalLink size={11} />
          </a>
        )}
        {r.licitacao_id && (
          <button className="text-voltagem" onClick={() => aoAbrir(r.licitacao_id)}>
            abrir o edital no Radar
          </button>
        )}
      </div>
    </li>
  );
}

function Publicacao({ p, aoAbrir }) {
  const link = linkPncp(p.numero_controle_compra, 'edital');
  return (
    <li className="border border-borda rounded p-3 bg-superficie/40">
      <div className="flex items-start gap-3 flex-wrap">
        <span className="text-[11px] px-2 py-0.5 border border-borda rounded shrink-0">{p.rotulo}</span>
        {p.favorita && <Star size={14} className="text-voltagem shrink-0" aria-label="favorita" />}
        <p className="text-sm flex-1 min-w-0 break-words">{p.descricao}</p>
        <span className="text-xs text-texto-suave shrink-0">{dataHora(p.ocorrido_em)}</span>
      </div>
      <p className="text-xs mt-1 break-words">{resumir(p.objeto, 220)}</p>
      <p className="text-xs text-texto-suave mt-0.5 break-words">
        {p.orgao_nome} · {p.municipio}/{p.uf}
        {p.modalidade ? ` · ${p.modalidade}` : ''}
        {p.numero_compra ? ` · edital ${p.numero_compra}` : ''}
      </p>
      <div className="flex gap-3 mt-2 text-xs">
        {link && (
          <a href={link} target="_blank" rel="noreferrer" className="text-voltagem flex items-center gap-1">
            ver no PNCP <ExternalLink size={11} />
          </a>
        )}
        {p.licitacao_id && (
          <button className="text-voltagem" onClick={() => aoAbrir(p.licitacao_id)}>
            abrir no Radar
          </button>
        )}
      </div>
    </li>
  );
}
