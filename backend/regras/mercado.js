// Contratos, atas e acompanhamentos do mercado (Seção 12 do PLANO_SAAS_CONLICITACAO.md).
//
// Regras puras, sem banco e sem rede: como um registro do PNCP vira linha das
// tabelas `mercado_*`, que publicação posterior ao edital ele representa, e
// como os filtros da tela viram SQL parametrizado. O que erra calado aqui (data
// com fuso inventado, ata sem a contratação de origem, filtro que vira texto
// livre no SQL) está em `testes/mercado.test.js`.

const { comoLike } = require('./filtros-radar');
// "Hoje" do painel é o de Brasília (UTC às 21h já é amanhã); dias inteiros entre datas.
const { diaNoFuso: hojeEmBrasilia, dataValida, periodoEmUtc, diasEntre } = require('./gestao');

const ESFERAS = { F: 'Federal', E: 'Estadual', M: 'Municipal', D: 'Distrital' };
const PODERES = { E: 'Executivo', L: 'Legislativo', J: 'Judiciário', N: 'Não se aplica' };

// Situações da contratação no PNCP (consulta/v1, situacaoCompraId) que são
// publicação posterior ao edital. 1 = "Divulgada no PNCP" não é: é o próprio edital.
const SITUACOES = { 2: 'revogada', 3: 'anulada', 4: 'suspensa' };

const ROTULOS_PUBLICACAO = {
  contrato: 'Contrato publicado',
  ata: 'Ata de registro de preços',
  homologacao: 'Homologação / resultado',
  revogada: 'Revogada',
  anulada: 'Anulada',
  suspensa: 'Suspensa',
};

const texto = (v, max = 255) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
};
const digitos = (v) => String(v || '').replace(/\D/g, '');

function numero(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// O PNCP publica a hora de Brasília sem fuso ("2026-11-14T08:01:19.919451820").
// Passar por `new Date()` reinterpretaria no fuso do servidor; aqui a hora fica
// como veio, só cortada para o DATETIME do MySQL.
function dataHora(v) {
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?))?/.exec(String(v || ''));
  if (!m) return null;
  const hora = m[2] ? (m[2].length === 5 ? `${m[2]}:00` : m[2]) : '00:00:00';
  return `${m[1]} ${hora}`;
}
const soData = (v) => (dataHora(v) || '').slice(0, 10) || null;

// O banco guarda DATETIME em UTC (config/db.js, `timezone: 'Z'`) e o front mostra
// no fuso de quem olha. Brasília não tem horário de verão desde 2019: UTC−3 fixo.
const sqlUtc = (data) => data.toISOString().slice(0, 19).replace('T', ' ');
function instante(v) {
  const local = dataHora(v);
  if (!local) return null;
  const ms = Date.parse(`${local.replace(' ', 'T')}-03:00`);
  return Number.isFinite(ms) ? sqlUtc(new Date(ms)) : null;
}

function esfera(registro) {
  if (registro.esfera_nome) return texto(registro.esfera_nome, 20);
  return ESFERAS[registro.esfera_id || registro.esferaId] || null;
}
function poder(registro) {
  if (registro.poder_nome) return texto(registro.poder_nome, 40);
  return PODERES[registro.poder_id || registro.poderId] || null;
}

// A ata é "<contratação>-<sequencial da ata>": 87958658000199-1-000972/2025-000003.
function compraDaAta(numeroControleAta, registro = {}) {
  const m = /^(\d{14}-\d-\d{6}\/\d{4})-\d{6}$/.exec(String(numeroControleAta || ''));
  if (m) return m[1];
  const cnpj = digitos(registro.orgao_cnpj);
  const seq = digitos(registro.numero_sequencial_compra_ata);
  if (cnpj.length === 14 && seq && registro.ano) return `${cnpj}-1-${seq.padStart(6, '0')}/${registro.ano}`;
  return null;
}

