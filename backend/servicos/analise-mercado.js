// Concorrentes, histórico e mercado (Seção 13 do PLANO_SAAS_CONLICITACAO.md).
//
// Lê o catálogo público do mercado (`mercado_contratos`, `mercado_atas`, Seção
// 12) e as decisões da organização. O catálogo não tem organizacao_id; o que é
// da organização (segmento = palavras-chave, filtro salvo, o próprio histórico)
// sempre entra filtrado por ela.
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const pool = require('../config/db');
const { daOrganizacao } = require('./escopo');
const { quebrar, seguro, LACUNA } = require('./declaracao');
const diagnostico = require('./diagnostico');
const mercado = require('../regras/mercado');
const regras = require('../regras/analise-mercado');

const TOPO = 10;
// CPF chega mascarado do PNCP (***123456**): pessoas diferentes dividem a
// máscara, então agrupar por ele juntaria gente que não é a mesma empresa.
const SO_CNPJ = 'CHAR_LENGTH(a.fornecedor_ni) = 14';

const numero = (v) => (v === null || v === undefined ? null : Number(v));

/**
 * O segmento da análise, sempre da organização que pergunta:
 *   - `segmento` = um grupo das palavras-chave dela;
 *   - `filtro`   = um filtro salvo ("Meus filtros", `perfis_busca`).
 * Nenhum dos dois = o mercado inteiro (só os filtros da tela). Pedido de
 * segmento que não existe para ela vira lista vazia, nunca "sem filtro".
 */
async function resolverSegmento(organizacaoId, q = {}, { termosPadrao = null } = {}) {
  const condicoes = [];
  const valores = [];
  const idFiltro = Number.parseInt(q.filtro, 10);

  if (Number.isFinite(idFiltro)) {
    const [[perfil]] = await pool.query(
      `SELECT nome, palavras, exclusoes, ufs, municipios, modalidades, valor_minimo, valor_maximo
         FROM perfis_busca WHERE id = ? AND organizacao_id = ? AND origem = 'boletim'`,
      [idFiltro, organizacaoId]
    );
    if (!perfil) return { nome: null, termos: [], condicoes: ['1 = 0'], valores: [] };
    const termos = regras.condicaoDeTermos(regras.listaJson(perfil.palavras));
    condicoes.push(termos.sql);
    valores.push(...termos.valores);
    for (const excluida of regras.listaJson(perfil.exclusoes).filter(Boolean)) {
      condicoes.push('a.objeto NOT LIKE ?');
      valores.push(mercado.like(excluida));
    }
    const ufs = regras.listaJson(perfil.ufs).filter((u) => /^[A-Za-z]{2}$/.test(u));
    if (ufs.length) {
      condicoes.push(`a.uf IN (${ufs.map(() => '?').join(',')})`);
      valores.push(...ufs.map((u) => u.toUpperCase()));
    }
    // Mesma regra do boletim (regras/boletim.js, `casar`): município por nome
    // inteiro, modalidade por trecho ("Pregão" pega o eletrônico e o presencial).
    const municipios = regras.listaJson(perfil.municipios).filter(Boolean);
    if (municipios.length) {
      condicoes.push(`a.municipio IN (${municipios.map(() => '?').join(',')})`);
      valores.push(...municipios);
    }
    const modalidades = regras.listaJson(perfil.modalidades).filter(Boolean);
    if (modalidades.length) {
      condicoes.push(`(${modalidades.map(() => 'a.modalidade LIKE ?').join(' OR ')})`);
      valores.push(...modalidades.map(mercado.like));
    }
    // Faixa de valor: só vale para contrato. A ata não publica valor (NULL), e
    // aplicar a faixa nela zeraria a contagem de atas.
    const soContratos = { condicoes: [], valores: [] };
    if (perfil.valor_minimo !== null) {
      soContratos.condicoes.push('a.valor_global >= ?');
      soContratos.valores.push(perfil.valor_minimo);
    }
    if (perfil.valor_maximo !== null) {
      soContratos.condicoes.push('a.valor_global <= ?');
      soContratos.valores.push(perfil.valor_maximo);
    }
    return { nome: perfil.nome, origem: 'filtro', termos: termos.termos, condicoes, valores, soContratos };
  }

  if (typeof q.segmento === 'string' && q.segmento.trim()) {
    const [linhas] = await pool.query(
      'SELECT termo FROM palavras_chave WHERE organizacao_id = ? AND grupo = ? AND ativa = 1',
      [organizacaoId, q.segmento.trim()]
    );
    const termos = regras.condicaoDeTermos(linhas.map((l) => l.termo));
    return { nome: q.segmento.trim(), origem: 'segmento', termos: termos.termos, condicoes: [termos.sql], valores: termos.valores };
  }

  // Sem segmento: os recorrentes usam todas as palavras da organização; a análise, o mercado inteiro.
  if (termosPadrao) {
    const termos = regras.condicaoDeTermos(termosPadrao);
    return { nome: 'Todas as palavras-chave', origem: 'palavras', termos: termos.termos, condicoes: [termos.sql], valores: termos.valores };
  }
  return { nome: null, origem: null, termos: [], condicoes: [], valores: [] };
}

