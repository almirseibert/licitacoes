// O Radar visto pela organização (Seção 7 do plano SaaS): o que a listagem, a
// exportação e o link público compartilham — os filtros prontos para o SQL, as
// colunas do cartão e as etiquetas calculadas na leitura.
const pool = require('../config/db');
const filtrosRadar = require('../regras/filtros-radar');
const etiquetas = require('../regras/etiquetas');

/** A cidade de onde a organização mede o raio (Configurações), ou null. */
async function cidadeBase(organizacaoId) {
  const [[m]] = await pool.query(
    `SELECT m.codigo_ibge, m.nome, m.uf, m.latitude, m.longitude
       FROM org_configuracoes c JOIN municipios m ON m.codigo_ibge = c.valor
      WHERE c.organizacao_id = ? AND c.chave = 'radar_cidade_base'`,
    [organizacaoId]
  );
  return m || null;
}

/** Coordenadas da cidade de partida do raio: a pedida na tela ou a da organização. */
async function centroDoRaio(q, organizacaoId) {
  if (!q.raio_km) return null;
  const codigo = Number(q.raio_centro) || null;
  const [[m]] = codigo
    ? await pool.query('SELECT latitude, longitude FROM municipios WHERE codigo_ibge = ?', [codigo])
    : [[await cidadeBase(organizacaoId)]];
  return m ? { latitude: Number(m.latitude), longitude: Number(m.longitude) } : null;
}

/** Os filtros da tela, prontos para o SQL — listagem, exportação e link usam este. */
async function filtrosDe(q, organizacaoId) {
  const centro = await centroDoRaio(q, organizacaoId);
  return filtrosRadar.montarFiltros(q, { organizacaoId, centro });
}

// Colunas do cartão do Radar. A garantia vem das exigências lidas do edital
// (catálogo da seção 8.2); é o alerta "edital exige garantia" da Seção 7.
const COLUNAS_LISTA = `l.id, l.chave_externa, l.orgao_nome, l.unidade, l.uf, l.municipio, l.esfera,
       l.modalidade, l.modo_disputa, l.objeto, l.valor_estimado, l.valor_homologado, l.orcamento_sigiloso,
       l.srp, l.numero_compra, l.processo, l.abertura_propostas, l.abertura_original, l.fim_propostas,
       l.fim_propostas_original, l.situacao, l.plataforma_disputa, l.link_portal, l.link_disputa,
       l.beneficio_me, l.criado_em, l.arquivos_status,
       (SELECT COUNT(*) FROM licitacao_itens i WHERE i.licitacao_id = l.id) AS total_itens,
       EXISTS (SELECT 1 FROM licitacao_exigencias ex WHERE ex.licitacao_id = l.id
                 AND ex.codigo = 'garantia_contrato' AND ex.detectado = 'sim') AS exige_garantia`;

function comEtiquetas(linhas) {
  const agora = new Date();
  return linhas.map((l) => ({ ...l, exige_garantia: Number(l.exige_garantia) === 1, etiquetas: etiquetas.calcular(l, agora) }));
}

module.exports = { cidadeBase, centroDoRaio, filtrosDe, comEtiquetas, COLUNAS_LISTA };
