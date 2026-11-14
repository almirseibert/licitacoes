// A definição ÚNICA de "participação" (Seção 15b do plano SaaS), lida por "Meu desempenho"
// (servicos/desempenho.js) e pelo relatório mensal (servicos/exportar.js). Antes cada um tinha a sua
// cópia, e os números diferiam nas bordas do período e no desconto da perdida sem proposta.
//
// Participação = licitação da organização em "Proposta enviada", "Em disputa", "Ganhamos" ou
// "Perdemos", datada por COALESCE(proposta_em, etapa_em, fim_propostas) — DIA DE BRASÍLIA:
// `proposta_em` e `etapa_em` o painel grava em UTC, e `fim_propostas` o PNCP publica em horário de
// Brasília e a coleta guarda como veio (sem fuso). Todas as datas viram horário de Brasília antes de
// comparar com o período e de cair num mês (Brasília não tem horário de verão desde 2019: -3 h fixas).
const pool = require('../config/db');
const { daOrganizacao } = require('./escopo');
const regras = require('../regras/desempenho');

const DATA_DA_PARTICIPACAO =
  'COALESCE(DATE_SUB(l.proposta_em, INTERVAL 3 HOUR), DATE_SUB(l.etapa_em, INTERVAL 3 HOUR), l.fim_propostas)';
const ETAPAS = regras.ETAPAS_DISPUTADAS.map((e) => `'${e}'`).join(', ');

/**
 * WHERE das participações no período. Os limites são o dia de Brasília inteiro (00:00:00 a 23:59:59)
 * e entram como parâmetro; `periodo.de` nulo = sem início ("todo o histórico").
 */
function filtroDoPeriodo(periodo) {
  const partes = [`l.etapa IN (${ETAPAS})`, `${DATA_DA_PARTICIPACAO} IS NOT NULL`];
  const parametros = [];
  if (periodo.de) {
    partes.push(`${DATA_DA_PARTICIPACAO} BETWEEN ? AND ?`);
    parametros.push(`${periodo.de} 00:00:00`, `${periodo.ate} 23:59:59`);
  } else {
    partes.push(`${DATA_DA_PARTICIPACAO} <= ?`);
    parametros.push(`${periodo.ate} 23:59:59`);
  }
  return { sql: partes.join(' AND '), parametros };
}

const COLUNAS_BASE = `l.id, l.objeto, l.orgao_cnpj, l.orgao_nome, l.uf, l.modalidade, l.grupo, l.plataforma_disputa,
            l.valor_estimado, l.valor_proposto, l.valor_final, l.custo_estimado, l.vencedor, l.cnpj_vencedor,
            l.beneficio_me, l.etapa, ${DATA_DA_PARTICIPACAO} AS data`;

/**
 * As participações do período, uma linha cada. `completo` junta contrato, proposta e histórico de
 * preços (o que "Meu desempenho" usa para margem e comparação com o mercado); sem ele vêm só as
 * colunas da licitação — o que o relatório mensal precisa.
 */
async function participacoes(organizacaoId, periodo, { completo = false } = {}) {
  const filtro = filtroDoPeriodo(periodo);
  if (!completo) {
    // Só o que as contas usam: o relatório mensal agrupa em memória e não precisa de objeto, órgão etc.
    const [linhas] = await pool.query(
      `SELECT l.id, l.etapa, l.valor_estimado, l.valor_proposto, l.valor_final, ${DATA_DA_PARTICIPACAO} AS data FROM ${daOrganizacao(organizacaoId)} l WHERE ${filtro.sql}`,
      filtro.parametros
    );
    return { linhas, filtro };
  }
  const [linhas] = await pool.query(
    `SELECT ${COLUNAS_BASE},
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
  );
  return { linhas, filtro };
}

module.exports = { participacoes };