/** Segmentos (grupos de palavra-chave) e filtros salvos da organização, para o seletor. */
async function opcoes(organizacaoId) {
  const [[segmentos], [filtros]] = await Promise.all([
    pool.query(
      `SELECT grupo AS nome, COUNT(*) AS termos FROM palavras_chave
        WHERE organizacao_id = ? AND ativa = 1 GROUP BY grupo ORDER BY grupo`,
      [organizacaoId]
    ),
    // Só os "Meus filtros" do boletim: o filtro salvo do Radar guarda outra forma (`filtros`).
    pool.query("SELECT id, nome FROM perfis_busca WHERE organizacao_id = ? AND origem = 'boletim' ORDER BY nome", [
      organizacaoId,
    ]),
  ]);
  return { segmentos, filtros };
}

/** Filtros da tela + período + segmento (já resolvido) → WHERE com apelido `a`. */
function montarOnde(q, segmento, { tipo = 'contratos', padrao = regras.DIAS_PADRAO } = {}) {
  const periodo = regras.periodoPedido(q, { hoje: mercado.hojeEmBrasilia(), padrao });
  const { condicoes, valores } = mercado.montarFiltros(tipo, { ...q, de: periodo.de, ate: periodo.ate });
  condicoes.push(...segmento.condicoes);
  valores.push(...segmento.valores);
  if (tipo === 'contratos' && segmento.soContratos) {
    condicoes.push(...segmento.soContratos.condicoes);
    valores.push(...segmento.soContratos.valores);
  }
  return { periodo, onde: `WHERE ${condicoes.join(' AND ')}`, valores };
}

const agrupado = (linhas) =>
  linhas.map((l) => ({ ...l, quantidade: Number(l.quantidade), valor: numero(l.valor) || 0 }));

/**
 * Análise de mercado: compras por mês, região, modalidade, órgão, fornecedor e
 * produto (termo do segmento e, quando o edital foi lido, item), no período e
 * no segmento pedidos. Tudo de `mercado_contratos` — o contrato é o fato da
 * compra; a ata entra só na contagem (não publica valor nem fornecedor).
 */
