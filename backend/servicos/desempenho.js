// "Meu desempenho" (Seção 15): participações, vitórias, itens vencidos, ticket
// médio, órgãos, portais, motivos de perda e margem — num período, de uma
// organização. Só lê. As contas ficam em regras/desempenho.js.
//
// A definição de participação mora em servicos/participacoes.js (a mesma do relatório mensal).
// Contrato, proposta e histórico de preços entram por LEFT JOIN: licitação sem eles continua contada.
const pool = require('../config/db');
const { daOrganizacao } = require('./escopo');
const { cnpjDaEmpresa } = require('./perfil');
const { referenciaPara } = require('./preco');
const { diaNoFuso } = require('../regras/gestao');
const { participacoes } = require('./participacoes');
const precos = require('../regras/preco');
const regras = require('../regras/desempenho');

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
  const [{ linhas, filtro }, cnpj] = await Promise.all([participacoes(organizacaoId, periodo, { completo: true }), cnpjDaEmpresa(organizacaoId)]);
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