/** Item da busca do PNCP (tipos_documento=contrato) → linha de `mercado_contratos`. */
function normalizarContrato(r) {
  return {
    numero_controle: texto(r.numero_controle_pncp, 60),
    numero_controle_compra: texto(r.numero_contratacao, 60),
    numero_contrato: texto(r.numero_contrato_empenho, 80) || texto(String(r.title || '').replace(/^\S+\s+nº\s*/i, ''), 80),
    tipo: texto(r.tipo_contrato_nome, 60),
    orgao_cnpj: digitos(r.orgao_cnpj).slice(0, 14) || null,
    orgao_nome: texto(r.orgao_nome),
    unidade: texto(r.unidade_nome),
    esfera: esfera(r),
    poder: poder(r),
    uf: texto(r.uf, 2),
    municipio: texto(r.municipio_nome, 120),
    modalidade: texto(r.modalidade_licitacao_nome, 80),
    objeto: texto(r.description, 65000),
    valor_global: numero(r.valor_global),
    fornecedor_ni: texto(r.fornecedor_ni, 20),
    fornecedor_nome: texto(r.fornecedor_nome),
    data_assinatura: soData(r.data_assinatura),
    vigencia_inicio: soData(r.data_inicio_vigencia),
    vigencia_fim: soData(r.data_fim_vigencia),
    cancelado: r.cancelado ? 1 : 0,
    publicado_em: instante(r.data_publicacao_pncp),
    atualizado_pncp_em: instante(r.data_atualizacao_pncp),
  };
}

/** Item da busca do PNCP (tipos_documento=ata) → linha de `mercado_atas`. */
function normalizarAta(r) {
  const numeroControle = texto(r.numero_controle_pncp, 70);
  return {
    numero_controle: numeroControle,
    numero_controle_compra: compraDaAta(numeroControle, r),
    numero_ata: texto(String(r.title || '').replace(/^Ata\s+nº\s*/i, ''), 80),
    orgao_cnpj: digitos(r.orgao_cnpj).slice(0, 14) || null,
    orgao_nome: texto(r.orgao_nome),
    unidade: texto(r.unidade_nome),
    esfera: esfera(r),
    poder: poder(r),
    uf: texto(r.uf, 2),
    municipio: texto(r.municipio_nome, 120),
    modalidade: texto(r.modalidade_licitacao_nome, 80),
    objeto: texto(r.description, 65000),
    // A busca devolve `valor_global: null` e nenhum fornecedor em toda ata
    // (conferido em 14/11/2026): fica NULL, nunca zero.
    valor_global: numero(r.valor_global),
    fornecedor_ni: texto(r.fornecedor_ni, 20),
    fornecedor_nome: texto(r.fornecedor_nome),
    permite_adesao: r.permite_adesao === null || r.permite_adesao === undefined ? null : r.permite_adesao ? 1 : 0,
    data_assinatura: soData(r.data_assinatura),
    vigencia_inicio: soData(r.data_inicio_vigencia),
    vigencia_fim: soData(r.data_fim_vigencia),
    cancelado: r.cancelado ? 1 : 0,
    publicado_em: instante(r.data_publicacao_pncp),
    atualizado_pncp_em: instante(r.data_atualizacao_pncp),
  };
}

const moeda = (v) =>
  v === null || v === undefined ? null : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Contrato ou ata já normalizado → a publicação que ele é na lista de acompanhamentos. */
function publicacaoDe(tipo, linha) {
  if (!linha.numero_controle || !linha.numero_controle_compra) return null;
  const partes =
    tipo === 'contrato'
      ? [
          `${linha.tipo || 'Contrato'}${linha.numero_contrato ? ` nº ${linha.numero_contrato}` : ''}`,
          linha.fornecedor_nome ? `com ${linha.fornecedor_nome}` : null,
          moeda(linha.valor_global),
        ]
      : [
          `Ata${linha.numero_ata ? ` nº ${linha.numero_ata}` : ''} registrada`,
          linha.vigencia_fim ? `vigente até ${linha.vigencia_fim.split('-').reverse().join('/')}` : null,
        ];
  return {
    chave: `${tipo}:${linha.numero_controle}`,
    numero_controle_compra: linha.numero_controle_compra,
    tipo,
    descricao: partes.filter(Boolean).join(' · ').slice(0, 500),
    ocorrido_em: linha.publicado_em,
    orgao_cnpj: linha.orgao_cnpj,
    orgao_nome: linha.orgao_nome,
    esfera: linha.esfera,
    uf: linha.uf,
    municipio: linha.municipio,
    modalidade: linha.modalidade,
    numero_compra: null,
    objeto: linha.objeto,
    valor: linha.valor_global,
  };
}

