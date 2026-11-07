// Job `detectar_recorrencias` (seção 24) — o calendário do ano.
//
// Órgão público repete contratação. Hospedagem, rastreamento, manutenção,
// material de informática: quase tudo é anual e cai quase sempre no mesmo mês,
// porque segue o ciclo orçamentário. Quem sabe disso chega preparado; quem não
// sabe descobre com três dias de prazo.
//
// A data usada é a de encerramento quando existe e a de publicação quando não
// existe: a busca do PNCP só traz o encerramento em parte dos registros, e o
// que o calendário quer saber é em que mês do ciclo orçamentário o órgão
// compra — para isso a publicação serve igual.
//
// A detecção é conservadora de propósito. Com menos de duas ocorrências do
// mesmo par órgão + objeto em anos diferentes, não se cria linha nenhuma —
// prever a partir de uma compra é adivinhação, e adivinhação na tela vira
// desconfiança em tudo o mais que o painel diz.
const pool = require('../config/db');
const fila = require('../servicos/fila');
const alertas = require('../servicos/alertas');
const similaridade = require('../regras/similaridade');

// A confiança da seção 24.3, por número de ocorrências.
const CONFIANCA = { 2: 0.5, 3: 0.8 };
const CONFIANCA_MAXIMA = 0.95;

// Quantos anos para trás. O ciclo é anual, então três anos dão duas janelas de
// comparação — o mínimo para a regra das "duas ocorrências em anos diferentes".
const ANOS = 4;

// Alertas de 60 e 30 dias antes da janela prevista (seção 24.4).
const MARCOS_DIAS = [60, 30];

function recortar(valor, tamanho) {
  if (valor === null || valor === undefined) return null;
  return String(valor).slice(0, tamanho);
}

function confiancaDe(ocorrencias) {
  return CONFIANCA[ocorrencias] || CONFIANCA_MAXIMA;
}

function mediana(lista) {
  if (!lista.length) return null;
  const ordenada = [...lista].sort((a, b) => a - b);
  const meio = Math.floor(ordenada.length / 2);
  return ordenada.length % 2 ? ordenada[meio] : (ordenada[meio - 1] + ordenada[meio]) / 2;
}

/**
 * O mês típico é a moda, não a média: contratação de março e de abril tem
 * média em março e meio, que não é mês nenhum. Empate fica com o mais
 * recente, que é o que a prática atual do órgão indica.
 */
function mesTipico(datas) {
  const contagem = new Map();
  for (const data of datas) {
    const mes = new Date(data).getMonth() + 1;
    contagem.set(mes, (contagem.get(mes) || 0) + 1);
  }
  let melhor = null;
  for (const [mes, n] of contagem) {
    if (!melhor || n > melhor.n) melhor = { mes, n };
  }
  if (!melhor) return null;

  const empatados = [...contagem.entries()].filter(([, n]) => n === melhor.n).map(([m]) => m);
  if (empatados.length === 1) return melhor.mes;
  const ultima = new Date(datas[datas.length - 1]).getMonth() + 1;
  return empatados.includes(ultima) ? ultima : empatados[empatados.length - 1];
}

/**
 * A próxima janela prevista: a última ocorrência mais o intervalo medido.
 * Enquanto a data cair no passado, soma outro intervalo — órgão que não abriu
 * este ano ainda vai abrir no que vem, e a previsão tem de apontar para a
 * frente para servir de alerta.
 */
// Abaixo disto não é recorrência: é a mesma contratação aparecendo partida em
// lotes ou republicada na semana seguinte. Acima, é compra mensal de verdade —
// e órgão que compra material de higiene todo mês é previsão boa, não ruído.
const INTERVALO_MINIMO_DIAS = 25;

function proximaPrevista(ultima, intervaloDias) {
  if (!ultima || !intervaloDias || intervaloDias < INTERVALO_MINIMO_DIAS) return null;

  const data = new Date(ultima);
  const hoje = new Date();

  // Sempre ao menos um intervalo adiante. Sem isto, contratação cuja última
  // ocorrência ainda está no futuro teria como "próxima" ela mesma, e o
  // calendário anunciaria como previsão uma licitação que já está aberta.
  let voltas = 0;
  do {
    data.setDate(data.getDate() + intervaloDias);
    voltas += 1;
  } while (data <= hoje && voltas < 10);

  return data > hoje ? data.toISOString().slice(0, 10) : null;
}

/**
 * Agrupa as contratações de um órgão por objeto semelhante.
 *
 * Agrupar por assinatura idêntica perderia metade dos casos: o mesmo contrato
 * escrito em dois anos quase nunca sai com as mesmas oito palavras. O
 * agrupamento é por similaridade (seção 24.3, Dice ≥ 0,70), e o representante
 * do grupo é a primeira assinatura vista — basta ser estável.
 */
