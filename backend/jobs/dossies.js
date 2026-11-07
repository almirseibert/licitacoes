// Job `agregar_dossies` (seções 26 e 27) — as fichas de concorrente e de órgão.
//
// Nada aqui é coletado à parte: é tudo derivado da base que já temos. As
// tabelas existem porque a conta é cara para refazer a cada abertura de tela,
// não porque o dado seja novo. Por isso o job é mensal e idempotente — rodar
// de novo só corrige.
//
// Tudo é feito em consultas agrupadas sobre a base inteira, e não uma consulta
// por órgão: a primeira versão fazia cinco idas ao banco para cada um dos 1.344
// órgãos e passava de cinco minutos. Agrupado, são oito consultas no total.
const pool = require('../config/db');
const fila = require('../servicos/fila');
const regrasPreco = require('../regras/preco');
const perfil = require('../servicos/perfil');

// Quantas linhas por INSERT. Lote grande demais estoura max_allowed_packet.
const LOTE = 200;

function recortar(valor, tamanho) {
  if (valor === null || valor === undefined) return null;
  return String(valor).slice(0, tamanho);
}

function media(lista) {
  if (!lista.length) return null;
  return Math.round((lista.reduce((s, v) => s + v, 0) / lista.length) * 10000) / 10000;
}

/** Agrupa linhas por uma chave, devolvendo um Map de arrays. */
function porChave(linhas, chave) {
  const mapa = new Map();
  for (const linha of linhas) {
    const k = linha[chave];
    if (k === null || k === undefined) continue;
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k).push(linha);
  }
  return mapa;
}

/**
 * Grava em lotes, com a mesma cláusula de atualização.
 * `colunas` é a quantidade de colunas por linha — contada da primeira linha,
 * para não haver como ficar fora de sincronia com a lista de colunas do SQL.
 */
async function gravarEmLotes(sql, linhas) {
  if (!linhas.length) return;
  const colunas = linhas[0].length;
  const marcador = `(${Array.from({ length: colunas }, () => '?').join(', ')})`;

  for (let i = 0; i < linhas.length; i += LOTE) {
    const lote = linhas.slice(i, i + LOTE);
    await pool.query(sql.replace('{{VALORES}}', lote.map(() => marcador).join(', ')), lote.flat());
  }
}

/**
 * Dossiê do concorrente (seção 26).
 *
 * "Disputou" é licitação distinta em que o CNPJ apareceu no resultado; a lista
 * completa de propostas depende do Compras.gov.br, que bloqueia (seção 5.2).
 * A tela diz isso — "disputou" aqui significa "apareceu no resultado".
 */