async function analisar(organizacaoId, q = {}) {
  const segmento = await resolverSegmento(organizacaoId, q);
  const { periodo, onde, valores } = montarOnde(q, segmento);
  const atasOnde = montarOnde(q, segmento, { tipo: 'atas' });
  const de = `FROM mercado_contratos a ${onde}`;

  const porTermo = segmento.termos.length
    ? `SELECT ${segmento.termos
        .map((_, i) => `SUM(a.objeto REGEXP ?) AS q${i}, SUM(CASE WHEN a.objeto REGEXP ? THEN a.valor_global END) AS v${i}`)
        .join(', ')} ${de}`
    : null;
  const valoresTermo = segmento.termos.flatMap((t) => [regras.padraoDePalavra(t), regras.padraoDePalavra(t)]);

  const [
    [[totais]], [porMes], [porMunicipio], [porModalidade], [porOrgao], [porFornecedor], [[atas]], termos, [itens],
  ] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS contratos, SUM(a.valor_global) AS valor, COUNT(DISTINCT a.orgao_cnpj) AS orgaos,
              COUNT(DISTINCT a.fornecedor_ni) AS fornecedores, SUM(a.valor_global IS NULL) AS sem_valor ${de}`,
      valores
    ),
    pool.query(
      `SELECT DATE_FORMAT(a.data_assinatura, '%Y-%m') AS mes, COUNT(*) AS quantidade, SUM(a.valor_global) AS valor
         ${de} GROUP BY mes ORDER BY mes`,
      valores
    ),
    pool.query(
      `SELECT a.municipio AS rotulo, a.uf, COUNT(*) AS quantidade, SUM(a.valor_global) AS valor
         ${de} AND a.municipio IS NOT NULL GROUP BY a.municipio, a.uf ORDER BY valor DESC LIMIT ${TOPO}`,
      valores
    ),
    pool.query(
      `SELECT COALESCE(a.modalidade, '${LACUNA}') AS rotulo, COUNT(*) AS quantidade, SUM(a.valor_global) AS valor
         ${de} GROUP BY rotulo ORDER BY valor DESC`,
      valores
    ),
    pool.query(
      `SELECT a.orgao_cnpj AS chave, MAX(a.orgao_nome) AS rotulo, COUNT(*) AS quantidade, SUM(a.valor_global) AS valor
         ${de} GROUP BY a.orgao_cnpj ORDER BY valor DESC LIMIT ${TOPO}`,
      valores
    ),
    pool.query(
      `SELECT a.fornecedor_ni AS chave, MAX(a.fornecedor_nome) AS rotulo, COUNT(*) AS quantidade, SUM(a.valor_global) AS valor
         ${de} AND ${SO_CNPJ} GROUP BY a.fornecedor_ni ORDER BY valor DESC LIMIT ${TOPO}`,
      valores
    ),
    pool.query(`SELECT COUNT(*) AS atas FROM mercado_atas a ${atasOnde.onde}`, atasOnde.valores),
    porTermo ? pool.query(porTermo, [...valoresTermo, ...valores]) : Promise.resolve([[{}]]),
    // Sem termo, o "produto" vem dos itens dos editais que o painel leu
    // (licitacao_itens): uma vez por item de edital, mesmo que a compra tenha
    // virado vários contratos. Com termo, a tela usa o "por termo" e isto não roda.
    segmento.termos.length
      ? Promise.resolve([[]])
      : pool.query(
          `SELECT i.descricao AS rotulo, COUNT(DISTINCT l.id) AS quantidade, SUM(i.valor_total_estimado) AS valor
             FROM licitacao_itens i
             JOIN licitacoes l ON l.id = i.licitacao_id
            WHERE l.numero_controle IN (SELECT a.numero_controle_compra ${de})
            GROUP BY i.descricao ORDER BY quantidade DESC, valor DESC LIMIT ${TOPO}`,
          valores
        ),
  ]);

  const linhaTermo = termos[0][0] || {};
  const contratos = Number(totais.contratos || 0);
  return {
    periodo,
    segmento: { nome: segmento.nome, origem: segmento.origem, termos: segmento.termos },
    totais: {
      contratos,
      valor: numero(totais.valor) || 0,
      orgaos: Number(totais.orgaos || 0),
      fornecedores: Number(totais.fornecedores || 0),
      sem_valor: Number(totais.sem_valor || 0),
      ticket_medio: contratos ? Math.round((Number(totais.valor || 0) / contratos) * 100) / 100 : null,
      atas: Number(atas.atas || 0),
    },
    por_mes: agrupado(porMes),
    por_municipio: agrupado(porMunicipio),
    por_modalidade: agrupado(porModalidade),
    por_orgao: agrupado(porOrgao),
    por_fornecedor: agrupado(porFornecedor),
    por_termo: segmento.termos
      .map((termo, i) => ({ rotulo: termo, quantidade: Number(linhaTermo[`q${i}`] || 0), valor: numero(linhaTermo[`v${i}`]) || 0 }))
      .sort((a, b) => b.quantidade - a.quantidade || b.valor - a.valor),
    por_item: agrupado(itens),
    ressalva:
      'Contratos publicados no PNCP. A busca do PNCP alcança cerca de 16 dias de contratos de RS; ' +
      'meses anteriores à primeira coleta têm só o que foi republicado nesse intervalo. ' +
      'O termo casa por palavra inteira, com plural ("monitor" acha "monitores", não "monitoramento").',
  };
}

/**
 * Concorrentes recorrentes nos meus segmentos: quem mais assinou contrato
 * cujo objeto casa com as palavras-chave da organização (todas, ou de um
 * grupo), no período. Fica de fora o próprio CNPJ da organização.
 */
async function recorrentes(organizacaoId, q = {}) {
  let termosPadrao = null;
  if (!q.segmento && !q.filtro) {
    const [linhas] = await pool.query('SELECT termo FROM palavras_chave WHERE organizacao_id = ? AND ativa = 1', [organizacaoId]);
    termosPadrao = linhas.map((l) => l.termo);
  }
  const segmento = await resolverSegmento(organizacaoId, q, { termosPadrao });
  // Janela em dias até hoje (de Brasília): a tela manda só o tamanho.
  const dias = regras.JANELAS_RECORRENTES.includes(Number(q.dias)) ? Number(q.dias) : regras.DIAS_RECORRENTES;
  const { periodo, onde, valores } = montarOnde({ ...q, de: undefined, ate: undefined, mes: undefined }, segmento, { padrao: dias });

  const [[org]] = await pool.query('SELECT cnpj FROM organizacoes WHERE id = ?', [organizacaoId]);
  const proprio = String((org && org.cnpj) || '').replace(/\D/g, '');
  const minimo = Math.min(Math.max(Number.parseInt(q.minimo, 10) || 2, 1), 50);

  const [linhas] = await pool.query(
    `SELECT a.fornecedor_ni AS cnpj, MAX(a.fornecedor_nome) AS empresa, COUNT(*) AS contratos,
            SUM(a.valor_global) AS valor, COUNT(DISTINCT a.orgao_cnpj) AS orgaos,
            GROUP_CONCAT(DISTINCT a.uf ORDER BY a.uf) AS ufs, MAX(a.data_assinatura) AS ultimo,
            EXISTS (SELECT 1 FROM concorrentes c WHERE c.cnpj = a.fornecedor_ni) AS no_dossie
       FROM mercado_contratos a ${onde} AND ${SO_CNPJ} AND a.fornecedor_ni <> ?
      GROUP BY a.fornecedor_ni
     HAVING contratos >= ?
      ORDER BY contratos DESC, valor DESC
      LIMIT 50`,
    [...valores, proprio, minimo]
  );

  return {
    periodo,
    segmento: { nome: segmento.nome, termos: segmento.termos },
    minimo,
    dados: linhas.map((l) => ({
      ...l,
      contratos: Number(l.contratos),
      orgaos: Number(l.orgaos),
      valor: numero(l.valor) || 0,
      no_dossie: Boolean(Number(l.no_dossie)),
    })),
  };
}

/**
 * Perfil por CNPJ no mercado: contratos assinados (PNCP), por UF, modalidade e
 * órgão, e os itens vencidos que o painel conhece. Disputas perdidas e
 * desclassificações não são públicas — a resposta diz isso no campo.
 */
async function perfilNoMercado(cnpjPedido) {
  const cnpj = String(cnpjPedido || '').replace(/\D/g, '');
  if (cnpj.length !== 14) return null;
  const onde = 'FROM mercado_contratos a WHERE a.fornecedor_ni = ? AND a.cancelado = 0';

  const [[[totais]], [porUf], [porModalidade], [porOrgao], [recentes], [[itens]]] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS contratos, COUNT(DISTINCT a.numero_controle_compra) AS compras, SUM(a.valor_global) AS valor,
              MAX(a.fornecedor_nome) AS empresa, MIN(a.data_assinatura) AS primeiro, MAX(a.data_assinatura) AS ultimo ${onde}`,
      [cnpj]
    ),
    pool.query(`SELECT a.uf AS rotulo, COUNT(*) AS quantidade, SUM(a.valor_global) AS valor ${onde} GROUP BY a.uf ORDER BY valor DESC`, [cnpj]),
    pool.query(
      `SELECT COALESCE(a.modalidade, '${LACUNA}') AS rotulo, COUNT(*) AS quantidade, SUM(a.valor_global) AS valor
         ${onde} GROUP BY rotulo ORDER BY valor DESC`,
      [cnpj]
    ),
    pool.query(
      `SELECT a.orgao_cnpj AS chave, MAX(a.orgao_nome) AS rotulo, COUNT(*) AS quantidade, SUM(a.valor_global) AS valor
         ${onde} GROUP BY a.orgao_cnpj ORDER BY valor DESC LIMIT ${TOPO}`,
      [cnpj]
    ),
    pool.query(
      `SELECT a.numero_controle, a.orgao_nome, a.municipio, a.uf, a.modalidade, a.objeto, a.valor_global,
              a.data_assinatura, a.vigencia_fim ${onde} ORDER BY a.data_assinatura DESC LIMIT 15`,
      [cnpj]
    ),
    // `propostas_concorrentes` só tem o vencedor homologado (origem 'pncp');
    // a lista de quem disputou e perdeu viria do Compras.gov.br (CAPTCHA).
    pool.query(
      `SELECT COUNT(DISTINCT p.licitacao_id) AS licitacoes_vencidas, COUNT(*) AS itens_vencidos,
              SUM(COALESCE(p.valor_negociado, p.valor_ofertado)) AS valor_itens,
              SUM(p.origem <> 'pncp') AS linhas_de_lista
         FROM propostas_concorrentes p WHERE p.cnpj = ?`,
      [cnpj]
    ),
  ]);

  const listaCompleta = Number(itens.linhas_de_lista || 0) > 0;
  return {
    cnpj,
    empresa: totais.empresa || null,
    contratos: Number(totais.contratos || 0),
    vencidas: Number(totais.compras || 0),
    valor_ganho: numero(totais.valor) || 0,
    primeiro: totais.primeiro,
    ultimo: totais.ultimo,
    por_uf: agrupado(porUf),
    por_modalidade: agrupado(porModalidade),
    por_orgao: agrupado(porOrgao),
    recentes: recentes.map((r) => ({ ...r, valor_global: numero(r.valor_global) })),
    itens: {
      licitacoes_vencidas: Number(itens.licitacoes_vencidas || 0),
      vencidos: Number(itens.itens_vencidos || 0),
      valor: numero(itens.valor_itens) || 0,
      // Sem a lista de propostas, "não vencidos" é desconhecido — não zero.
      nao_vencidos: null,
      lista_completa: listaCompleta,
      nota: listaCompleta
        ? null
        : 'O PNCP publica só o vencedor de cada item. Disputas e itens perdidos ficam na lista de propostas do portal de disputa.',
    },
    disputas: null,
    desclassificacao: regras.DESCLASSIFICACAO,
  };
}

