// "Meu desempenho" (Seção 15 do PLANO_SAAS_CONLICITACAO.md) — as contas, sem banco.
//
// O serviço (servicos/desempenho.js) traz uma linha por participação da
// organização no período; tudo que vira número da tela sai daqui, para o que
// erra calado (janela de meses, taxa sobre quem já teve resultado, margem sobre
// o preço, média que não conta quem não tem o dado) ter teste sem banco.
const { dataValida } = require('./gestao');
const preco = require('./preco');
const analise = require('./analise-mercado');
const { arredondar } = require('./proposta');

/** As janelas do seletor. `definido` usa `de` e `ate`; `todo` não tem início. */
const JANELAS = [
  { chave: 'todo', rotulo: 'Todo o histórico', meses: null },
  { chave: '1m', rotulo: 'Último mês', meses: 1 },
  { chave: '3m', rotulo: 'Últimos 3 meses', meses: 3 },
  { chave: '6m', rotulo: 'Últimos 6 meses', meses: 6 },
  { chave: '1a', rotulo: 'Último ano', meses: 12 },
  { chave: 'definido', rotulo: 'Período definido', meses: null },
];
const JANELA_PADRAO = '6m';

// O que conta como "disputei": a mesma definição do relatório mensal (servicos/exportar.js
// `relatorioMensal`) — se uma mudar, a outra muda junto.
const ETAPAS_DISPUTADAS = ['Proposta enviada', 'Em disputa', 'Ganhamos', 'Perdemos'];

const TOPO = 10;

const dinheiro = (n) => arredondar(n, 2);
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const positivo = (v) => (Number(v) > 0 ? Number(v) : null);