async function agregarConcorrentes() {
  const meuCnpj = await perfil.cnpjDaEmpresa().catch(() => null);

  const [base] = await pool.query(
    `SELECT p.cnpj,
            MAX(p.empresa) AS empresa, MAX(p.uf) AS uf,
            MAX(p.me_epp) AS me_epp, MAX(p.mei) AS mei,
            COUNT(DISTINCT p.licitacao_id) AS disputas,
            COUNT(*) AS itens,
            SUM(p.situacao LIKE '%desclassific%' OR p.situacao LIKE '%inabilit%') AS desclassificacoes
       FROM propostas_concorrentes p
      WHERE p.cnpj IS NOT NULL AND p.cnpj <> ''
      GROUP BY p.cnpj`
  );
  if (!base.length) return { concorrentes: 0 };

  const cnpjs = base.map((c) => c.cnpj);

  // Uma consulta para todos: itens vencidos, com o estimado ao lado para o
  // desconto e o grupo para o menor preço.
  const [vencidos] = await pool.query(
    `SELECT i.cnpj_vencedor AS cnpj, i.valor_homologado, i.valor_total_estimado, l.grupo
       FROM licitacao_itens i
       JOIN licitacoes l ON l.id = i.licitacao_id
      WHERE i.cnpj_vencedor IN (?)`,
    [cnpjs]
  );
  const [ufs] = await pool.query(
    `SELECT DISTINCT p.cnpj, l.uf
       FROM propostas_concorrentes p JOIN licitacoes l ON l.id = p.licitacao_id
      WHERE p.cnpj IN (?) AND l.uf IS NOT NULL`,
    [cnpjs]
  );
  const [grupos] = await pool.query(
    `SELECT p.cnpj, l.grupo, COUNT(DISTINCT l.id) AS n
       FROM propostas_concorrentes p JOIN licitacoes l ON l.id = p.licitacao_id
      WHERE p.cnpj IN (?) AND l.grupo IS NOT NULL
      GROUP BY p.cnpj, l.grupo ORDER BY n DESC`,
    [cnpjs]
  );
  // "Encontrou você": licitações já decididas em que os dois apareceram.
  const [encontros] = meuCnpj
    ? await pool.query(
        `SELECT p.cnpj, COUNT(DISTINCT l.id) AS n, SUM(l.cnpj_vencedor = p.cnpj) AS dele
           FROM licitacoes l
           JOIN propostas_concorrentes p ON p.licitacao_id = l.id
          WHERE p.cnpj IN (?) AND p.cnpj <> ? AND l.etapa IN ('Ganhamos','Perdemos')
          GROUP BY p.cnpj`,
        [cnpjs, meuCnpj]
      )
    : [[]];

  const porVencidos = porChave(vencidos, 'cnpj');
  const porUf = porChave(ufs, 'cnpj');
  const porGrupo = porChave(grupos, 'cnpj');
  const porEncontro = new Map(encontros.map((e) => [e.cnpj, e]));

  const linhas = base.map((c) => {
    const itens = porVencidos.get(c.cnpj) || [];
    const descontos = itens
      .map((i) =>
        regrasPreco.descontoDe({ valor_estimado: i.valor_total_estimado, valor_homologado: i.valor_homologado })
      )
      .filter((d) => d !== null);

    // Menor preço por grupo: o piso que ele pratica, e o número que decide se
    // vale montar proposta naquele objeto (seção 26.4).
    const menorPorGrupo = {};
    for (const i of itens) {
      const grupo = i.grupo || 'Geral';
      const valor = Number(i.valor_homologado);
      if (!Number.isFinite(valor) || valor <= 0) continue;
      if (!menorPorGrupo[grupo] || valor < menorPorGrupo[grupo]) menorPorGrupo[grupo] = valor;
    }

    const enc = porEncontro.get(c.cnpj);

    return [
      c.cnpj,
      recortar(c.empresa, 255),
      recortar(c.uf, 2),
      c.me_epp ? 1 : 0,
      c.mei ? 1 : 0,
      Number(c.disputas),
      Number(c.itens),
      itens.length,
      media(descontos),
      descontos.length ? regrasPreco.mediana(descontos) : null,
      JSON.stringify(menorPorGrupo),
      JSON.stringify((porUf.get(c.cnpj) || []).map((u) => u.uf)),
      JSON.stringify((porGrupo.get(c.cnpj) || []).map((g) => ({ grupo: g.grupo, licitacoes: Number(g.n) }))),
      Number(c.desclassificacoes || 0),
      enc ? Number(enc.n || 0) : 0,
      enc ? Number(enc.dele || 0) : 0,
    ];
  });

  await gravarEmLotes(
    `INSERT INTO concorrentes
       (cnpj, razao_social, uf, me_epp, mei, disputas, itens, vitorias,
        desconto_medio, desconto_mediano, menor_preco_json, ufs, grupos,
        desclassificacoes, encontros, encontros_perdidos)
     VALUES {{VALORES}}
     ON DUPLICATE KEY UPDATE
       razao_social = VALUES(razao_social), uf = VALUES(uf),
       me_epp = VALUES(me_epp), mei = VALUES(mei),
       disputas = VALUES(disputas), itens = VALUES(itens), vitorias = VALUES(vitorias),
       desconto_medio = VALUES(desconto_medio), desconto_mediano = VALUES(desconto_mediano),
       menor_preco_json = VALUES(menor_preco_json), ufs = VALUES(ufs), grupos = VALUES(grupos),
       desclassificacoes = VALUES(desclassificacoes),
       encontros = VALUES(encontros), encontros_perdidos = VALUES(encontros_perdidos)`,
    linhas
  );

  return { concorrentes: linhas.length };
}