/**
 * Contratação da consulta do PNCP (/v1/contratacoes/atualizacao) → as
 * publicações posteriores ao edital que ela traz: homologação (quando há valor
 * homologado) e revogação/anulação/suspensão. Edital só divulgado → [].
 */
function publicacoesDaContratacao(c) {
  const ncp = texto(c.numeroControlePNCP, 60);
  if (!ncp) return [];
  const orgao = c.orgaoEntidade || {};
  const unidade = c.unidadeOrgao || {};
  const base = {
    numero_controle_compra: ncp,
    ocorrido_em: instante(c.dataAtualizacao || c.dataAtualizacaoGlobal),
    orgao_cnpj: digitos(orgao.cnpj).slice(0, 14) || null,
    orgao_nome: texto(orgao.razaoSocial),
    esfera: ESFERAS[orgao.esferaId] || null,
    uf: texto(unidade.ufSigla, 2),
    municipio: texto(unidade.municipioNome, 120),
    modalidade: texto(c.modalidadeNome, 80),
    numero_compra: c.numeroCompra ? texto(`${c.numeroCompra}${c.anoCompra ? `/${c.anoCompra}` : ''}`, 80) : null,
    objeto: texto(c.objetoCompra, 65000),
  };
  const saida = [];
  const homologado = numero(c.valorTotalHomologado);
  if (homologado !== null && homologado > 0) {
    saida.push({
      ...base,
      chave: `homologacao:${ncp}`,
      tipo: 'homologacao',
      descricao: `Homologada — valor total ${moeda(homologado)}`,
      valor: homologado,
    });
  }
  const situacao = SITUACOES[c.situacaoCompraId];
  if (situacao) {
    saida.push({
      ...base,
      chave: `${situacao}:${ncp}`,
      tipo: situacao,
      descricao: texto(c.situacaoCompraNome, 500) || ROTULOS_PUBLICACAO[situacao],
      valor: null,
    });
  }
  return saida;
}

// ---------------------------------------------------------------- filtros

const DIAS_MAX = 3650;
// Valor estimado vem do edital, quando a contratação está no catálogo. Subconsulta
// e não JOIN: a mesma contratação pode estar no catálogo por duas fontes.
const ESTIMADO =
  '(SELECT MAX(lc.valor_estimado) FROM licitacoes lc WHERE lc.numero_controle = a.numero_controle_compra)';