/** 'AAAA-MM-DD' menos N meses de calendário; dia 31 em mês curto cai no último dia. */
function mesesAntes(dia, n) {
  const [a, m, d] = dia.split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 - n, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

/**
 * Período pedido pela tela. `de`/`ate` válidos valem como `definido` mesmo sem
 * a janela; janela desconhecida cai no padrão (não vira erro). `de` nulo =
 * sem início ("todo o histórico").
 */
function periodoDesempenho(q = {}, { hoje }) {
  let chave = JANELAS.some((j) => j.chave === q.janela) ? q.janela : null;
  const temDatas = dataValida(q.de) || dataValida(q.ate);
  if (!chave) chave = temDatas ? 'definido' : JANELA_PADRAO;

  const janela = JANELAS.find((j) => j.chave === chave);
  if (chave === 'todo') return { janela: chave, rotulo: janela.rotulo, de: null, ate: hoje };
  if (chave === 'definido') {
    const ate = dataValida(q.ate) ? q.ate : hoje;
    const de = dataValida(q.de) ? q.de : mesesAntes(ate, 6);
    return { janela: chave, rotulo: janela.rotulo, ...(de <= ate ? { de, ate } : { de: ate, ate: de }) };
  }
  return { janela: chave, rotulo: janela.rotulo, de: mesesAntes(hoje, janela.meses), ate: hoje };
}

/** Taxa de vitória sobre o que já teve resultado: o que está em disputa não é derrota. */
function taxaDeVitoria(ganhas, perdidas) {
  return ganhas + perdidas > 0 ? arredondar(ganhas / (ganhas + perdidas), 3) : null;
}

/**
 * O preço e o custo de uma participação, de onde cada um veio.
 *   preço — ganha: o do contrato, senão o do resultado, senão a proposta;
 *           as demais: a proposta (o valor da proposta enviada, senão o total
 *           da proposta final/enviada guardada em `propostas`);
 *   custo — o total da proposta (itens) quando existe, senão o custo estimado
 *           digitado na licitação.
 */
function precoECusto(l) {
  let valor = null;
  let precoFonte = null;
  const candidatos = l.etapa === 'Ganhamos'
    ? [['contrato', l.contrato_valor], ['resultado', l.valor_final], ['proposta', l.valor_proposto], ['proposta', l.proposta_valor]]
    : [['proposta', l.valor_proposto], ['proposta', l.proposta_valor]];
  for (const [fonte, v] of candidatos) {
    if (positivo(v)) {
      valor = Number(v);
      precoFonte = fonte;
      break;
    }
  }
  let custo = null;
  let custoFonte = null;
  if (positivo(l.proposta_custo)) {
    custo = Number(l.proposta_custo);
    custoFonte = 'proposta';
  } else if (positivo(l.custo_estimado)) {
    custo = Number(l.custo_estimado);
    custoFonte = 'custo estimado';
  }
  return { preco: valor, preco_fonte: precoFonte, custo, custo_fonte: custoFonte };
}

/**
 * Margem de uma participação: no preço dela e, quando há valor estimado e
 * referência, no preço de referência (o que fecharia pela mediana do mercado).
 * Sem custo ou sem preço a margem é `null` — lacuna, nunca zero.
 */
function margemDaParticipacao(l, referenciaFecha = null) {
  const { preco: valor, preco_fonte, custo, custo_fonte } = precoECusto(l);
  const naProposta = custo && valor ? preco.margem({ custo, preco: valor }) : null;
  const naReferencia = custo && positivo(referenciaFecha) ? preco.margem({ custo, preco: Number(referenciaFecha) }) : null;
  return {
    preco: valor,
    preco_fonte,
    custo,
    custo_fonte,
    margem_valor: naProposta ? naProposta.valor : null,
    margem_pct: naProposta ? naProposta.pct : null,
    margem_sinal: naProposta ? naProposta.sinal : null,
    preco_referencia: positivo(referenciaFecha),
    margem_referencia_pct: naReferencia ? naReferencia.pct : null,
  };
}

/** Margem do conjunto: sobre o somatório (ponderada pelo valor) e a média simples das margens. */
function resumirMargens(margens) {
  const validas = margens.filter((m) => m.margem_pct !== null);
  if (!validas.length) return { licitacoes: 0, margem_ponderada: null, margem_media: null, preco: 0, custo: 0, lucro: 0, no_prejuizo: 0 };
  const somaPreco = validas.reduce((s, m) => s + m.preco, 0);
  const somaCusto = validas.reduce((s, m) => s + m.custo, 0);
  return {
    licitacoes: validas.length,
    margem_ponderada: arredondar((somaPreco - somaCusto) / somaPreco, 4),
    margem_media: arredondar(validas.reduce((s, m) => s + m.margem_pct, 0) / validas.length, 4),
    preco: dinheiro(somaPreco),
    custo: dinheiro(somaCusto),
    lucro: dinheiro(somaPreco - somaCusto),
    no_prejuizo: validas.filter((m) => m.margem_pct < 0).length,
  };
}

/** Agrupa participações por uma chave; cada grupo traz as contas de vitória e valor. */
function agruparPor(linhas, chaveDe, rotuloDe) {
  const grupos = new Map();
  for (const l of linhas) {
    const chave = chaveDe(l);
    if (!grupos.has(chave)) grupos.set(chave, { chave, rotulo: rotuloDe(l), participacoes: 0, ganhas: 0, perdidas: 0, valor_ganho: 0 });
    const g = grupos.get(chave);
    g.participacoes += 1;
    if (l.etapa === 'Ganhamos') {
      g.ganhas += 1;
      g.valor_ganho += valorGanho(l) || 0;
    } else if (l.etapa === 'Perdemos') g.perdidas += 1;
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, valor_ganho: dinheiro(g.valor_ganho), taxa_vitoria: taxaDeVitoria(g.ganhas, g.perdidas) }))
    .sort((a, b) => b.participacoes - a.participacoes || b.valor_ganho - a.valor_ganho || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
}

/**
 * Chave do órgão para agrupar. A mesma licitação do mesmo órgão chega às vezes com CNPJ e às vezes
 * sem (outra fonte de coleta): sem cuidado viram dois grupos. `mapaDeOrgaos` aprende, nas próprias
 * linhas, qual CNPJ pertence a cada nome; a linha sem CNPJ usa o do nome, se algum o tem.
 */