/**
 * Meu histórico: as licitações que a organização levou até "Perdemos", com o
 * motivo que dá para afirmar e a recomendação; e, ao lado, os bloqueios que o
 * diagnóstico de descarte (seção 20) já ranqueia.
 */
async function historicoDePerdas(organizacaoId, { meses = 12 } = {}) {
  const [linhas] = await pool.query(
    `SELECT l.id, l.objeto, l.orgao_nome, l.uf, l.modalidade, l.valor_estimado, l.valor_proposto,
            l.valor_final, l.vencedor, l.cnpj_vencedor, l.beneficio_me, l.etapa, l.etapa_em
       FROM ${daOrganizacao(organizacaoId)} l
      WHERE l.etapa IN ('Ganhamos','Perdemos')
        AND COALESCE(l.etapa_em, l.fim_propostas) >= DATE_SUB(NOW(), INTERVAL ? MONTH)
      ORDER BY l.etapa_em DESC`,
    [meses]
  );
  const perdas = linhas
    .filter((l) => l.etapa === 'Perdemos')
    .map((l) => ({
      ...l,
      valor_estimado: numero(l.valor_estimado),
      valor_proposto: numero(l.valor_proposto),
      valor_final: numero(l.valor_final),
      ...regras.motivoDaPerda(l),
    }));
  const ganhas = linhas.length - perdas.length;

  // Quem mais venceu a organização: o primeiro nome da lista de dossiês.
  const porVencedor = new Map();
  for (const p of perdas) {
    if (!p.cnpj_vencedor && !p.vencedor) continue;
    const chave = p.cnpj_vencedor || p.vencedor;
    const atual = porVencedor.get(chave) || { cnpj: p.cnpj_vencedor, empresa: p.vencedor, vezes: 0 };
    atual.vezes += 1;
    porVencedor.set(chave, atual);
  }

  const { motivos, principal } = regras.resumirPerdas(perdas);
  const descartes = await diagnostico.diagnosticar({ organizacaoId, dias: 90 });
  return {
    meses,
    total: { disputadas: linhas.length, ganhas, perdidas: perdas.length, taxa_vitoria: linhas.length ? ganhas / linhas.length : null },
    motivos,
    principal,
    quem_mais_venceu: [...porVencedor.values()].sort((a, b) => b.vezes - a.vezes).slice(0, 5),
    perdas: perdas.slice(0, 50),
    bloqueios: descartes.bloqueios.slice(0, 3).map((b) => ({
      rotulo: b.rotulo, licitacoes: b.licitacoes, valor: b.valor, resolver: b.resolver, custo_rotulo: b.custo_rotulo,
    })),
    desclassificacao: regras.DESCLASSIFICACAO,
  };
}

