// Escopo por organização (Seção 1b do PLANO_SAAS_CONLICITACAO.md).
//
// `licitacoes` é catálogo compartilhado: o fato público, igual para todo
// cliente. A pontuação e a decisão (etapa, favorito, descarte, proposta)
// moram em `org_licitacoes`, uma linha por organização × licitação.
//
// Para que as consultas antigas — `FROM licitacoes l WHERE l.etapa = ...` —
// não precisassem ser reescritas uma a uma, `daOrganizacao(id)` devolve uma
// tabela derivada com as colunas do catálogo E as da organização, sob o mesmo
// nome: `FROM ${daOrganizacao(id)} l` se comporta como a tabela de antes, já
// filtrada. O id entra como literal inteiro, validado aqui, e não como `?`:
// assim a ordem dos placeholders do resto da consulta não muda, e nada que
// não seja inteiro positivo chega ao SQL.

// Colunas de `org_licitacoes` que a consulta enxerga como se fossem da licitação.
const COLUNAS_ORG = [
  'pontuacao',
  'pontuacao_detalhe',
  'grupo',
  'palavra_casada',
  'pode_participar',
  'motivo_participacao',
  'objeto_social',
  'objeto_social_motivo',
  'etapa',
  'etapa_em',
  'proposta_em',
  'valor_proposto',
  'custo_estimado',
  'favorito',
  'descartada',
  'motivo_descarte',
  'codigo_barrou',
  'descartado_em',
];

// Decisão de quem usa o painel: a coleta e a repontuação nunca escrevem
// nestas colunas de uma linha que já existe (CLAUDE.md).
const COLUNAS_DECISAO = [
  'etapa',
  'etapa_em',
  'proposta_em',
  'valor_proposto',
  'custo_estimado',
  'favorito',
  'descartada',
  'motivo_descarte',
  'codigo_barrou',
  'descartado_em',
];

// Colunas do catálogo, listadas em vez de `l_.*`: três delas (o resultado)
// também existem na organização, e uma tabela derivada não aceita nome de
// coluna repetido. Coluna nova em `licitacoes` entra aqui — se faltar, a
// consulta que a usar falha alto, não em silêncio.
const COLUNAS_CATALOGO = [
  'id', 'fonte_id', 'chave_externa', 'numero_controle', 'orgao_cnpj', 'orgao_nome', 'unidade',
  'esfera', 'uf', 'municipio', 'modalidade', 'modo_disputa', 'numero_compra', 'processo', 'objeto',
  'informacao_complementar', 'valor_estimado', 'valor_homologado', 'orcamento_sigiloso', 'srp',
  'abertura_propostas', 'abertura_original', 'fim_propostas', 'fim_propostas_original',
  'prazo_questionamento', 'situacao', 'plataforma_disputa', 'link_portal', 'link_disputa',
  'beneficio_me', 'estrategica', 'reaberta_como', 'assinatura_objeto', 'bruto', 'ia_resumo', 'ia_em',
  'ia_situacao', 'pasta', 'arquivos_status', 'arquivos_em', 'exigencias_status', 'exigencias_em',
  'criado_em', 'atualizado_em',
];

// Resultado: o que a organização digitou passa na frente do que o portal publicou.
const COLUNAS_RESULTADO = ['valor_final', 'vencedor', 'cnpj_vencedor'];

const SELECAO_CATALOGO = [
  ...COLUNAS_CATALOGO.map((c) => `l_.${c}`),
  ...COLUNAS_RESULTADO.map((c) => `COALESCE(o_.${c}, l_.${c}) AS ${c}`),
].join(', ');

// A organização que opera o serviço (Studio Mythos, criada na migração 016).
// Só ela muda o que é operação do catálogo inteiro: janela da coleta, teto de
// download, fontes. A Seção 3 troca isto pelo superadmin.
const ORGANIZACAO_OPERADORA = 1;

/** A organização é a que opera o serviço? */
function ehOperadora(organizacaoId) {
  return Number(organizacaoId) === ORGANIZACAO_OPERADORA;
}

/** `--org=<id>` da linha de comando (padrão: a operadora), validado. */
function organizacaoDaLinhaDeComando(argv = process.argv) {
  const achado = argv.find((a) => a.startsWith('--org='));
  return achado ? idOrganizacao(achado.slice('--org='.length)) : ORGANIZACAO_OPERADORA;
}

/** Valida e devolve o id como inteiro; lança se não for um id de verdade. */
function idOrganizacao(valor) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`organizacao_id inválido: ${String(valor).slice(0, 20)}`);
  }
  return id;
}

/**
 * Tabela derivada "licitações vistas pela organização". Só aparece o que tem
 * linha em `org_licitacoes` — a coleta e a repontuação criam essa linha.
 * Uso: `FROM ${daOrganizacao(req.organizacaoId)} l`.
 */