const soDigitos = (v) => String(v || '').replace(/\D/g, '');
const nomeDoOrgao = (l) => String(l.orgao_nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

function mapaDeOrgaos(linhas) {
  const mapa = new Map();
  for (const l of linhas) {
    const cnpj = soDigitos(l.orgao_cnpj);
    const nome = nomeDoOrgao(l);
    if (cnpj && nome && !mapa.has(nome)) mapa.set(nome, cnpj);
  }
  return mapa;
}

function chaveDoOrgao(l, mapa) {
  const cnpj = soDigitos(l.orgao_cnpj) || mapa.get(nomeDoOrgao(l)) || '';
  return cnpj || nomeDoOrgao(l) || '—';
}

/** Por órgão: com e sem CNPJ na mesma linha de coleta viram o mesmo grupo (ver `mapaDeOrgaos`). */
function agruparPorOrgao(linhas) {
  const mapa = mapaDeOrgaos(linhas);
  return agruparPor(linhas, (l) => chaveDoOrgao(l, mapa), (l) => l.orgao_nome || 'Órgão não informado');
}

/** O valor de uma licitação ganha — o mesmo do relatório mensal: resultado, senão a proposta. */
function valorGanho(l) {
  return positivo(l.valor_final) || positivo(l.valor_proposto) || null;
}

/**
 * Desconto da minha proposta contra o estimado do órgão; sem os dois valores,
 * `null`. O `valor_final` só vale como "meu" preço quando ganhei: na perdida
 * ele é o do vencedor, e o desconto do concorrente não é o meu.
 */
function descontoDaProposta(l) {
  const estimado = positivo(l.valor_estimado);
  const meu = positivo(l.valor_proposto) || (l.etapa === 'Ganhamos' ? positivo(l.valor_final) : null);
  return estimado && meu ? 1 - meu / estimado : null;
}

/**
 * O valor da MINHA proposta: o proposto; na ganha, na falta dele, o do resultado. Na perdida o
 * `valor_final` é o do vencedor — usá-lo como "meu" valor proposto inflaria o total e o desconto.
 */
function valorProposto(l) {
  return positivo(l.valor_proposto) || (l.etapa === 'Ganhamos' ? positivo(l.valor_final) : null);
}

/** 'AAAA-MM' do dia de Brasília da participação (`data` já vem em horário de Brasília — servicos/participacoes.js). */
const mesDaParticipacao = (l) => (l.data instanceof Date ? l.data.toISOString() : String(l.data)).slice(0, 7);

/**
 * O relatório mensal: as MESMAS participações de "Meu desempenho", agrupadas por mês (mais novo
 * primeiro). Soma só quem tem o valor — mês sem valor registrado conta a disputa e dá `null`, não zero.
 */
function resumirPorMes(linhas) {
  const meses = new Map();
  for (const l of linhas) {
    const mes = mesDaParticipacao(l);
    if (!meses.has(mes)) meses.set(mes, []);
    meses.get(mes).push(l);
  }
  const somaOuNull = (valores) => (valores.length ? dinheiro(valores.reduce((s, v) => s + v, 0)) : null);
  return [...meses.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([mes, ls]) => {
      const ganhas = ls.filter((l) => l.etapa === 'Ganhamos');
      const perdidas = ls.filter((l) => l.etapa === 'Perdemos');
      const descontos = ls.map(descontoDaProposta).filter((d) => d !== null);
      return {
        mes,
        disputei: ls.length,
        ganhei: ganhas.length,
        perdi: perdidas.length,
        em_andamento: ls.length - ganhas.length - perdidas.length,
        taxa_vitoria: taxaDeVitoria(ganhas.length, perdidas.length),
        valor_proposto: somaOuNull(ls.map(valorProposto).filter((v) => v !== null)),
        valor_ganho: somaOuNull(ganhas.map(valorGanho).filter((v) => v !== null)),
        desconto_medio: arredondar4(media(descontos)),
        com_desconto: descontos.length,
        acima_do_estimado: descontos.filter((d) => d < 0).length,
      };
    });
}

const resumirObjeto = (texto) => (texto && texto.length > 140 ? `${texto.slice(0, 140)}…` : texto);
const media = (valores) => (valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : null);
const arredondar4 = (n) => (n === null ? null : arredondar(n, 4));

/**
 * Tudo o que a tela mostra, a partir das participações do período.
 * Cada linha: etapa, valores (estimado/proposto/final), contrato_*, proposta_*,
 * custo_estimado, orgao_*, plataforma_disputa, beneficio_me, desconto_mercado e
 * `referencia_fecha` (preço de referência, se o serviço conseguiu calcular).
 */
function resumir(linhas) {
  const ganhas = linhas.filter((l) => l.etapa === 'Ganhamos');
  const perdidas = linhas.filter((l) => l.etapa === 'Perdemos');
  const valorGanhoTotal = dinheiro(ganhas.reduce((s, l) => s + (valorGanho(l) || 0), 0));
  const comValorGanho = ganhas.filter((l) => valorGanho(l));
  const descontos = linhas.map(descontoDaProposta).filter((d) => d !== null);

  const totais = {
    participacoes: linhas.length,
    ganhas: ganhas.length,
    perdidas: perdidas.length,
    em_andamento: linhas.length - ganhas.length - perdidas.length,
    taxa_vitoria: taxaDeVitoria(ganhas.length, perdidas.length),
    valor_ganho: valorGanhoTotal,
    // Ticket médio só entre as ganhas que têm valor: uma ganha sem valor
    // registrado no divisor puxaria a média para baixo sem ter perdido nada.
    ticket_medio: comValorGanho.length ? dinheiro(valorGanhoTotal / comValorGanho.length) : null,
    ganhas_sem_valor: ganhas.length - comValorGanho.length,
    desconto_medio: arredondar4(media(descontos)),
    com_desconto: descontos.length,
  };

  // Só alimenta `resumirPerdas`: a tela mostra os motivos, não cada perda.
  const perdas = perdidas.map((l) => ({ valor_estimado: num(l.valor_estimado), ...analise.motivoDaPerda(l) }));
  const { motivos, principal } = analise.resumirPerdas(perdas);

  const margens = linhas.map((l) => ({
    id: l.id,
    objeto: l.objeto,
    orgao_nome: l.orgao_nome,
    etapa: l.etapa,
    data: l.data,
    ...margemDaParticipacao(l, l.referencia_fecha),
  }));
  const margensGanhas = margens.filter((m) => m.etapa === 'Ganhamos');

  // Contratos das licitações ganhas no período.
  const comContrato = ganhas.filter((l) => l.contrato_id);
  const contratos = {
    ganhas_com_contrato: comContrato.length,
    ganhas_sem_contrato: ganhas.length - comContrato.length,
    valor: dinheiro(comContrato.reduce((s, l) => s + (num(l.contrato_valor) || 0), 0)),
    valor_executado: dinheiro(comContrato.reduce((s, l) => s + (num(l.contrato_executado) || 0), 0)),
    vigentes: comContrato.filter((l) => l.contrato_situacao === 'vigente' || l.contrato_situacao === 'prorrogado').length,
  };

  // O meu desconto contra o desconto que o mercado teve na mesma licitação
  // (historico_precos), só onde as duas pontas existem.
  const pares = linhas
    .map((l) => ({ meu: descontoDaProposta(l), mercado: num(l.desconto_mercado) }))
    .filter((p) => p.meu !== null && p.mercado !== null);
  const mercado = {
    com_historico: linhas.filter((l) => num(l.desconto_mercado) !== null).length,
    comparadas: pares.length,
    meu_desconto: arredondar4(media(pares.map((p) => p.meu))),
    desconto_mercado: arredondar4(media(pares.map((p) => p.mercado))),
  };

  return {
    totais,
    por_orgao: agruparPorOrgao(linhas).slice(0, TOPO),
    por_portal: agruparPor(linhas, (l) => l.plataforma_disputa || '—', (l) => l.plataforma_disputa || 'Portal não informado'),
    motivos,
    principal,
    margens: {
      ganhas: resumirMargens(margensGanhas),
      todas: resumirMargens(margens),
      linhas: margens
        .filter((m) => m.margem_pct !== null || m.margem_referencia_pct !== null)
        .slice(0, 100)
        .map((m) => ({
          id: m.id, objeto: resumirObjeto(m.objeto), orgao_nome: m.orgao_nome, etapa: m.etapa,
          preco: m.preco, preco_fonte: m.preco_fonte, custo: m.custo, custo_fonte: m.custo_fonte,
          margem_pct: m.margem_pct, margem_sinal: m.margem_sinal, margem_referencia_pct: m.margem_referencia_pct,
        })),
      sem_custo: margens.filter((m) => m.custo === null).length,
    },
    contratos,
    mercado,
  };
}

module.exports = {
  JANELAS,
  JANELA_PADRAO,
  ETAPAS_DISPUTADAS,
  mesesAntes,
  periodoDesempenho,
  taxaDeVitoria,
  precoECusto,
  margemDaParticipacao,
  resumirMargens,
  descontoDaProposta,
  agruparPor,
  agruparPorOrgao,
  valorProposto,
  resumirPorMes,
  resumir,
};