// ----------------------------------------------------------------- PDF

const A4 = [595.28, 841.89];
const MARGEM = 48;
const TINTA = rgb(0.1, 0.12, 0.16);
const SUAVE = rgb(0.4, 0.45, 0.52);
const BARRA = rgb(0.055, 0.455, 0.565); // #0E7490, a voltagem do tema claro

const reais = (v) =>
  v === null || v === undefined
    ? LACUNA
    : `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const diaBr = (d) => (d ? String(d).split('-').reverse().join('/') : LACUNA);

/**
 * Relatório mensal por segmento em PDF: os números da análise, com barras de
 * uma cor só (uma série por bloco, rótulo e valor em texto ao lado — a cor
 * nunca carrega sozinha o que a barra diz).
 */
async function relatorioEmPdf(organizacaoId, q = {}) {
  const r = await analisar(organizacaoId, q);
  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const titulo = `Relatório de mercado — ${r.segmento.nome || 'mercado inteiro'}`;
  doc.setTitle(seguro(titulo));

  let pagina = doc.addPage(A4);
  const { width, height } = pagina.getSize();
  const util = width - MARGEM * 2;
  let y = height - MARGEM;

  const espaco = (altura) => {
    if (y - altura < MARGEM + 20) {
      pagina = doc.addPage(A4);
      y = height - MARGEM;
    }
  };
  const escrever = (texto, { tamanho = 10, fonte = normal, cor = TINTA, x = MARGEM, largura = util } = {}) => {
    for (const linha of quebrar(texto, fonte, tamanho, largura)) {
      espaco(tamanho + 4);
      if (linha) pagina.drawText(linha, { x, y, size: tamanho, font: fonte, color: cor });
      y -= tamanho + 4;
    }
  };

  escrever(titulo, { tamanho: 15, fonte: negrito });
  escrever(`Período: ${diaBr(r.periodo.de)} a ${diaBr(r.periodo.ate)}`, { cor: SUAVE });
  if (r.segmento.termos.length) escrever(`Termos: ${r.segmento.termos.join(', ')}`, { tamanho: 8.5, cor: SUAVE });
  y -= 8;

  const t = r.totais;
  for (const [rotulo, valor] of [
    ['Contratos', String(t.contratos)],
    ['Valor contratado', reais(t.valor)],
    ['Ticket médio', t.ticket_medio === null ? LACUNA : reais(t.ticket_medio)],
    ['Órgãos compradores', String(t.orgaos)],
    ['Fornecedores', String(t.fornecedores)],
    ['Atas de registro de preços', String(t.atas)],
  ]) {
    espaco(16);
    pagina.drawText(seguro(rotulo), { x: MARGEM, y, size: 10, font: normal, color: SUAVE });
    pagina.drawText(seguro(valor), { x: MARGEM + 180, y, size: 10, font: negrito, color: TINTA });
    y -= 15;
  }

  const bloco = (tituloBloco, linhas, rotuloDe = (l) => l.rotulo) => {
    y -= 10;
    espaco(40);
    escrever(tituloBloco, { tamanho: 11.5, fonte: negrito });
    if (!linhas.length) {
      escrever('Nada no período.', { cor: SUAVE });
      return;
    }
    const maximo = Math.max(...linhas.map((l) => l.valor || 0), 1);
    for (const l of linhas) {
      espaco(26);
      const rotulo = seguro(String(rotuloDe(l) || LACUNA)).slice(0, 70);
      pagina.drawText(rotulo, { x: MARGEM, y, size: 8.5, font: normal, color: TINTA });
      const valor = seguro(`${l.quantidade} · ${reais(l.valor)}`);
      pagina.drawText(valor, { x: width - MARGEM - normal.widthOfTextAtSize(valor, 8.5), y, size: 8.5, font: normal, color: SUAVE });
      y -= 9;
      pagina.drawRectangle({ x: MARGEM, y, width: Math.max(1, (util * (l.valor || 0)) / maximo), height: 4, color: BARRA });
      y -= 12;
    }
  };

  bloco('Compras por mês', r.por_mes, (l) => l.mes.split('-').reverse().join('/'));
  bloco('Por modalidade', r.por_modalidade);
  bloco('Por região (município)', r.por_municipio, (l) => `${l.rotulo}/${l.uf}`);
  bloco('Órgãos que mais compraram', r.por_orgao);
  bloco('Fornecedores que mais venderam', r.por_fornecedor);
  if (r.por_termo.length) bloco('Por produto (termo do segmento)', r.por_termo);

  y -= 12;
  escrever(r.ressalva, { tamanho: 7.5, cor: SUAVE });
  for (const p of doc.getPages()) {
    p.drawText('Gerado pelo Painel de Licitações a partir de dados públicos do PNCP.', {
      x: MARGEM, y: 28, size: 7, font: normal, color: SUAVE,
    });
  }
  return { buffer: Buffer.from(await doc.save()), analise: r };
}

module.exports = { analisar, recorrentes, perfilNoMercado, historicoDePerdas, relatorioEmPdf, opcoes };