function agrupar(contratacoes) {
  const grupos = [];
  for (const c of contratacoes) {
    if (!c.assinatura_objeto) continue;
    const grupo = grupos.find((g) => similaridade.mesmoObjeto(g.assinatura, c.assinatura_objeto));
    if (grupo) grupo.itens.push(c);
    else grupos.push({ assinatura: c.assinatura_objeto, itens: [c] });
  }
  return grupos;
}

/**
 * Varre a base e (re)calcula as recorrências.
 * Idempotente: roda de novo e os números só se corrigem.
 */
async function detectarRecorrencias({ anos = ANOS } = {}) {
  // As duas origens juntas: a amostra de encerradas tem histórico (2023 em
  // diante) e o radar tem o que está aberto agora. Recorrência que só aparece
  // numa das duas é recorrência pela metade.
  const [contratacoes] = await pool.query(
    `SELECT orgao_cnpj, orgao_nome, uf, grupo, objeto, assinatura_objeto,
            valor_estimado, valor_homologado, desconto,
            COALESCE(encerrada_em, publicada_em) AS quando, NULL AS vencedor
       FROM historico_precos
      WHERE orgao_cnpj IS NOT NULL AND assinatura_objeto IS NOT NULL AND assinatura_objeto <> ''
        AND COALESCE(encerrada_em, publicada_em) >= DATE_SUB(CURDATE(), INTERVAL ? YEAR)
      UNION ALL
     SELECT orgao_cnpj, orgao_nome, uf, grupo, objeto, assinatura_objeto,
            valor_estimado, valor_homologado, NULL AS desconto,
            DATE(COALESCE(fim_propostas, criado_em)) AS quando, vencedor
       FROM licitacoes
      WHERE orgao_cnpj IS NOT NULL AND assinatura_objeto IS NOT NULL AND assinatura_objeto <> ''
        AND COALESCE(fim_propostas, criado_em) >= DATE_SUB(CURDATE(), INTERVAL ? YEAR)
      ORDER BY orgao_cnpj, quando`,
    [anos, anos]
  );

  const porOrgao = new Map();
  for (const c of contratacoes) {
    if (!porOrgao.has(c.orgao_cnpj)) porOrgao.set(c.orgao_cnpj, []);
    porOrgao.get(c.orgao_cnpj).push(c);
  }

  const resumo = { contratacoes: contratacoes.length, orgaos: porOrgao.size, recorrencias: 0, novas: 0 };

  for (const [cnpj, lista] of porOrgao) {
    for (const grupo of agrupar(lista)) {
      // Deduplica a mesma contratação vista nas duas origens: o PNCP publica a
      // compra uma vez, e ela pode estar no radar e na amostra. Mesmo objeto no
      // mesmo mês é a mesma compra, não duas ocorrências.
      const vistos = new Set();
      const itens = grupo.itens
        .filter((c) => c.quando)
        .filter((c) => {
          const chave = String(c.quando).slice(0, 7);
          if (vistos.has(chave)) return false;
          vistos.add(chave);
          return true;
        })
        .sort((a, b) => new Date(a.quando) - new Date(b.quando));

      // A regra da seção 24.3: duas ocorrências, em **anos diferentes**. Duas
      // no mesmo ano costumam ser lote e item da mesma compra, não repetição.
      const anosDistintos = new Set(itens.map((c) => new Date(c.quando).getFullYear()));
      if (itens.length < 2 || anosDistintos.size < 2) continue;

      const datas = itens.map((c) => c.quando);
      const intervalos = [];
      for (let i = 1; i < datas.length; i += 1) {
        intervalos.push(Math.round((new Date(datas[i]) - new Date(datas[i - 1])) / 86400000));
      }

      const intervalo = Math.round(mediana(intervalos));
      const valores = itens.map((c) => Number(c.valor_estimado)).filter((v) => Number.isFinite(v) && v > 0);
      const descontos = itens.map((c) => Number(c.desconto)).filter((v) => Number.isFinite(v));
      const ultimo = itens[itens.length - 1];

      const [r] = await pool.query(
        `INSERT INTO recorrencias
           (orgao_cnpj, orgao_nome, assinatura_objeto, objeto_exemplo, grupo, uf, ocorrencias,
            primeira_em, ultima_em, mes_tipico, intervalo_medio_dias, valor_medio, desconto_medio,
            ultimo_vencedor, ultimo_valor, proxima_prevista, confianca)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           orgao_nome = VALUES(orgao_nome), objeto_exemplo = VALUES(objeto_exemplo),
           grupo = VALUES(grupo), uf = VALUES(uf), ocorrencias = VALUES(ocorrencias),
           primeira_em = VALUES(primeira_em), ultima_em = VALUES(ultima_em),
           mes_tipico = VALUES(mes_tipico), intervalo_medio_dias = VALUES(intervalo_medio_dias),
           valor_medio = VALUES(valor_medio), desconto_medio = VALUES(desconto_medio),
           ultimo_vencedor = VALUES(ultimo_vencedor), ultimo_valor = VALUES(ultimo_valor),
           proxima_prevista = VALUES(proxima_prevista), confianca = VALUES(confianca)`,
        [
          cnpj,
          recortar(ultimo.orgao_nome, 255),
          recortar(grupo.assinatura, 255),
          ultimo.objeto,
          recortar(ultimo.grupo, 60),
          ultimo.uf,
          itens.length,
          datas[0],
          datas[datas.length - 1],
          mesTipico(datas),
          intervalo,
          valores.length ? Math.round((valores.reduce((s, v) => s + v, 0) / valores.length) * 100) / 100 : null,
          descontos.length
            ? Math.round((descontos.reduce((s, v) => s + v, 0) / descontos.length) * 10000) / 10000
            : null,
          recortar(ultimo.vencedor, 255),
          Number(ultimo.valor_homologado) || Number(ultimo.valor_estimado) || null,
          proximaPrevista(datas[datas.length - 1], intervalo),
          confiancaDe(itens.length),
        ]
      );

      resumo.recorrencias += 1;
      if (r.insertId) resumo.novas += 1;
    }
  }

  // Recorrência que deixou de se sustentar (o objeto saiu da base, a janela
  // mudou) não fica apontando data velha: a previsão vencida é zerada, e a
  // linha fica com o histórico, sem previsão.
  await pool.query(
    'UPDATE recorrencias SET proxima_prevista = NULL WHERE proxima_prevista IS NOT NULL AND proxima_prevista < CURDATE()'
  );

  return resumo;
}

