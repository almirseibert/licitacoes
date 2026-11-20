// Painel "Mercado e concorrentes" (decisão de 20/11/2026): quatro respostas sobre o catálogo público
// (`mercado_contratos`, `mercado_atas`) filtrado pelo catálogo de segmentos — não seis cortes do mesmo
// GROUP BY. A frase e as janelas vivem em regras/mercado-painel.js; a conta do desconto, no serviço de preço.
const pool = require('../config/db');
const regras = require('../regras/mercado-painel');
const segmentos = require('../regras/segmentos');
const preco = require('./preco');

const numero = (v) => (v === null || v === undefined ? null : Number(v));
// CPF chega mascarado do PNCP e pessoas diferentes dividem a máscara: só CNPJ entra em "quem vende".
const SO_CNPJ = 'CHAR_LENGTH(a.fornecedor_ni) = 14';

/** area/segmento/uf → condições sobre a tabela `a` (contratos ou atas). Valor inválido é ignorado. */
function recorteDe(q = {}) {
  const segmento = q.segmento && segmentos.areaDoSegmento(String(q.segmento)) ? String(q.segmento) : '';
  const area = segmento
    ? segmentos.areaDoSegmento(segmento)
    : q.area && segmentos.listarCatalogo().some((a) => a.area === String(q.area)) ? String(q.area) : '';
  const uf = /^[A-Za-z]{2}$/.test(String(q.uf || '')) ? String(q.uf).toUpperCase() : '';

  const onde = [];
  const valores = [];
  if (segmento) {
    onde.push('a.segmento = ?');
    valores.push(segmento);
  } else if (area) {
    onde.push('a.area = ?');
    valores.push(area);
  }
  if (uf) {
    onde.push('a.uf = ?');
    valores.push(uf);
  }
  return { area, segmento, uf, onde, valores };
}

