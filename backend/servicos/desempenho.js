// "Meu desempenho" (Seção 15): participações, vitórias, itens vencidos, ticket
// médio, órgãos, portais, motivos de perda e margem — num período, de uma
// organização. Só lê. As contas ficam em regras/desempenho.js.
//
// Uma participação é uma licitação da organização em "Proposta enviada", "Em
// disputa", "Ganhamos" ou "Perdemos", datada por COALESCE(proposta_em,
// etapa_em, fim_propostas) — a mesma definição do relatório mensal
// (servicos/exportar.js) — se uma mudar, a outra muda junto. Contrato, proposta e histórico de preços entram por
// LEFT JOIN: licitação sem eles continua contada.
const pool = require('../config/db');
const { daOrganizacao } = require('./escopo');
const { cnpjDaEmpresa } = require('./perfil');
const { referenciaPara } = require('./preco');
const { diaNoFuso, periodoEmUtc } = require('../regras/gestao');
const precos = require('../regras/preco');
const regras = require('../regras/desempenho');

const DATA_DA_PARTICIPACAO = 'COALESCE(l.proposta_em, l.etapa_em, l.fim_propostas)';
const ETAPAS = regras.ETAPAS_DISPUTADAS.map((e) => `'${e}'`).join(', ');

/** WHERE das participações no período (os limites entram como parâmetro, já em UTC). */
function filtroDoPeriodo(periodo) {
  const partes = [`l.etapa IN (${ETAPAS})`, `${DATA_DA_PARTICIPACAO} IS NOT NULL`];
  const parametros = [];
  if (periodo.de) {
    const { inicio, fim } = periodoEmUtc(periodo.de, periodo.ate);
    partes.push(`${DATA_DA_PARTICIPACAO} BETWEEN ? AND ?`);
    parametros.push(inicio, fim);
  } else {
    const { fim } = periodoEmUtc(periodo.ate, periodo.ate);
    partes.push(`${DATA_DA_PARTICIPACAO} <= ?`);
    parametros.push(fim);
  }
  return { sql: partes.join(' AND '), parametros };
}

/** Preço de referência (o que fecharia pela mediana) de cada licitação que tem custo; uma busca por grupo+modalidade. */
async function anexarReferencia(linhas) {
  const com = linhas.filter((l) => {
    l.referencia_fecha = null;
    const temCusto = Number(l.proposta_custo) > 0 || Number(l.custo_estimado) > 0;
    return temCusto && Number(l.valor_estimado) > 0;
  });
  const chaveDe = (l) => `${l.grupo || ''}|${l.modalidade || ''}`;
  const unicas = new Map(com.map((l) => [chaveDe(l), l]));
  const referencias = new Map(
    await Promise.all([...unicas].map(async ([chave, l]) => [chave, await referenciaPara({ grupo: l.grupo, modalidade: l.modalidade })]))
  );
  for (const l of com) {
    l.referencia_fecha = precos.faixa({ valorEstimado: Number(l.valor_estimado), referencia: referencias.get(chaveDe(l)) }).fecha_por;
  }
}

/** Itens que a empresa venceu nas licitações do período (CNPJ do perfil contra o vencedor do item). */
async function itensVencidos(organizacaoId, filtro, cnpj) {
  if (!cnpj) return null;
  const [[linha]] = await pool.query(
    `SELECT COUNT(*) AS itens, COUNT(DISTINCT i.licitacao_id) AS licitacoes, SUM(i.valor_homologado) AS valor
       FROM licitacao_itens i
       JOIN ${daOrganizacao(organizacaoId)} l ON l.id = i.licitacao_id
      WHERE ${filtro.sql}
        AND REPLACE(REPLACE(REPLACE(i.cnpj_vencedor, '.', ''), '/', ''), '-', '') = ?`,
    [...filtro.parametros, cnpj]
  );
  return {
    itens: Number(linha.itens),
    licitacoes: Number(linha.licitacoes),
    valor: linha.valor === null ? 0 : Math.round(Number(linha.valor) * 100) / 100,
  };
}

async function desempenho(organizacaoId, q = {}) {
  const periodo = regras.periodoDesempenho(q, { hoje: diaNoFuso() });
  const filtro = filtroDoPeriodo(periodo);
  const [[linhas], cnpj] = await Promise.all([
    pool.query(
    `SELECT l.id, l.objeto, l.orgao_cnpj, l.orgao_nome, l.uf, l.modalidade, l.grupo, l.plataforma_disputa,
            l.valor_estimado, l.valor_proposto, l.valor_final, l.custo_estimado, l.vencedor, l.cnpj_vencedor,
            l.beneficio_me, l.etapa, ${DATA_DA_PARTICIPACAO} AS data,
            c.id AS contrato_id, c.valor AS contrato_valor, c.valor_executado AS contrato_executado,
            c.situacao AS contrato_situacao,
            p.valor_total AS proposta_valor, p.custo_total AS proposta_custo,
            (SELECT hp.desconto FROM historico_precos hp
              WHERE hp.chave_externa = l.chave_externa AND hp.sem_homologacao = 0 AND hp.desconto IS NOT NULL
              ORDER BY hp.id LIMIT 1) AS desconto_mercado
       FROM ${daOrganizacao(organizacaoId)} l
       LEFT JOIN contratos c ON c.licitacao_id = l.id AND c.organizacao_id = ?
       LEFT JOIN propostas p ON p.id = (
              SELECT p2.id FROM propostas p2
               WHERE p2.organizacao_id = ? AND p2.licitacao_id = l.id AND p2.status IN ('final', 'enviada')
               ORDER BY FIELD(p2.status, 'enviada', 'final'), p2.id DESC LIMIT 1)
      WHERE ${filtro.sql}
      ORDER BY data DESC`,
    [organizacaoId, organizacaoId, ...filtro.parametros]
    ),
    cnpjDaEmpresa(organizacaoId),
  ]);
  // A referência de preço e os itens vencidos não dependem um do outro.
  const [, vencidos] = await Promise.all([anexarReferencia(linhas), itensVencidos(organizacaoId, filtro, cnpj)]);
  const resumo = regras.resumir(linhas);

  return {
    periodo,
    ...resumo,
    itens: {
      vencidos,
      // Itens disputados e não vencidos: não disponível — o PNCP só publica o vencedor (a tela diz isso).
      aviso: cnpj ? null : 'Cadastre o CNPJ da empresa em Documentos para o painel contar os itens vencidos.',
    },
    ressalva:
      'Participação é a licitação em Proposta enviada, Em disputa, Ganhamos ou Perdemos, datada pela proposta (ou pela etapa). ' +
      'A taxa de vitória conta só o que já teve resultado. Valor ganho e ticket médio usam o valor do resultado, ou o da proposta quando o resultado não foi registrado. ' +
      'A margem é sobre o preço — (preço − custo) ÷ preço — e só existe onde há custo (da proposta ou da licitação) e preço; sem custo, o painel não chuta. ' +
      'Nas ganhas o preço da margem é o do contrato quando existe (senão o do resultado, senão o da proposta), então pode diferir do valor ganho se o contrato teve aditivo.',
  };
}

module.exports = { desempenho };
