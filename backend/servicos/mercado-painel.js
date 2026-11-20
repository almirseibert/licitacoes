// Painel "Mercado e concorrentes" (decisão de 20/11/2026): quatro respostas sobre o catálogo público
// (`mercado_contratos`, `mercado_atas`) filtrado pelo catálogo de segmentos — não seis cortes do mesmo
// GROUP BY. A frase e as janelas vivem em regras/mercado-painel.js; a conta do desconto, no serviço de preço.
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const pool = require('../config/db');
const { quebrar, seguro, LACUNA } = require('./declaracao');
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

// ----------------------------------------------------------------- PDF

const A4 = [595.28, 841.89];
const MARGEM = 48;
const TINTA = rgb(0.1, 0.12, 0.16);
const SUAVE = rgb(0.4, 0.45, 0.52);
const FILETE = rgb(0.82, 0.85, 0.88);

const LIMITES = { vencendo: 25, atas: 15, concorrentes: 20 };

const reais = (v) =>
  v === null || v === undefined
    ? LACUNA
    : `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const diaBr = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : LACUNA);
const pct = (v) => (v === null || v === undefined ? LACUNA : `${(Number(v) * 100).toFixed(1).replace('.', ',')}%`);
const quando = (dias) => (dias <= 0 ? 'hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`);
const local = (x) => [x.municipio, x.uf].filter(Boolean).join(' · ');

/**
 * O que o PDF diz, já formatado em texto (datas, reais, lacunas), sem desenhar nada. Pura: o teste a
 * exercita com um `painel` de exemplo. Atas: o PNCP não publica fornecedor nem valor — a lacuna fica visível.
 */
function montarRelatorio(p, { hoje = new Date().toISOString().slice(0, 10) } = {}) {
  const r = p.recorte;
  // A fonte padrão do PDF não tem o "›": o separador Área › Segmento vira " / " no papel.
  const papel = (t) => String(t).replace(/ › /g, ' / ');
  const nome = papel(regras.nomeDoRecorte(r));
  const vencendoMostrado = p.vencendo.dados.slice(0, LIMITES.vencendo);
  const atasMostradas = p.atas.dados.slice(0, LIMITES.atas);
  return {
    titulo: `Painel de mercado — ${nome}${r.uf ? ` em ${r.uf}` : ''}`,
    periodo: `Gerado em ${diaBr(hoje)} · contratos assinados nos últimos ${r.dias} dias · vencimentos nos próximos ${r.vence} dias`,
    frase: papel(p.frase),
    numeros: [
      ['Contratos', String(p.totais.contratos)],
      ['Valor contratado', reais(p.totais.valor)],
      ['Órgãos compradores', String(p.totais.orgaos)],
      ['Fornecedores', String(p.totais.fornecedores)],
      ['Desconto típico (pregão)', p.desconto ? pct(p.desconto.mediano) : LACUNA],
    ],
    compradores: p.compradores.map((c) => `${c.nome} — ${c.contratos} contrato(s) — ${reais(c.valor)}`),
    vencendo: {
      subtitulo: p.vencendo.total
        ? `${p.vencendo.total} contrato(s), ${reais(p.vencendo.valor)}, terminam nos próximos ${r.vence} dias` +
          (p.vencendo.total > vencendoMostrado.length ? `; os ${vencendoMostrado.length} que vencem primeiro:` : ':')
        : `Nenhum contrato deste recorte termina nos próximos ${r.vence} dias entre os coletados.`,
      linhas: vencendoMostrado.map((v) => [
        `${diaBr(v.vigencia_fim)} (${quando(v.dias)})`,
        [v.orgao_nome, local(v)].filter(Boolean).join(' — '),
        v.objeto || LACUNA,
        reais(v.valor_global),
        v.fornecedor_nome || LACUNA,
      ]),
    },
    atas: {
      subtitulo: p.atas.total
        ? `${p.atas.total} ata(s) vigente(s) permitem adesão (carona)` +
          (p.atas.total > atasMostradas.length ? `; as ${atasMostradas.length} que vencem primeiro:` : ':')
        : 'Nenhuma ata vigente com adesão neste recorte entre as coletadas.',
      linhas: atasMostradas.map((a) => [
        `${diaBr(a.vigencia_fim)} (${quando(a.dias)})`,
        [a.orgao_nome, local(a)].filter(Boolean).join(' — '),
        a.objeto || LACUNA,
        LACUNA, // o PNCP não publica fornecedor nem valor da ata
      ]),
    },
    concorrentes: p.concorrentes.slice(0, LIMITES.concorrentes).map((c) => [
      c.empresa || c.cnpj,
      String(c.contratos),
      reais(c.valor),
      pct(c.participacao),
      String(c.orgaos),
      c.ufs ? String(c.ufs).split(',').join(', ') : LACUNA, // com espaço, a célula pode quebrar/cortar
    ]),
    ressalva:
      'Dados públicos do PNCP, coletados para as UFs configuradas; contrato anterior à primeira coleta não aparece. O segmento sai do texto do ' +
      'objeto (dicionário de termos, sem IA) e há contratos sem assunto reconhecido. Desconto por contrato e fornecedor e valor da ata o PNCP não publica.',
  };
}

