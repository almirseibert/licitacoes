// Regras do gerador de proposta (seção 19). Só matemática e classificação:
// nada de banco aqui, para dar para conferir com a calculadora na mão.
//
// Convenção de margem, que difere da seção 12 de propósito:
//   · aqui `margem_pct` é ACRÉSCIMO SOBRE O CUSTO — é assim que a seção 19.1
//     define o cálculo (`custo × (1 + margem)`), e é assim que quem monta
//     preço pensa ("coloco 30% em cima");
//   · a `margem` da seção 12 é a fatia do preço que sobra ((p − c) / p), que é
//     o que responde "quanto sobra no contrato".
// As duas aparecem na tela com nomes diferentes justamente por isso.

/** Piso de referência: abaixo de 30% do estimado o painel grita (seção 19.2). */
const PISO_INEXEQUIVEL = 0.3;

/**
 * Unitário em 4 casas (centavo de centavo decide pregão), total em 2.
 *
 * Arredonda meio PARA CIMA, como o `ROUND` do Excel e o `ROUND` do MySQL — e
 * não como `toFixed`, que decide pelo valor binário: 25.608,405 × 1 virava
 * 25.608,40 aqui e 25.608,41 na planilha entregue, e a proposta saía com o
 * total do PDF um centavo abaixo do total do XLSX. Dois totais diferentes no
 * mesmo envelope é pedido de impugnação, então os dois seguem a planilha.
 */
function arredondar(valor, casas) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;

  const fator = 10 ** casas;
  // O `toFixed(6)` no valor já escalado tira o erro binário antes do
  // arredondamento: 2.560.840,4999999997 volta a ser 2.560.840,5.
  const escalado = Number((n * fator).toFixed(6));
  return (Math.sign(escalado) * Math.round(Math.abs(escalado))) / fator;
}