async function painel(organizacaoId, q = {}) {
  const dias = regras.escolher(q.dias, regras.JANELAS_ASSINADOS, regras.PADRAO_ASSINADOS);
  const vence = regras.escolher(q.vence, regras.JANELAS_VENCIMENTO, regras.PADRAO_VENCIMENTO);
  const r = recorteDe(q);
  const ondeBase = ['a.cancelado = 0', ...r.onde];

  const assinados = [...ondeBase, 'a.data_assinatura >= DATE_SUB(CURDATE(), INTERVAL ? DAY)'];
  const valAssinados = [...r.valores, dias];

  const [[org]] = await pool.query('SELECT cnpj FROM organizacoes WHERE id = ?', [organizacaoId]);
  const proprio = String((org && org.cnpj) || '').replace(/\D/g, '');

  const [
    [[totais]],
    [compradores],
    [vencendo],
    [[vencendoTotais]],
    [atas],
    [[atasTotais]],
    [concorrentes],
    [contagens],
    [ufs],
  ] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS contratos, COALESCE(SUM(a.valor_global), 0) AS valor,
              COUNT(DISTINCT a.orgao_cnpj) AS orgaos,
              COUNT(DISTINCT CASE WHEN ${SO_CNPJ} THEN a.fornecedor_ni END) AS fornecedores
         FROM mercado_contratos a WHERE ${assinados.join(' AND ')}`,
      valAssinados
    ),
    pool.query(
      `SELECT a.orgao_cnpj AS cnpj, MAX(a.orgao_nome) AS nome, COUNT(*) AS contratos, SUM(a.valor_global) AS valor
         FROM mercado_contratos a WHERE ${assinados.join(' AND ')} AND a.orgao_nome IS NOT NULL
        GROUP BY a.orgao_cnpj ORDER BY valor DESC, contratos DESC LIMIT 5`,
      valAssinados
    ),
    pool.query(
      `SELECT a.id, a.orgao_cnpj, a.orgao_nome, a.municipio, a.uf, a.objeto, a.valor_global, a.fornecedor_ni,
              a.fornecedor_nome, a.vigencia_fim, DATEDIFF(a.vigencia_fim, CURDATE()) AS dias, a.segmento
         FROM mercado_contratos a
        WHERE ${[...ondeBase, 'a.vigencia_fim BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)'].join(' AND ')}
        ORDER BY a.vigencia_fim ASC, a.valor_global DESC LIMIT 40`,
      [...r.valores, vence]
    ),
    pool.query(
      `SELECT COUNT(*) AS contratos, COALESCE(SUM(a.valor_global), 0) AS valor FROM mercado_contratos a
        WHERE ${[...ondeBase, 'a.vigencia_fim BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)'].join(' AND ')}`,
      [...r.valores, vence]
    ),
    pool.query(
      `SELECT a.id, a.orgao_nome, a.municipio, a.uf, a.objeto, a.numero_ata, a.vigencia_fim,
              DATEDIFF(a.vigencia_fim, CURDATE()) AS dias, a.segmento
         FROM mercado_atas a
        WHERE ${[...ondeBase, 'a.permite_adesao = 1', 'a.vigencia_fim >= CURDATE()'].join(' AND ')}
        ORDER BY a.vigencia_fim ASC LIMIT 30`,
      r.valores
    ),
    pool.query(
      `SELECT COUNT(*) AS atas FROM mercado_atas a
        WHERE ${[...ondeBase, 'a.permite_adesao = 1', 'a.vigencia_fim >= CURDATE()'].join(' AND ')}`,
      r.valores
    ),
    pool.query(
      `SELECT a.fornecedor_ni AS cnpj, MAX(a.fornecedor_nome) AS empresa, COUNT(*) AS contratos,
              SUM(a.valor_global) AS valor, COUNT(DISTINCT a.orgao_cnpj) AS orgaos,
              GROUP_CONCAT(DISTINCT a.uf ORDER BY a.uf) AS ufs, MAX(a.data_assinatura) AS ultimo,
              EXISTS (SELECT 1 FROM concorrentes c WHERE c.cnpj = a.fornecedor_ni) AS no_dossie
         FROM mercado_contratos a WHERE ${assinados.join(' AND ')} AND ${SO_CNPJ} AND a.fornecedor_ni <> ?
        GROUP BY a.fornecedor_ni ORDER BY valor DESC, contratos DESC LIMIT 20`,
      [...valAssinados, proprio]
    ),
    // Quantos contratos há em cada segmento no período (e UF), para o seletor mostrar onde há dado.
    pool.query(
      `SELECT a.area, a.segmento, COUNT(*) AS n FROM mercado_contratos a
        WHERE a.cancelado = 0 AND a.segmento IS NOT NULL AND a.data_assinatura >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
          ${r.uf ? 'AND a.uf = ?' : ''} GROUP BY a.area, a.segmento`,
      r.uf ? [dias, r.uf] : [dias]
    ),
    pool.query("SELECT DISTINCT uf FROM mercado_contratos WHERE uf IS NOT NULL AND uf <> '' ORDER BY uf"),
  ]);

  // Desconto típico: o que o preço de referência mede para o mesmo recorte (pregão).
  const { referencia } = await preco.referenciaDoFiltro({ area: r.area, segmento: r.segmento, uf: r.uf, familia: 'Pregão' });

  const total = {
    contratos: Number(totais.contratos || 0),
    valor: numero(totais.valor) || 0,
    orgaos: Number(totais.orgaos || 0),
    fornecedores: Number(totais.fornecedores || 0),
  };
  const compr = compradores.map((c) => ({ cnpj: c.cnpj, nome: c.nome, contratos: Number(c.contratos), valor: numero(c.valor) || 0 }));
  const desconto = referencia
    ? { mediano: numero(referencia.desconto_mediano), amostra: Number(referencia.amostra || 0), base: referencia.base || null }
    : null;

  const n = new Map(contagens.map((c) => [`${c.area}\u0000${c.segmento}`, Number(c.n)]));
  const catalogo = segmentos.listarCatalogo().map((a) => {
    const lista = a.segmentos.map((nome) => ({ nome, n: n.get(`${a.area}\u0000${nome}`) || 0 }));
    return { area: a.area, n: lista.reduce((t, x) => t + x.n, 0), segmentos: lista };
  });

  return {
    recorte: { area: r.area, segmento: r.segmento, uf: r.uf, dias, vence },
    frase: regras.fraseDoMercado({ recorte: r, dias, totais: total, compradores: compr, desconto }),
    totais: total,
    compradores: compr,
    desconto,
    vencendo: {
      total: Number(vencendoTotais.contratos || 0),
      valor: numero(vencendoTotais.valor) || 0,
      dados: vencendo.map((v) => ({ ...v, valor_global: numero(v.valor_global), dias: Number(v.dias) })),
    },
    atas: {
      total: Number(atasTotais.atas || 0),
      dados: atas.map((x) => ({ ...x, dias: Number(x.dias) })),
    },
    concorrentes: concorrentes.map((c) => ({
      ...c,
      contratos: Number(c.contratos),
      orgaos: Number(c.orgaos),
      valor: numero(c.valor) || 0,
      participacao: total.valor > 0 ? (numero(c.valor) || 0) / total.valor : null,
      no_dossie: Boolean(Number(c.no_dossie)),
    })),
    catalogo,
    ufs: ufs.map((u) => u.uf),
    janelas: { assinados: regras.JANELAS_ASSINADOS, vencimento: regras.JANELAS_VENCIMENTO },
  };
}

module.exports = { painel, recorteDe };