const inteiro = (v, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
// `%` e `_` digitados pela pessoa são texto, não curinga.
const like = (v) => comoLike(String(v).trim());

/**
 * Filtros da tela → { condicoes, valores } com apelido `a` para a tabela do
 * tipo. Só entra o que está na lista; valor inválido é ignorado, não vira erro
 * (é filtro de tela, não formulário). `hoje` é injetado para o teste.
 *
 * @param {'contratos'|'atas'|'acompanhamentos'} tipo
 */
function montarFiltros(tipo, q = {}, { hoje = null } = {}) {
  const condicoes = [];
  const valores = [];
  const add = (sql, ...v) => {
    condicoes.push(sql);
    valores.push(...v);
  };
  const s = (k) => (typeof q[k] === 'string' && q[k].trim() ? q[k].trim() : null);
  const dia = hoje || hojeEmBrasilia();

  if (s('busca')) add('a.objeto LIKE ?', like(s('busca')));
  if (s('uf') && /^[A-Za-z]{2}$/.test(s('uf'))) add('a.uf = ?', s('uf').toUpperCase());
  if (s('municipio')) add('a.municipio LIKE ?', like(s('municipio')));
  if (s('orgao')) {
    const d = digitos(s('orgao'));
    if (d.length === 14) add('a.orgao_cnpj = ?', d);
    else add('a.orgao_nome LIKE ?', like(s('orgao')));
  }
  if (s('esfera')) add('a.esfera = ?', s('esfera'));
  if (s('modalidade')) add('a.modalidade = ?', s('modalidade'));

  if (tipo === 'acompanhamentos') {
    // ocorrido_em é DATETIME em UTC: o dia de Brasília vira o intervalo UTC dele.
    if (dataValida(q.de)) add('a.ocorrido_em >= ?', periodoEmUtc(q.de, q.de).inicio);
    if (dataValida(q.ate)) add('a.ocorrido_em <= ?', periodoEmUtc(q.ate, q.ate).fim);
  } else {
    // data_assinatura é DATE: dia de calendário, sem fuso.
    if (dataValida(q.de)) add('a.data_assinatura >= ?', q.de);
    if (dataValida(q.ate)) add('a.data_assinatura <= ?', q.ate);
  }

  if (tipo === 'contratos' || tipo === 'atas') {
    if (s('poder')) add('a.poder = ?', s('poder'));
    if (s('empresa')) add('a.fornecedor_nome LIKE ?', like(s('empresa')));
    if (s('cnpj')) add('a.fornecedor_ni = ?', digitos(s('cnpj')));
    const vmin = numero(q.valor_min);
    const vmax = numero(q.valor_max);
    if (vmin !== null) add('a.valor_global >= ?', vmin);
    if (vmax !== null) add('a.valor_global <= ?', vmax);
    const emin = numero(q.estimado_min);
    const emax = numero(q.estimado_max);
    if (emin !== null) add(`${ESTIMADO} >= ?`, emin);
    if (emax !== null) add(`${ESTIMADO} <= ?`, emax);

    // Vigência: 'vigente' (hoje entre início e fim), 'encerrada', ou
    // `vence_em` = dias (a ata/contrato acaba entre hoje e hoje + N).
    if (q.vigencia === 'vigente') {
      add('a.vigencia_fim >= ? AND (a.vigencia_inicio IS NULL OR a.vigencia_inicio <= ?)', dia, dia);
    } else if (q.vigencia === 'encerrada') {
      add('a.vigencia_fim < ?', dia);
    }
    const vence = inteiro(q.vence_em, { min: 0, max: DIAS_MAX });
    if (vence !== null) add('a.vigencia_fim BETWEEN ? AND DATE_ADD(?, INTERVAL ? DAY)', dia, dia, vence);
    if (q.cancelado !== '1') condicoes.push('a.cancelado = 0');
  }
  if (tipo === 'contratos' && s('tipo')) add('a.tipo = ?', s('tipo'));
  if (tipo === 'atas' && q.adesao === '1') condicoes.push('a.permite_adesao = 1');

  if (tipo === 'acompanhamentos') {
    if (s('tipo') && ROTULOS_PUBLICACAO[s('tipo')]) add('a.tipo = ?', s('tipo'));
    if (s('edital')) add('(a.numero_compra LIKE ? OR a.numero_controle_compra LIKE ?)', like(s('edital')), like(s('edital')));
  }
  return { condicoes, valores };
}

/** Dias até o fim da vigência (negativo = já acabou; null = sem data). */
function diasParaFim(vigenciaFim, hoje = hojeEmBrasilia()) {
  // DATE chega do banco como texto (config/db.js, dateStrings: ['DATE']).
  const d = soData(vigenciaFim);
  return d ? diasEntre(soData(hoje), d) : null;
}

// Faixa do aviso "ata perto do fim": a tela pinta abaixo disto.
const DIAS_AVISO_FIM = 60;

module.exports = {
  ESTIMADO,
  ROTULOS_PUBLICACAO,
  DIAS_AVISO_FIM,
  dataHora,
  instante,
  sqlUtc,
  compraDaAta,
  normalizarContrato,
  normalizarAta,
  publicacaoDe,
  publicacoesDaContratacao,
  montarFiltros,
  diasParaFim,
  hojeEmBrasilia,
  like,
};
