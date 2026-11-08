// Exportações (Fase 14) — o Radar em Excel e o relatório mensal.
//
// Por que Excel e não CSV: o Radar tem objeto longo, valor em real e data com
// hora, e CSV entrega os três errados — o Excel quebra a linha no ponto e vírgula
// do objeto, lê 1.234,56 como texto e inverte dia com mês. A planilha escrita
// aqui sai com os tipos certos, a primeira linha congelada e as larguras
// pensadas para ser lida sem ajustar coluna nenhuma.
const pool = require('../config/db');
const planilha = require('./planilha');

/** Data e hora como o Excel entende, pelo texto: dia de calendário em pt-BR. */
function comoDataHora(valor) {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Nome de arquivo sem acento nem caractere que o navegador recuse. */
function nomeDeArquivo(base) {
  const agora = new Date();
  const dia = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
  return `${base}-${dia}.xlsx`;
}

// As colunas do Radar exportado, na ordem em que se lê a tela: o que decide
// primeiro (pontuação, prazo, valor) à esquerda.
const COLUNAS_RADAR = [
  { titulo: 'Pontos', largura: 8, estilo: 'quantidade', ler: (l) => ({ numero: l.pontuacao, estilo: 'quantidade' }) },
  { titulo: 'Fim das propostas', largura: 18, ler: (l) => comoDataHora(l.fim_propostas) },
  { titulo: 'Valor estimado', largura: 16, ler: (l) => (l.valor_estimado === null ? null : { numero: Number(l.valor_estimado), estilo: 'dinheiro2' }) },
  { titulo: 'Objeto', largura: 70, ler: (l) => ({ texto: l.objeto || '', estilo: 'texto' }) },
  { titulo: 'Órgão', largura: 38, ler: (l) => l.orgao_nome },
  { titulo: 'UF', largura: 5, ler: (l) => l.uf },
  { titulo: 'Município', largura: 20, ler: (l) => l.municipio },
  { titulo: 'Modalidade', largura: 20, ler: (l) => l.modalidade },
  { titulo: 'Grupo', largura: 16, ler: (l) => l.grupo },
  { titulo: 'Palavra que casou', largura: 22, ler: (l) => l.palavra_casada },
  { titulo: 'Pode participar', largura: 14, ler: (l) => l.pode_participar },
  { titulo: 'Objeto social', largura: 13, ler: (l) => l.objeto_social },
  { titulo: 'Benefício ME/EPP', largura: 15, ler: (l) => l.beneficio_me },
  { titulo: 'Etapa', largura: 17, ler: (l) => l.etapa },
  { titulo: 'Abertura', largura: 18, ler: (l) => comoDataHora(l.abertura_propostas) },
  { titulo: 'Plataforma', largura: 24, ler: (l) => l.plataforma_disputa },
  { titulo: 'Prazo de questionamento', largura: 20, ler: (l) => comoDataHora(l.prazo_questionamento) },
  { titulo: 'Link do portal', largura: 46, ler: (l) => l.link_portal },
];

/**
 * O Radar em Excel, com os mesmos filtros da tela.
 *
 * `onde` e `valores` vêm montados pela rota, da mesma função que a listagem
 * usa: exportar coisa diferente do que está na tela seria a pior armadilha
 * possível aqui.
 */
async function radarEmExcel({ onde = '', valores = [], ordem, limite = 5000 } = {}) {
  const [linhas] = await pool.query(
    `SELECT l.id, l.orgao_nome, l.uf, l.municipio, l.modalidade, l.objeto, l.valor_estimado,
            l.abertura_propostas, l.fim_propostas, l.plataforma_disputa, l.link_portal,
            l.grupo, l.palavra_casada, l.pontuacao, l.pode_participar, l.objeto_social,
            l.beneficio_me, l.etapa, l.prazo_questionamento
       FROM licitacoes l
       JOIN fontes f ON f.id = l.fonte_id
       ${onde}
       ORDER BY ${ordem || 'l.pontuacao DESC, l.fim_propostas IS NULL, l.fim_propostas ASC'}
       LIMIT ?`,
    [...valores, limite]
  );

  const cabecalho = COLUNAS_RADAR.map((c) => ({ texto: c.titulo, estilo: 'cabecalho' }));
  const corpo = linhas.map((l) => COLUNAS_RADAR.map((c) => c.ler(l)));

  return {
    arquivo: nomeDeArquivo('radar-licitacoes'),
    linhas: linhas.length,
    buffer: planilha.gerar({
      nomeDaAba: 'Radar',
      larguras: COLUNAS_RADAR.map((c) => c.largura),
      linhas: [cabecalho, ...corpo],
      congelar: 1,
    }),
  };
}

/**
 * Relatório mensal (Fase 14): quantas disputei, quantas ganhei e o desconto
 * médio das minhas propostas.
 *
 * O desconto é o da **minha** proposta contra o estimado do órgão — não o
 * desconto do vencedor. São números diferentes e confundi-los faz parecer que
 * a empresa desconta mais do que desconta. Quando não há valor estimado, o mês
 * conta a disputa mas não entra na média: dividir por um estimado ausente
 * produziria desconto de 100%.
 */
async function relatorioMensal({ meses = 12 } = {}) {
  const [linhas] = await pool.query(
    `SELECT DATE_FORMAT(COALESCE(l.proposta_em, l.etapa_em, l.fim_propostas), '%Y-%m') AS mes,
            COUNT(*) AS disputei,
            SUM(l.etapa = 'Ganhamos') AS ganhei,
            SUM(l.etapa = 'Perdemos') AS perdi,
            SUM(l.etapa NOT IN ('Ganhamos','Perdemos')) AS em_andamento,
            SUM(COALESCE(l.valor_final, l.valor_proposto)) AS valor_proposto,
            SUM(CASE WHEN l.etapa = 'Ganhamos' THEN COALESCE(l.valor_final, l.valor_proposto) END) AS valor_ganho,
            -- A média é só sobre quem tem os dois números, e o CASE é o que
            -- garante isso: linha sem estimado não entra no divisor.
            AVG(CASE
                  WHEN l.valor_estimado > 0 AND COALESCE(l.valor_proposto, l.valor_final) > 0
                  THEN 1 - (COALESCE(l.valor_proposto, l.valor_final) / l.valor_estimado)
                END) AS desconto_medio,
            SUM(CASE
                  WHEN l.valor_estimado > 0 AND COALESCE(l.valor_proposto, l.valor_final) > 0
                  THEN 1 ELSE 0
                END) AS com_desconto,
            -- Proposta acima do estimado do órgão é desconto negativo, e um só
            -- registro desses derruba a média de um mês inteiro. A linha não é
            -- descartada — propor acima do estimado acontece, e às vezes ganha
            -- —, mas o mês diz quantas foram, para a média ser explicável em vez
            -- de misteriosa.
            SUM(CASE
                  WHEN l.valor_estimado > 0 AND COALESCE(l.valor_proposto, l.valor_final) > l.valor_estimado
                  THEN 1 ELSE 0
                END) AS acima_do_estimado
       FROM licitacoes l
      WHERE l.etapa IN ('Proposta enviada','Em disputa','Ganhamos','Perdemos')
        AND COALESCE(l.proposta_em, l.etapa_em, l.fim_propostas) IS NOT NULL
        AND COALESCE(l.proposta_em, l.etapa_em, l.fim_propostas) >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
      GROUP BY mes
      ORDER BY mes DESC`,
    [meses]
  );

  const numero = (v) => (v === null || v === undefined ? null : Number(v));

  const meses_linhas = linhas.map((m) => ({
    mes: m.mes,
    disputei: Number(m.disputei),
    ganhei: Number(m.ganhei),
    perdi: Number(m.perdi),
    em_andamento: Number(m.em_andamento),
    // Taxa de vitória sobre o que já teve resultado: contar o que está em
    // disputa como derrota faria o número piorar sozinho com o tempo.
    taxa_vitoria:
      Number(m.ganhei) + Number(m.perdi) > 0
        ? Math.round((Number(m.ganhei) / (Number(m.ganhei) + Number(m.perdi))) * 1000) / 1000
        : null,
    valor_proposto: numero(m.valor_proposto),
    valor_ganho: numero(m.valor_ganho),
    desconto_medio: m.desconto_medio === null ? null : Math.round(Number(m.desconto_medio) * 10000) / 10000,
    com_desconto: Number(m.com_desconto),
    acima_do_estimado: Number(m.acima_do_estimado),
  }));

  const total = meses_linhas.reduce(
    (acc, m) => ({
      disputei: acc.disputei + m.disputei,
      ganhei: acc.ganhei + m.ganhei,
      perdi: acc.perdi + m.perdi,
      valor_ganho: acc.valor_ganho + (m.valor_ganho || 0),
    }),
    { disputei: 0, ganhei: 0, perdi: 0, valor_ganho: 0 }
  );

  // Somar ponto flutuante acumula resto: três valores que terminam em centavos
  // somam 110427.70999999999, e esse número ia cru para a célula da planilha e
  // para o JSON da tela. Dinheiro se arredonda no centavo.
  total.valor_ganho = Math.round(total.valor_ganho * 100) / 100;

  return {
    meses: meses_linhas,
    total: {
      ...total,
      taxa_vitoria:
        total.ganhei + total.perdi > 0
          ? Math.round((total.ganhei / (total.ganhei + total.perdi)) * 1000) / 1000
          : null,
    },
    ressalva:
      'O desconto é o da sua proposta contra o valor estimado do órgão, e a média só inclui as ' +
      'licitações que têm os dois números. Meses em que você não registrou valor proposto contam ' +
      'a disputa, mas não entram na média. Proposta acima do estimado entra como desconto ' +
      'negativo, e o mês diz quantas foram: uma só derruba a média de um mês com poucas disputas.',
  };
}

const COLUNAS_RELATORIO = [
  { titulo: 'Mês', largura: 10, ler: (m) => m.mes },
  { titulo: 'Disputei', largura: 10, ler: (m) => ({ numero: m.disputei, estilo: 'quantidade' }) },
  { titulo: 'Ganhei', largura: 9, ler: (m) => ({ numero: m.ganhei, estilo: 'quantidade' }) },
  { titulo: 'Perdi', largura: 9, ler: (m) => ({ numero: m.perdi, estilo: 'quantidade' }) },
  { titulo: 'Em andamento', largura: 13, ler: (m) => ({ numero: m.em_andamento, estilo: 'quantidade' }) },
  { titulo: 'Taxa de vitória', largura: 14, ler: (m) => (m.taxa_vitoria === null ? null : `${(m.taxa_vitoria * 100).toFixed(1)}%`) },
  { titulo: 'Valor proposto', largura: 17, ler: (m) => (m.valor_proposto === null ? null : { numero: m.valor_proposto, estilo: 'dinheiro2' }) },
  { titulo: 'Valor ganho', largura: 17, ler: (m) => (m.valor_ganho === null ? null : { numero: m.valor_ganho, estilo: 'dinheiro2' }) },
  { titulo: 'Desconto médio', largura: 15, ler: (m) => (m.desconto_medio === null ? null : `${(m.desconto_medio * 100).toFixed(2)}%`) },
  { titulo: 'Com desconto apurado', largura: 20, ler: (m) => ({ numero: m.com_desconto, estilo: 'quantidade' }) },
  { titulo: 'Acima do estimado', largura: 17, ler: (m) => ({ numero: m.acima_do_estimado, estilo: 'quantidade' }) },
];

/** O mesmo relatório em Excel. */
async function relatorioEmExcel({ meses = 12 } = {}) {
  const r = await relatorioMensal({ meses });

  const cabecalho = COLUNAS_RELATORIO.map((c) => ({ texto: c.titulo, estilo: 'cabecalho' }));
  const corpo = r.meses.map((m) => COLUNAS_RELATORIO.map((c) => c.ler(m)));

  const rodape = [
    { texto: 'Total', estilo: 'negrito' },
    { numero: r.total.disputei, estilo: 'total' },
    { numero: r.total.ganhei, estilo: 'total' },
    { numero: r.total.perdi, estilo: 'total' },
    null,
    r.total.taxa_vitoria === null ? null : { texto: `${(r.total.taxa_vitoria * 100).toFixed(1)}%`, estilo: 'negrito' },
    null,
    { numero: r.total.valor_ganho, estilo: 'total' },
  ];

  return {
    arquivo: nomeDeArquivo('relatorio-mensal'),
    linhas: r.meses.length,
    dados: r,
    buffer: planilha.gerar({
      nomeDaAba: 'Relatório mensal',
      larguras: COLUNAS_RELATORIO.map((c) => c.largura),
      linhas: [cabecalho, ...corpo, [], rodape, [], [{ texto: r.ressalva, estilo: 'texto' }]],
      congelar: 1,
    }),
  };
}

module.exports = { radarEmExcel, relatorioMensal, relatorioEmExcel, nomeDeArquivo, COLUNAS_RADAR };