/** Dossiê do órgão (seção 27). */
async function agregarOrgaos() {
  const [base] = await pool.query(
    `SELECT orgao_cnpj AS cnpj,
            MAX(orgao_nome) AS nome, MAX(uf) AS uf, MAX(municipio) AS municipio, MAX(esfera) AS esfera,
            COUNT(*) AS contratacoes,
            SUM(valor_estimado) AS valor_total,
            SUM(valor_homologado IS NOT NULL) AS homologadas,
            AVG(CASE WHEN valor_homologado > 0 AND valor_estimado > 0
                     THEN (valor_estimado - valor_homologado) / valor_estimado END) AS desconto_medio
       FROM licitacoes
      WHERE orgao_cnpj IS NOT NULL AND orgao_cnpj <> ''
      GROUP BY orgao_cnpj`
  );
  if (!base.length) return { orgaos: 0 };

  const cnpjs = base.map((o) => o.cnpj);

  // A modalidade e a plataforma mais usadas, pelo próprio MySQL: a contagem
  // ordenada já entrega a moda na primeira linha de cada órgão.
  const [modalidades] = await pool.query(
    `SELECT orgao_cnpj AS cnpj, modalidade, COUNT(*) AS n FROM licitacoes
      WHERE orgao_cnpj IN (?) AND modalidade IS NOT NULL
      GROUP BY orgao_cnpj, modalidade ORDER BY n DESC`,
    [cnpjs]
  );
  const [plataformas] = await pool.query(
    `SELECT orgao_cnpj AS cnpj, plataforma_disputa, COUNT(*) AS n FROM licitacoes
      WHERE orgao_cnpj IN (?) AND plataforma_disputa IS NOT NULL
      GROUP BY orgao_cnpj, plataforma_disputa ORDER BY n DESC`,
    [cnpjs]
  );
  // Perfil de exigência (seção 27.1): de quantas leituras o código apareceu.
  const [exigencias] = await pool.query(
    `SELECT l.orgao_cnpj AS cnpj, e.codigo,
            SUM(e.detectado = 'sim') AS exigiu,
            COUNT(DISTINCT e.licitacao_id) AS de
       FROM licitacao_exigencias e
       JOIN licitacoes l ON l.id = e.licitacao_id
      WHERE l.orgao_cnpj IN (?)
      GROUP BY l.orgao_cnpj, e.codigo
      HAVING exigiu > 0
      ORDER BY exigiu DESC`,
    [cnpjs]
  );
  const [fornecedores] = await pool.query(
    `SELECT l.orgao_cnpj AS cnpj, i.cnpj_vencedor, MAX(i.fornecedor_vencedor) AS nome,
            COUNT(DISTINCT i.licitacao_id) AS vezes
       FROM licitacao_itens i
       JOIN licitacoes l ON l.id = i.licitacao_id
      WHERE l.orgao_cnpj IN (?) AND i.cnpj_vencedor IS NOT NULL
      GROUP BY l.orgao_cnpj, i.cnpj_vencedor
      ORDER BY vezes DESC`,
    [cnpjs]
  );
  const [semVencedor] = await pool.query(
    `SELECT l.orgao_cnpj AS cnpj, COUNT(*) AS n
       FROM licitacao_itens i JOIN licitacoes l ON l.id = i.licitacao_id
      WHERE l.orgao_cnpj IN (?) AND i.situacao_item IN ('Deserto','Fracassado')
      GROUP BY l.orgao_cnpj`,
    [cnpjs]
  );
  const [recorrencias] = await pool.query(
    'SELECT orgao_cnpj AS cnpj, COUNT(*) AS n FROM recorrencias WHERE orgao_cnpj IN (?) GROUP BY orgao_cnpj',
    [cnpjs]
  );

  // A primeira linha de cada órgão é a moda, porque a consulta já veio
  // ordenada por contagem.
  const primeira = (linhas) => {
    const mapa = new Map();
    for (const l of linhas) if (!mapa.has(l.cnpj)) mapa.set(l.cnpj, l);
    return mapa;
  };
  const modaModalidade = primeira(modalidades);
  const modaPlataforma = primeira(plataformas);
  const porExigencia = porChave(exigencias, 'cnpj');
  const porFornecedor = porChave(fornecedores, 'cnpj');
  const porSemVencedor = new Map(semVencedor.map((s) => [s.cnpj, Number(s.n)]));
  const porRecorrencia = new Map(recorrencias.map((r) => [r.cnpj, Number(r.n)]));

  const linhas = base.map((o) => [
    o.cnpj,
    recortar(o.nome, 255),
    recortar(o.uf, 2),
    recortar(o.municipio, 120),
    recortar(o.esfera, 20),
    Number(o.contratacoes),
    Number(o.homologadas || 0),
    porSemVencedor.get(o.cnpj) || 0,
    o.desconto_medio === null ? null : Math.round(Number(o.desconto_medio) * 10000) / 10000,
    o.valor_total,
    recortar((modaModalidade.get(o.cnpj) || {}).modalidade, 60),
    recortar((modaPlataforma.get(o.cnpj) || {}).plataforma_disputa, 160),
    JSON.stringify(
      (porExigencia.get(o.cnpj) || [])
        .slice(0, 12)
        .map((e) => ({ codigo: e.codigo, exigiu: Number(e.exigiu), de: Number(e.de) }))
    ),
    JSON.stringify(
      (porFornecedor.get(o.cnpj) || [])
        .slice(0, 8)
        .map((f) => ({ nome: f.nome, cnpj: f.cnpj_vencedor, vezes: Number(f.vezes) }))
    ),
    porRecorrencia.get(o.cnpj) || 0,
  ]);

  await gravarEmLotes(
    `INSERT INTO orgaos
       (cnpj, nome, uf, municipio, esfera, contratacoes, homologadas, sem_vencedor,
        desconto_medio, valor_total, modalidade_frequente, plataforma_frequente,
        exigencias_json, fornecedores_json, recorrencias)
     VALUES {{VALORES}}
     ON DUPLICATE KEY UPDATE
       nome = VALUES(nome), uf = VALUES(uf), municipio = VALUES(municipio),
       esfera = VALUES(esfera), contratacoes = VALUES(contratacoes),
       homologadas = VALUES(homologadas), sem_vencedor = VALUES(sem_vencedor),
       desconto_medio = VALUES(desconto_medio), valor_total = VALUES(valor_total),
       modalidade_frequente = VALUES(modalidade_frequente),
       plataforma_frequente = VALUES(plataforma_frequente),
       exigencias_json = VALUES(exigencias_json),
       fornecedores_json = VALUES(fornecedores_json),
       recorrencias = VALUES(recorrencias)`,
    linhas
  );

  return { orgaos: linhas.length };
}

async function agregarDossies() {
  const c = await agregarConcorrentes();
  const o = await agregarOrgaos();
  return { ...c, ...o };
}

function registrarNaFila() {
  fila.registrar('agregar_dossies', () => agregarDossies());
}

module.exports = { agregarDossies, agregarConcorrentes, agregarOrgaos, registrarNaFila };