function numero(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/**
 * Preço unitário a partir do custo e da margem. Sem custo não há preço
 * calculado — e o painel não inventa: devolve nulo e a tela mostra a lacuna.
 */
function precoUnitario({ custo_unitario: custo, margem_pct: margem }) {
  const c = numero(custo);
  const m = numero(margem);
  if (c === null || c < 0 || m === null) return null;
  return arredondar(c * (1 + m), 4);
}

/** O caminho inverso: você digitou o preço, o painel diz que margem é essa. */
function margemDoPreco({ custo, preco }) {
  const c = numero(custo);
  const p = numero(preco);
  if (c === null || c <= 0 || p === null) return null;
  return arredondar(p / c - 1, 4);
}

/** Quanto sobra no preço, em fração do preço — a margem da seção 12. */
function sobraNoPreco({ custo, preco }) {
  const c = numero(custo);
  const p = numero(preco);
  if (c === null || p === null || p <= 0) return null;
  return arredondar((p - c) / p, 4);
}

/**
 * Semáforo do item (seção 19.2, item 3):
 *   · verde    — abaixo da mediana de fechamento e com margem positiva;
 *   · amarelo  — entre a mediana e o estimado: ganha se houver pouca disputa;
 *   · vermelho — acima do estimado (só 1,1% fecham acima) ou no prejuízo.
 *
 * Sem mediana não há semáforo inventado: fica cinza, com o motivo.
 */
function semaforo({ preco, custo, estimado, fechaPor }) {
  const p = numero(preco);
  if (p === null) return { cor: 'cinza', texto: 'preencha custo e margem' };

  const c = numero(custo);
  const e = numero(estimado);
  const f = numero(fechaPor);

  if (c !== null && p < c) {
    return { cor: 'vermelho', texto: 'abaixo do seu custo: você entrega no prejuízo' };
  }
  // Preço inexequível não é "competitivo": seria verde pela mediana e
  // desclassificado na sessão. O semáforo acompanha o alerta do item 4.
  if (e !== null && e > 0 && p < e * PISO_INEXEQUIVEL) {
    return { cor: 'vermelho', texto: 'abaixo de 30% do estimado: risco de inexequibilidade' };
  }
  if (e !== null && e > 0 && p > e) {
    return { cor: 'vermelho', texto: 'acima do estimado do órgão: praticamente não ganha' };
  }
  if (f === null) {
    return { cor: 'cinza', texto: 'sem mediana de fechamento para este grupo' };
  }
  if (p <= f) {
    return { cor: 'verde', texto: 'abaixo da mediana de fechamento: competitivo' };
  }
  return { cor: 'amarelo', texto: 'entre a mediana e o estimado: ganha se houver pouca disputa' };
}

/**
 * Alerta de inexequibilidade (seção 19.2, item 4). Perder a disputa por preço
 * inexequível é pior do que não disputar: no levantamento de outubro, lances de
 * R$ 1,00 e R$ 3,57 num item de R$ 9.826 foram desclassificados.
 */
function inexequibilidade({ preco, custo, estimado }) {
  const p = numero(preco);
  if (p === null) return null;

  const c = numero(custo);
  const e = numero(estimado);

  if (c !== null && c > 0 && p < c) {
    return { motivo: 'abaixo_do_custo', texto: 'o preço está abaixo do custo que você informou' };
  }
  if (e !== null && e > 0 && p < e * PISO_INEXEQUIVEL) {
    return {
      motivo: 'abaixo_de_30pct',
      texto: 'o preço está abaixo de 30% do estimado do órgão — risco de desclassificação por inexequibilidade',
    };
  }
  return null;
}

/** Total da linha: quantidade × unitário. É a conta que o XLSX refaz vivo. */
function totalDaLinha({ quantidade, valor_unitario: unitario }) {
  const q = numero(quantidade);
  const u = numero(unitario);
  if (q === null || u === null) return null;
  return arredondar(q * u, 2);
}

/**
 * Enriquece um item com preço, semáforo e as três referências da seção 19.2.
 *
 * `descontoMediano` é a fração da seção 12 para o grupo da licitação: o preço
 * que costuma fechar sai do estimado do PRÓPRIO item, não do total da
 * licitação — item caro e item barato da mesma compra não fecham igual.
 */
function avaliarItem(item, { descontoMediano = null } = {}) {
  const estimado = numero(item.valor_unit_estimado);
  const custo = numero(item.custo_unitario);
  const informado = numero(item.valor_unitario);

  // Preço gravado à mão tem precedência sobre o calculado: quem digita o preço
  // manda, e a margem passa a ser consequência dele.
  const unitario = informado === null ? precoUnitario(item) : informado;

  const margem =
    informado !== null && custo !== null && custo > 0
      ? margemDoPreco({ custo, preco: informado })
      : numero(item.margem_pct);

  const desconto = numero(descontoMediano);
  const fechaPor =
    estimado !== null && estimado > 0 && desconto !== null
      ? arredondar(estimado * (1 - desconto), 4)
      : null;

  const quantidade = numero(item.quantidade);
  const total = totalDaLinha({ quantidade, valor_unitario: unitario });

  return {
    ...item,
    quantidade,
    valor_unit_estimado: estimado,
    custo_unitario: custo,
    margem_pct: margem,
    valor_unitario: unitario,
    valor_total: total,
    // As três referências lado a lado (seção 19.2, item 2): estimado do órgão,
    // preço que costuma fechar, seu preço com a margem resultante.
    fecha_por: fechaPor,
    sobra_pct: sobraNoPreco({ custo, preco: unitario }),
    sobra_valor:
      custo !== null && unitario !== null && quantidade !== null
        ? arredondar((unitario - custo) * quantidade, 2)
        : null,
    semaforo: semaforo({ preco: unitario, custo, estimado, fechaPor }),
    inexequivel: inexequibilidade({ preco: unitario, custo, estimado }),
    disputar: item.disputar === undefined ? 1 : Number(item.disputar) ? 1 : 0,
  };
}

/**
 * Rodapé da seção 19.2, item 5: total, margem geral e a pergunta prática
 * "a esse preço, sobram R$ X no contrato inteiro".
 */
function totais(itens) {
  const disputados = itens.filter((i) => Number(i.disputar));

  let total = 0;
  let custoTotal = 0;
  let temCusto = false;
  let semPreco = 0;

  for (const item of disputados) {
    const linha = numero(item.valor_total);
    if (linha === null) {
      semPreco += 1;
      continue;
    }
    total += linha;

    const custo = numero(item.custo_unitario);
    const quantidade = numero(item.quantidade);
    if (custo !== null && quantidade !== null) {
      custoTotal += custo * quantidade;
      temCusto = true;
    }
  }

  const valorTotal = arredondar(total, 2);
  const custo = temCusto ? arredondar(custoTotal, 2) : null;
  const sobra = custo === null ? null : arredondar(valorTotal - custo, 2);
  // Margem média ponderada pelo valor: é a que responde pelo contrato inteiro.
  const margemMedia = custo !== null && valorTotal > 0 ? arredondar((valorTotal - custo) / valorTotal, 4) : null;

  return {
    itens_disputados: disputados.length,
    itens_fora: itens.length - disputados.length,
    itens_sem_preco: semPreco,
    valor_total: valorTotal,
    custo_total: custo,
    sobra,
    margem_media: margemMedia,
    frase:
      sobra === null
        ? 'Preencha o custo dos itens e o painel diz quanto sobra no contrato inteiro.'
        : sobra < 0
          ? 'A esse preço você perde R$ ' + formatar(Math.abs(sobra)) + ' no contrato inteiro.'
          : 'A esse preço, sobram R$ ' + formatar(sobra) + ' no contrato inteiro.',
    inexequiveis: disputados.filter((i) => i.inexequivel).length,
  };
}

function formatar(valor) {
  return Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Marca e modelo é obrigatório em compra de material (seção 19.1): proposta de
 * material sem marca é motivo clássico de desclassificação. Serviço não pede.
 */
function exigeMarca(licitacao) {
  const texto = (String(licitacao.objeto || '') + ' ' + String(licitacao.grupo || ''))
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  if (/\b(servic|locac|manutenc|assinatura|licenc|suporte|consultor|hospedagem)/.test(texto)) return false;
  return /\b(aquisic|compra|fornecimento|material|equipament|mobiliar|genero|insumo)/.test(texto);
}

module.exports = {
  PISO_INEXEQUIVEL,
  precoUnitario,
  margemDoPreco,
  sobraNoPreco,
  semaforo,
  inexequibilidade,
  totalDaLinha,
  avaliarItem,
  totais,
  exigeMarca,
  arredondar,
};