const slug = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

/** Desenha o relatório já montado (`montarRelatorio`) e devolve os bytes do PDF. Sem banco: o teste a chama direto. */
async function desenharPdf(rel) {
  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle(seguro(rel.titulo));

  let pagina = doc.addPage(A4);
  const { width, height } = pagina.getSize();
  const util = width - MARGEM * 2;
  let y = height - MARGEM;

  const novaPagina = () => {
    pagina = doc.addPage(A4);
    y = height - MARGEM;
  };
  const espaco = (altura) => {
    if (y - altura < MARGEM + 20) novaPagina();
  };
  const escrever = (texto, { tamanho = 10, fonte = normal, cor = TINTA, x = MARGEM, largura = util } = {}) => {
    for (const linha of quebrar(seguro(texto), fonte, tamanho, largura)) {
      espaco(tamanho + 4);
      if (linha) pagina.drawText(linha, { x, y, size: tamanho, font: fonte, color: cor });
      y -= tamanho + 4;
    }
  };

  // Tabela de texto: cada célula quebra em até `maxLinhas` linhas (com reticências se cortar); o cabeçalho
  // se repete ao virar de página.
  const tabela = (colunas, linhas, { tamanho = 7.5, maxLinhas = 2 } = {}) => {
    const passo = tamanho + 2.5;
    const cabecalho = () => {
      espaco(passo + 8);
      let x = MARGEM;
      for (const c of colunas) {
        const rot = seguro(c.rotulo);
        const dx = c.direita ? c.largura - 4 - negrito.widthOfTextAtSize(rot, tamanho) : 0;
        pagina.drawText(rot, { x: x + dx, y, size: tamanho, font: negrito, color: SUAVE });
        x += c.largura;
      }
      y -= 3;
      pagina.drawLine({ start: { x: MARGEM, y }, end: { x: MARGEM + util, y }, thickness: 0.5, color: FILETE });
      y -= passo;
    };
    cabecalho();
    for (const linha of linhas) {
      const celulas = linha.map((texto, i) => {
        const partes = quebrar(seguro(String(texto)), normal, tamanho, colunas[i].largura - 6);
        if (partes.length <= maxLinhas) return partes;
        const cortadas = partes.slice(0, maxLinhas);
        let ultima = cortadas[maxLinhas - 1];
        while (ultima.length > 1 && normal.widthOfTextAtSize(`${ultima}...`, tamanho) > colunas[i].largura - 6) ultima = ultima.slice(0, -1);
        cortadas[maxLinhas - 1] = `${ultima}...`;
        return cortadas;
      });
      const altura = Math.max(...celulas.map((c) => c.length)) * passo;
      if (y - altura < MARGEM + 20) {
        novaPagina();
        cabecalho();
      }
      let x = MARGEM;
      celulas.forEach((partes, i) => {
        partes.forEach((t, k) => {
          const dx = colunas[i].direita ? colunas[i].largura - 4 - normal.widthOfTextAtSize(t, tamanho) : 0;
          pagina.drawText(t, { x: x + dx, y: y - k * passo, size: tamanho, font: normal, color: TINTA });
        });
        x += colunas[i].largura;
      });
      y -= altura + 1.5;
    }
  };

  const secao = (titulo, subtitulo) => {
    y -= 12;
    espaco(46);
    escrever(titulo, { tamanho: 11.5, fonte: negrito });
    if (subtitulo) escrever(subtitulo, { tamanho: 8.5, cor: SUAVE });
  };

  escrever(rel.titulo, { tamanho: 15, fonte: negrito });
  escrever(rel.periodo, { tamanho: 8.5, cor: SUAVE });
  y -= 6;

  secao('O que está acontecendo');
  escrever(rel.frase, { tamanho: 10 });
  y -= 2;
  for (const [rotulo, valor] of rel.numeros) {
    espaco(15);
    pagina.drawText(seguro(rotulo), { x: MARGEM, y, size: 9.5, font: normal, color: SUAVE });
    pagina.drawText(seguro(valor), { x: MARGEM + 170, y, size: 9.5, font: negrito, color: TINTA });
    y -= 14;
  }
  if (rel.compradores.length) {
    y -= 4;
    escrever('Quem mais comprou no período', { tamanho: 9, fonte: negrito });
    for (const c of rel.compradores) escrever(c, { tamanho: 8.5 });
  }

  secao('Contratos que vencem — onde a próxima disputa deve aparecer', rel.vencendo.subtitulo);
  if (rel.vencendo.linhas.length) {
    tabela(
      [
        { rotulo: 'Vence', largura: 62 },
        { rotulo: 'Órgão', largura: 118 },
        { rotulo: 'Objeto', largura: 160 },
        { rotulo: 'Valor', largura: 66, direita: true },
        { rotulo: 'Fornecedor atual', largura: 93 },
      ],
      rel.vencendo.linhas
    );
  }

  secao('Atas vigentes que aceitam adesão (carona)', rel.atas.subtitulo);
  if (rel.atas.linhas.length) {
    tabela(
      [
        { rotulo: 'Vigente até', largura: 70 },
        { rotulo: 'Órgão', largura: 140 },
        { rotulo: 'Objeto', largura: 200 },
        { rotulo: 'Fornecedor / valor', largura: 89 },
      ],
      rel.atas.linhas
    );
  }

  secao('Quem vende neste recorte', 'Fornecedores por valor contratado no período, com a fatia de cada um. Só CNPJ: pessoa física não é agrupada.');
  if (rel.concorrentes.length) {
    tabela(
      [
        { rotulo: 'Empresa', largura: 190 },
        { rotulo: 'Contratos', largura: 52, direita: true },
        { rotulo: 'Valor', largura: 90, direita: true },
        { rotulo: 'Fatia', largura: 45, direita: true },
        { rotulo: 'Órgãos', largura: 45, direita: true },
        { rotulo: 'UFs', largura: 77 },
      ],
      rel.concorrentes,
      { maxLinhas: 1 }
    );
  } else {
    escrever('Nenhum fornecedor com CNPJ neste recorte.', { cor: SUAVE });
  }

  y -= 10;
  escrever(rel.ressalva, { tamanho: 7.5, cor: SUAVE });
  for (const pg of doc.getPages()) {
    pg.drawText('Gerado pelo Painel de Licitações a partir de dados públicos do PNCP.', { x: MARGEM, y: 28, size: 7, font: normal, color: SUAVE });
  }

  return Buffer.from(await doc.save());
}

/** O relatório do painel em PDF (decisão de 20/11/2026): os mesmos quatro blocos da tela, em texto e tabelas. */
async function relatorioEmPdf(organizacaoId, q = {}) {
  const dados = await painel(organizacaoId, q);
  const hoje = new Date().toISOString().slice(0, 10);
  const buffer = await desenharPdf(montarRelatorio(dados, { hoje }));
  return { buffer, nome: `relatorio-mercado-${slug(regras.nomeDoRecorte(dados.recorte))}-${hoje}.pdf`, painel: dados };
}

module.exports = { painel, recorteDe, montarRelatorio, desenharPdf, relatorioEmPdf };