function daOrganizacao(organizacaoId, { todas = false } = {}) {
  const id = idOrganizacao(organizacaoId);
  if (!todas) {
    return `(SELECT ${SELECAO_CATALOGO}, o_.organizacao_id, ${COLUNAS_ORG.map((c) => `o_.${c}`).join(', ')}
     FROM licitacoes l_
     JOIN org_licitacoes o_ ON o_.licitacao_id = l_.id AND o_.organizacao_id = ${id})`;
  }
  // `todas`: o catálogo inteiro, com a decisão da organização quando houver e
  // o estado de "ainda não olhei" quando não houver — para abrir o detalhe de
  // uma licitação que a coleta ainda não pontuou para ela.
  const padroes = { etapa: "'Triagem'", favorito: '0', descartada: '0', pontuacao: '0', pode_participar: "'Depende'" };
  const colunas = COLUNAS_ORG.map((c) => (padroes[c] ? `COALESCE(o_.${c}, ${padroes[c]}) AS ${c}` : `o_.${c}`));
  return `(SELECT ${SELECAO_CATALOGO}, ${id} AS organizacao_id, ${colunas.join(', ')}
     FROM licitacoes l_
     LEFT JOIN org_licitacoes o_ ON o_.licitacao_id = l_.id AND o_.organizacao_id = ${id})`;
}

/**
 * Uma linha por organização ativa × licitação, com `organizacao_id`: é o que
 * os jobs de aviso percorrem (prazo, prioridade alta, descarte por prazo) —
 * cada alerta nasce para a organização que tomou a decisão.
 */
function porOrganizacao() {
  return `(SELECT ${SELECAO_CATALOGO}, o_.organizacao_id, ${COLUNAS_ORG.map((c) => `o_.${c}`).join(', ')}
     FROM licitacoes l_
     JOIN org_licitacoes o_ ON o_.licitacao_id = l_.id
     JOIN organizacoes g_ ON g_.id = o_.organizacao_id AND g_.status <> 'suspensa')`;
}

/** Agrupa linhas por `organizacao_id` — para mandar um aviso por organização. */
function agruparPorOrganizacao(linhas) {
  const grupos = new Map();
  for (const linha of linhas) {
    if (!grupos.has(linha.organizacao_id)) grupos.set(linha.organizacao_id, []);
    grupos.get(linha.organizacao_id).push(linha);
  }
  return grupos;
}

/**
 * Visão do catálogo para os jobs que servem a todos (baixar o edital, ler,
 * resumir): a maior pontuação entre as organizações ativas, favorita para
 * alguma, e descartada só se TODAS que a têm descartaram.
 */
function agregadoDasOrganizacoes() {
  return `(SELECT l_.*, a_.pontuacao, a_.favorito, a_.descartada, a_.em_disputa
     FROM licitacoes l_
     JOIN (SELECT o_.licitacao_id,
                  MAX(o_.pontuacao) AS pontuacao,
                  MAX(o_.favorito) AS favorito,
                  MIN(o_.descartada) AS descartada,
                  MAX(o_.etapa NOT IN ('Triagem','Descartada')) AS em_disputa
             FROM org_licitacoes o_
             JOIN organizacoes g_ ON g_.id = o_.organizacao_id AND g_.status <> 'suspensa'
            GROUP BY o_.licitacao_id) a_ ON a_.licitacao_id = l_.id)`;
}

/**
 * Garante a linha da organização para a licitação (para quem marca favorito
 * ou move de etapa algo que a coleta ainda não pontuou para ela). Devolve
 * false se a licitação não existe no catálogo.
 */
async function garantirLinha(conexao, organizacaoId, licitacaoId) {
  const [[existe]] = await conexao.query('SELECT id FROM licitacoes WHERE id = ?', [licitacaoId]);
  if (!existe) return false;
  await conexao.query(
    `INSERT INTO org_licitacoes (organizacao_id, licitacao_id) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE licitacao_id = licitacao_id`,
    [idOrganizacao(organizacaoId), licitacaoId]
  );
  return true;
}

/**
 * Organizações ativas para quem uma licitação do catálogo importa: pontuou
 * acima de zero e não foi descartada. É a quem vai o aviso de um fato do
 * catálogo (reabertura, recorrência), que não pertence a ninguém em especial.
 */
async function organizacoesInteressadas(conexao, licitacaoIds) {
  const ids = (Array.isArray(licitacaoIds) ? licitacaoIds : [licitacaoIds]).filter(Boolean);
  if (!ids.length) return [];
  const [linhas] = await conexao.query(
    `SELECT DISTINCT o.organizacao_id
       FROM org_licitacoes o
       JOIN organizacoes g ON g.id = o.organizacao_id AND g.status <> 'suspensa'
      WHERE o.licitacao_id IN (?) AND o.pontuacao > 0 AND o.descartada = 0`,
    [ids]
  );
  return linhas.map((l) => l.organizacao_id);
}

/** Organizações que a coleta e os jobs servem (as suspensas ficam de fora). */
async function organizacoesAtivas(conexao) {
  const [linhas] = await conexao.query(
    "SELECT id FROM organizacoes WHERE status <> 'suspensa' ORDER BY id"
  );
  return linhas.map((l) => l.id);
}

module.exports = {
  COLUNAS_ORG,
  COLUNAS_DECISAO,
  ORGANIZACAO_OPERADORA,
  COLUNAS_CATALOGO,
  ehOperadora,
  organizacaoDaLinhaDeComando,
  idOrganizacao,
  daOrganizacao,
  porOrganizacao,
  agruparPorOrganizacao,
  agregadoDasOrganizacoes,
  garantirLinha,
  organizacoesAtivas,
  organizacoesInteressadas,
};
