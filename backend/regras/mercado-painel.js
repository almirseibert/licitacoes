// O painel "Mercado e concorrentes" (decisão de 20/11/2026): em vez de seis gráficos do mesmo
// GROUP BY, quatro respostas — o que está acontecendo, quais contratos vencem (recompra provável),
// quais atas aceitam adesão e quem vende. Aqui só o que é regra pura: a frase e as janelas.

const JANELAS_ASSINADOS = [30, 90, 180, 365]; // dias para trás (contratos assinados)
const JANELAS_VENCIMENTO = [30, 90, 180]; // dias para frente (contratos que vencem)
const PADRAO_ASSINADOS = 90;
const PADRAO_VENCIMENTO = 90;

const escolher = (valor, permitidas, padrao) => (permitidas.includes(Number(valor)) ? Number(valor) : padrao);

const reais = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const inteiro = (v) => Number(v || 0).toLocaleString('pt-BR');
const pctInteiro = (v) => `${Math.round(Number(v) * 100)}%`;

/** "A", "A e B", "A, B e C". */
function lista(nomes) {
  const limpos = nomes.filter(Boolean);
  if (limpos.length <= 1) return limpos.join('');
  return `${limpos.slice(0, -1).join(', ')} e ${limpos[limpos.length - 1]}`;
}

/** Nome do recorte: "Saúde › Medicamentos", "Saúde" ou "todos os segmentos". */
function nomeDoRecorte({ area, segmento }) {
  if (segmento) return area ? `${area} › ${segmento}` : segmento;
  return area || 'todos os segmentos';
}

/**
 * A frase que abre o painel. Sem contrato no recorte não há número a dizer: diz isso e o que fazer,
 * nunca um zero que pareça resultado.
 *
 * @param {{ recorte: {area?: string, segmento?: string, uf?: string}, dias: number,
 *           totais: {contratos: number, valor: number, orgaos: number, fornecedores: number},
 *           compradores: Array<{nome: string}>, desconto: {mediano: number|null, amostra: number}|null }} p
 */
function fraseDoMercado({ recorte, dias, totais, compradores = [], desconto = null }) {
  const onde = recorte.uf ? ` em ${recorte.uf}` : '';
  const quem = nomeDoRecorte(recorte);
  if (!totais || !totais.contratos) {
    return `Nenhum contrato de ${quem}${onde} foi assinado nos últimos ${dias} dias entre os que o painel coletou. ` +
      'Pode ser um segmento sem compras no período — ou uma UF que a coleta ainda não cobre.';
  }
  const partes = [
    `Nos últimos ${dias} dias foram assinados ${inteiro(totais.contratos)} contratos de ${quem}${onde}, somando ${reais(totais.valor)}, ` +
      `com ${inteiro(totais.fornecedores)} fornecedores em ${inteiro(totais.orgaos)} órgãos.`,
  ];
  const nomes = compradores.slice(0, 3).map((c) => c.nome);
  if (nomes.length) partes.push(`Quem mais comprou: ${lista(nomes)}.`);
  if (desconto && desconto.mediano !== null && desconto.mediano !== undefined) {
    const pequena = desconto.amostra < 12 ? ' (amostra pequena)' : '';
    partes.push(
      Number(desconto.mediano) <= 0.005
        ? `Nos pregões encerrados deste recorte, a metade fecha no próprio valor estimado${pequena}.`
        : `Nos pregões encerrados deste recorte, quem vence costuma fechar ${pctInteiro(desconto.mediano)} abaixo do estimado${pequena}.`
    );
  }
  return partes.join(' ');
}

module.exports = {
  JANELAS_ASSINADOS,
  JANELAS_VENCIMENTO,
  PADRAO_ASSINADOS,
  PADRAO_VENCIMENTO,
  escolher,
  lista,
  nomeDoRecorte,
  fraseDoMercado,
};
