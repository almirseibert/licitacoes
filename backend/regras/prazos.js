// Dia útil e os prazos da Lei 14.133/2021 (seção 25.1).
//
// Pela Lei 14.133, pedido de esclarecimento e impugnação ao edital vão até
// **3 dias úteis antes** da data de abertura das propostas (art. 164, parágrafo
// único, e art. 81, §1º). O painel calcula e avisa — e depois de vencido esse
// prazo, exigência restritiva já não se discute: só resta não disputar.
//
// Contar dia útil parece trivial e não é. Três armadilhas, todas aqui:
//   1. a contagem é regressiva a partir da abertura, e o dia da abertura não
//      entra (art. 183: exclui-se o dia do começo);
//   2. sábado e domingo não contam, nem feriado nacional, estadual da UF do
//      órgão ou municipal do município dele;
//   3. o prazo termina no fim do expediente do dia encontrado, não à
//      meia-noite — e o painel assume 18h, dizendo que assumiu.

// Hora em que o prazo se encerra no dia limite. A lei não fixa; os editais em
// geral seguem o expediente do órgão. 18h é o mais comum, e a tela diz que é
// suposição, para ninguém deixar para a última hora confiando nisso.
const HORA_LIMITE = 18;

// Os três dias úteis da Lei 14.133.
const DIAS_UTEIS_QUESTIONAMENTO = 3;

/**
 * O dia de calendário de um valor, no fuso local.
 *
 * Dois cuidados que não são preciosismo:
 *
 * 1. `new Date(null)` é 1º de janeiro de 1970, não data inválida. Sem a
 *    primeira guarda, licitação sem data de abertura ganharia um prazo de
 *    questionamento vencido em 1969.
 * 2. `new Date('2026-11-20')` é meia-noite **UTC**, que em Brasília é dia 19.
 *    Feriado é dia de calendário, não instante: lido assim, todo feriado
 *    andaria um dia para trás e a contagem inteira sairia errada. Data pura
 *    é montada campo a campo.
 */
function soData(valor) {
  if (valor === null || valor === undefined || valor === '') return null;

  if (!(valor instanceof Date)) {
    const puro = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(valor));
    if (puro) return new Date(Number(puro[1]), Number(puro[2]) - 1, Number(puro[3]));
  }

  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function chaveDia(data) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

function fimDeSemana(data) {
  const dia = data.getDay();
  return dia === 0 || dia === 6;
}

/**
 * Monta o conjunto de feriados que valem para um órgão: nacionais, mais os
 * estaduais da UF dele, mais os municipais do município dele.
 *
 * Feriado de outro município não suspende prazo nenhum — por isso o filtro, e
 * não um conjunto único de "todos os feriados cadastrados".
 */
function feriadosQueValem(linhas, { uf, municipio } = {}) {
  const normalizar = (t) =>
    String(t || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();

  const doMunicipio = normalizar(municipio);
  const daUf = String(uf || '').toUpperCase();
  const mapa = new Map();

  for (const f of linhas) {
    if (f.abrangencia === 'estadual' && (!daUf || String(f.uf || '').toUpperCase() !== daUf)) continue;
    if (f.abrangencia === 'municipal') {
      if (!doMunicipio || normalizar(f.municipio) !== doMunicipio) continue;
      if (daUf && f.uf && String(f.uf).toUpperCase() !== daUf) continue;
    }
    const data = soData(f.data);
    if (data) mapa.set(chaveDia(data), f.nome || 'feriado');
  }
  return mapa;
}

function ehDiaUtil(data, feriados) {
  if (fimDeSemana(data)) return false;
  return !feriados.has(chaveDia(data));
}

/**
 * Conta `quantos` dias úteis para trás a partir de `referencia`, sem contar o
 * próprio dia da referência.
 *
 * Devolve o dia útil encontrado e a lista do que foi pulado — é essa lista que
 * permite conferir a conta contra o edital em vez de acreditar nela.
 */
function diasUteisAntes(referencia, quantos, feriados = new Map()) {
  const base = soData(referencia);
  if (!base) return null;

  const pulados = [];
  const uteis = [];
  const cursor = new Date(base);
  let voltas = 0;

  while (uteis.length < quantos && voltas < 400) {
    cursor.setDate(cursor.getDate() - 1);
    voltas += 1;

    if (fimDeSemana(cursor)) {
      pulados.push({ data: chaveDia(cursor), motivo: cursor.getDay() === 0 ? 'domingo' : 'sábado' });
      continue;
    }
    const feriado = feriados.get(chaveDia(cursor));
    if (feriado) {
      pulados.push({ data: chaveDia(cursor), motivo: feriado });
      continue;
    }
    uteis.push(chaveDia(cursor));
  }

  if (uteis.length < quantos) return null;
  return { data: new Date(cursor), uteis, pulados };
}

/**
 * O prazo de esclarecimento e impugnação de uma licitação (seção 25.1).
 *
 * @returns null quando não há data de abertura — sem ela não há o que contar,
 *   e inventar uma seria pior do que não mostrar nada.
 */
function prazoQuestionamento({ abertura, uf, municipio, feriados = [], agora = new Date() }) {
  const base = soData(abertura);
  if (!base) return null;

  const valem = feriadosQueValem(feriados, { uf, municipio });
  const contagem = diasUteisAntes(base, DIAS_UTEIS_QUESTIONAMENTO, valem);
  if (!contagem) return null;

  const limite = new Date(contagem.data);
  limite.setHours(HORA_LIMITE, 0, 0, 0);

  const horas = (limite.getTime() - agora.getTime()) / 3600000;

  return {
    limite,
    // O que a tela usa para o selo âmbar da seção 25.2.
    vencido: horas <= 0,
    urgente: horas > 0 && horas <= 24,
    horas_restantes: Math.round(horas * 10) / 10,
    dias_uteis: DIAS_UTEIS_QUESTIONAMENTO,
    // A conta aberta: os dias úteis contados e o que foi pulado, com o motivo.
    uteis_contados: contagem.uteis,
    pulados: contagem.pulados,
    hora_limite: HORA_LIMITE,
    base_legal: 'Lei 14.133/2021, art. 164 (esclarecimento) e art. 164, parágrafo único (impugnação)',
  };
}

module.exports = {
  prazoQuestionamento,
  diasUteisAntes,
  feriadosQueValem,
  ehDiaUtil,
  chaveDia,
  HORA_LIMITE,
  DIAS_UTEIS_QUESTIONAMENTO,
};