/**
 * Alertas de 60 e 30 dias antes da janela prevista (seção 24.4).
 * Diário, 08h.
 */
async function avisarRecorrencias({ confiancaMinima = 0.5 } = {}) {
  const [linhas] = await pool.query(
    `SELECT *, DATEDIFF(proxima_prevista, CURDATE()) AS faltam
       FROM recorrencias
      WHERE proxima_prevista IS NOT NULL
        AND confianca >= ?
        AND proxima_prevista BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)`,
    [confiancaMinima, Math.max(...MARCOS_DIAS)]
  );

  const MESES = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ];

  let criados = 0;
  for (const r of linhas) {
    // O marco mais próximo que já foi alcançado. Procurar do maior para o
    // menor fazia toda previsão cair em "60 dias" — inclusive a que faltava
    // 20 —, e um aviso que erra o prazo é pior do que nenhum.
    const marco = [...MARCOS_DIAS].sort((a, b) => a - b).find((d) => r.faltam <= d);
    if (!marco) continue;

    const mes = r.mes_tipico ? MESES[r.mes_tipico - 1] : null;
    const valor = r.valor_medio
      ? ` — costuma sair por ${Number(r.valor_medio).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}`
      : '';
    const vencedor = r.ultimo_vencedor ? `, da última vez com ${r.ultimo_vencedor}` : '';
    const objeto = String(r.objeto_exemplo || r.assinatura_objeto).replace(/\s+/g, ' ').slice(0, 120);

    const criado = await alertas.criar({
      tipo: 'recorrencia',
      nivel: marco === 30 ? 'atencao' : 'info',
      // Um alerta por marco e por ano previsto: a previsão de 2027 não é
      // silenciada pelo aviso que saiu em 2026.
      chave: `recorrencia:${r.id}:${String(r.proxima_prevista).slice(0, 7)}:${marco}`,
      quando: r.proxima_prevista,
      mensagem:
        `${r.orgao_nome || 'Um órgão'} costuma abrir licitação de ${objeto}` +
        `${mes ? ` em ${mes}` : ''}${valor}${vencedor}. Previsto em ${marco} dias.`,
    });
    if (criado) criados += 1;
  }

  return { previstas: linhas.length, criados };
}

function registrarNaFila() {
  fila.registrar('detectar_recorrencias', (payload) => detectarRecorrencias(payload || {}));
  fila.registrar('alertas_recorrencia', (payload) => avisarRecorrencias(payload || {}));
}

module.exports = {
  detectarRecorrencias,
  avisarRecorrencias,
  registrarNaFila,
  agrupar,
  mesTipico,
  proximaPrevista,
  confiancaDe,
  ANOS,
  MARCOS_DIAS,
  INTERVALO_MINIMO_DIAS,
};
