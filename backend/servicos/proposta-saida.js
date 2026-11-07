// Saída da proposta (seção 19.3): PDF para assinar e XLSX com fórmula viva.
//
// REGRA DE OURO (seção 19.4): custo e margem NUNCA saem nestes dois arquivos.
// São dado interno. O gerador mantém duas visões do mesmo documento — a sua,
// que é a tela, e a que vai para o órgão, que é isto aqui. A função `entregar`
// existe só para garantir essa fronteira num lugar único: é por ela que passa
// cada linha antes de virar papel.
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const arquivos = require('./arquivos');
const pacote = require('./pacote');
const planilha = require('./planilha');
const { seguro, dataBR } = require('./pacote');
const { porExtenso, cidadeDoEndereco, LACUNA } = require('./declaracao');

const A4 = [595.28, 841.89];
const MARGEM = 42;

// Voltage Obsidian (seção 15) só na faixa do topo: o corpo é papel branco,
// porque proposta é impressa e lida por quem não tem o painel.
const OBSIDIANA = rgb(0.039, 0.055, 0.102);
const VOLTAGEM = rgb(0.133, 0.827, 0.933);
const CLARO = rgb(0.898, 0.906, 0.922);
const TINTA = rgb(0.1, 0.12, 0.16);
const SUAVE = rgb(0.42, 0.47, 0.54);
const LINHA = rgb(0.82, 0.85, 0.89);

const DECLARACAO_DE_PRECOS =
  'Declaramos que os preços ofertados incluem todos os tributos, encargos sociais e ' +
  'trabalhistas, fretes, seguros, embalagens e demais custos e despesas, diretos e indiretos, ' +
  'necessários ao integral cumprimento do objeto, nada mais sendo devido pela Administração.';

/**
 * As colunas que vão para o órgão. Custo e margem não estão aqui — e é só
 * daqui que o PDF e o XLSX leem.
 */
function entregar(item) {
  return {
    item_numero: item.item_numero,
    descricao: item.descricao,
    marca_modelo: item.marca_modelo,
    unidade: item.unidade,
    quantidade: item.quantidade,
    valor_unitario: item.valor_unitario,
    valor_total: item.valor_total,
  };
}

/** Só os itens que você vai disputar entram na proposta (seção 19.1). */
function itensEntregues(itens) {
  return itens.filter((i) => Number(i.disputar)).map(entregar);
}

function moeda(valor, casas = 2) {
  if (valor === null || valor === undefined || valor === '') return LACUNA;
  return Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function quantidade(valor) {
  if (valor === null || valor === undefined || valor === '') return LACUNA;
  const n = Number(valor);
  return Number.isInteger(n) ? String(n) : n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
}

/** A descrição do edital tem 2 mil caracteres; na tabela entra a primeira linha. */
function resumirDescricao(texto, limite = 150) {
  const primeira = String(texto || '').split('\n')[0];
  const limpo = seguro(primeira).replace(/\s+/g, ' ').trim();
  return limpo.length > limite ? `${limpo.slice(0, limite - 1)}...` : limpo;
}

function cortar(texto, fonte, tamanho, largura) {
  let saida = seguro(texto);
  while (saida.length > 3 && fonte.widthOfTextAtSize(saida, tamanho) > largura) saida = saida.slice(0, -2);
  return saida;
}

function quebrar(texto, fonte, tamanho, largura) {
  const linhas = [];
  let atual = '';
  for (const palavra of seguro(texto).split(/\s+/).filter(Boolean)) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (fonte.widthOfTextAtSize(tentativa, tamanho) > largura && atual) {
      linhas.push(atual);
      atual = palavra;
    } else {
      atual = tentativa;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/**
 * PDF da proposta: cabeçalho com a empresa, identificação da licitação, tabela
 * de itens (sem custo), validade, prazos, garantia, dados bancários, a
 * declaração de preços, local, data e espaço de assinatura.
 */
async function gerarPdf({ proposta, licitacao, perfil, itens, exigeMarca }) {
  const documento = await PDFDocument.create();
  const normal = await documento.embedFont(StandardFonts.Helvetica);
  const negrito = await documento.embedFont(StandardFonts.HelveticaBold);

  const razao = perfil && (perfil.razao_social || perfil.nome);
  documento.setTitle(seguro(`Proposta comercial — ${razao || 'Studio Mythos'}`));
  documento.setProducer('Painel de Licitações — Studio Mythos');

  const entregues = itensEntregues(itens);
  const total = entregues.reduce((soma, i) => soma + Number(i.valor_total || 0), 0);

  const largura = A4[0];
  const util = largura - MARGEM * 2;

  // Larguras da tabela. Marca/modelo só ocupa espaço quando o objeto é compra
  // de material — em serviço, a coluna sobraria vazia na folha do órgão.
  const colunas = exigeMarca
    ? [{ chave: 'item', w: 28 }, { chave: 'descricao', w: util - 28 - 90 - 38 - 46 - 72 - 78 },
       { chave: 'marca', w: 90 }, { chave: 'unidade', w: 38 }, { chave: 'quantidade', w: 46 },
       { chave: 'unitario', w: 72 }, { chave: 'total', w: 78 }]
    : [{ chave: 'item', w: 28 }, { chave: 'descricao', w: util - 28 - 38 - 46 - 72 - 78 },
       { chave: 'unidade', w: 38 }, { chave: 'quantidade', w: 46 },
       { chave: 'unitario', w: 72 }, { chave: 'total', w: 78 }];

  const TITULOS = {
    item: 'ITEM', descricao: 'DESCRICAO', marca: 'MARCA/MODELO', unidade: 'UN',
    quantidade: 'QTD', unitario: 'UNITARIO R$', total: 'TOTAL R$',
  };

  let pagina = documento.addPage(A4);
  let y = desenharTopo(pagina, { licitacao, perfil, normal, negrito, primeira: true });

  const cabecalhoDaTabela = () => {
    pagina.drawRectangle({ x: MARGEM, y: y - 4, width: util, height: 16, color: rgb(0.93, 0.94, 0.96) });
    let x = MARGEM + 4;
    for (const coluna of colunas) {
      const titulo = TITULOS[coluna.chave];
      const alinhaDireita = ['quantidade', 'unitario', 'total'].includes(coluna.chave);
      pagina.drawText(titulo, {
        x: alinhaDireita ? x + coluna.w - 8 - negrito.widthOfTextAtSize(titulo, 7) : x,
        y, size: 7, font: negrito, color: SUAVE,
      });
      x += coluna.w;
    }
    y -= 20;
  };

  // A folha nova repete o cabeçalho da tabela só quando ainda há item para
  // listar: página virada por causa das condições comerciais não leva uma
  // fileira de títulos sem nada embaixo.
  const novaPagina = (comTabela = false) => {
    pagina = documento.addPage(A4);
    y = desenharTopo(pagina, { licitacao, perfil, normal, negrito, primeira: false });
    if (comTabela) cabecalhoDaTabela();
  };

  cabecalhoDaTabela();

  for (const item of entregues) {
    const larguraDescricao = colunas.find((c) => c.chave === 'descricao').w - 8;
    const linhasDescricao = quebrar(resumirDescricao(item.descricao), normal, 8, larguraDescricao).slice(0, 3);
    const altura = Math.max(14, linhasDescricao.length * 10 + 4);

    if (y - altura < 150) novaPagina(true);

    let x = MARGEM + 4;
    for (const coluna of colunas) {
      const valor = {
        item: String(item.item_numero ?? ''),
        descricao: null,
        marca: item.marca_modelo || LACUNA,
        unidade: item.unidade || '—',
        quantidade: quantidade(item.quantidade),
        unitario: moeda(item.valor_unitario, 2),
        total: moeda(item.valor_total, 2),
      }[coluna.chave];

      if (coluna.chave === 'descricao') {
        linhasDescricao.forEach((linha, i) => {
          pagina.drawText(linha, { x, y: y - i * 10, size: 8, font: normal, color: TINTA });
        });
      } else {
        const alinhaDireita = ['quantidade', 'unitario', 'total'].includes(coluna.chave);
        const texto = cortar(valor, normal, 8, coluna.w - 8);
        pagina.drawText(texto, {
          x: alinhaDireita ? x + coluna.w - 8 - normal.widthOfTextAtSize(texto, 8) : x,
          y, size: 8, font: normal, color: TINTA,
        });
      }
      x += coluna.w;
    }

    y -= altura;
    pagina.drawLine({
      start: { x: MARGEM, y: y + 6 }, end: { x: largura - MARGEM, y: y + 6 },
      thickness: 0.4, color: LINHA,
    });
  }

  // Total.
  if (y < 170) novaPagina();
  y -= 6;
  const rotuloTotal = `VALOR TOTAL DA PROPOSTA  R$ ${moeda(total, 2)}`;
  pagina.drawText(rotuloTotal, {
    x: largura - MARGEM - negrito.widthOfTextAtSize(rotuloTotal, 11),
    y, size: 11, font: negrito, color: TINTA,
  });
  y -= 28;

  // Condições comerciais. Campo em branco vira lacuna visível, nunca valor
  // inventado — proposta com prazo errado é proposta desclassificada.
  const condicoes = [
    ['Validade da proposta', proposta.validade_dias ? `${proposta.validade_dias} dias` : LACUNA],
    ['Prazo de entrega', proposta.prazo_entrega || LACUNA],
    ['Prazo de execucao', proposta.prazo_execucao || null],
    ['Garantia', proposta.garantia || LACUNA],
    ['Condicao de pagamento', proposta.condicao_pagamento || LACUNA],
    ['Dados bancarios', proposta.dados_bancarios || LACUNA],
  ].filter(([, valor]) => valor !== null);

  for (const [rotulo, valor] of condicoes) {
    if (y < 150) novaPagina();
    pagina.drawText(seguro(rotulo).toUpperCase(), { x: MARGEM, y, size: 7.5, font: normal, color: SUAVE });
    pagina.drawText(cortar(valor, normal, 9.5, util - 160), {
      x: MARGEM + 150, y: y - 0.5, size: 9.5, font: normal, color: TINTA,
    });
    y -= 16;
  }

  if (proposta.observacoes) {
    y -= 8;
    for (const linha of quebrar(proposta.observacoes, normal, 9, util)) {
      if (y < 140) novaPagina();
      pagina.drawText(linha, { x: MARGEM, y, size: 9, font: normal, color: TINTA });
      y -= 12;
    }
  }

  y -= 12;
  for (const linha of quebrar(DECLARACAO_DE_PRECOS, normal, 8.5, util)) {
    if (y < 130) novaPagina();
    pagina.drawText(linha, { x: MARGEM, y, size: 8.5, font: normal, color: SUAVE });
    y -= 11;
  }

  // Local, data e assinatura — o painel não assina nada (seção 17.7).
  if (y < 130) novaPagina();
  y -= 22;
  const cidade = (perfil && cidadeDoEndereco(perfil.endereco)) || LACUNA;
  pagina.drawText(seguro(`${cidade}, ${porExtenso()}.`), { x: MARGEM, y, size: 9.5, font: normal, color: TINTA });

  y -= 56;
  const meio = largura / 2;
  pagina.drawLine({ start: { x: meio - 150, y }, end: { x: meio + 150, y }, thickness: 0.8, color: SUAVE });
  y -= 13;
  for (const linha of [
    (perfil && perfil.representante) || LACUNA,
    perfil && perfil.cpf_representante ? `CPF ${perfil.cpf_representante}` : null,
    razao || LACUNA,
    perfil && perfil.cnpj ? `CNPJ ${perfil.cnpj}` : null,
  ].filter(Boolean)) {
    const texto = seguro(linha);
    pagina.drawText(texto, {
      x: meio - normal.widthOfTextAtSize(texto, 9) / 2, y, size: 9, font: normal, color: SUAVE,
    });
    y -= 12;
  }

  // Rodapé com numeração contínua, no padrão do pacote de habilitação.
  const paginas = documento.getPages();
  paginas.forEach((folha, i) => {
    const texto = seguro(`${razao || 'Studio Mythos'} - fl. ${i + 1} de ${paginas.length}`);
    folha.drawText(texto, {
      x: largura - MARGEM - normal.widthOfTextAtSize(texto, 7.5),
      y: 22, size: 7.5, font: normal, color: SUAVE,
    });
  });

  return Buffer.from(await documento.save());
}

/** Faixa do topo: a empresa e a licitação. Volta o `y` onde o corpo começa. */
function desenharTopo(pagina, { licitacao, perfil, normal, negrito, primeira }) {
  const { width, height } = pagina.getSize();
  const alturaFaixa = primeira ? 92 : 46;

  pagina.drawRectangle({ x: 0, y: height - alturaFaixa, width, height: alturaFaixa, color: OBSIDIANA });
  pagina.drawRectangle({ x: 0, y: height - alturaFaixa - 3, width, height: 3, color: VOLTAGEM });

  const razao = (perfil && (perfil.razao_social || perfil.nome)) || 'Studio Mythos';

  pagina.drawText('PROPOSTA COMERCIAL', {
    x: MARGEM, y: height - 30, size: primeira ? 15 : 11, font: negrito, color: CLARO,
  });
  pagina.drawText(cortar(razao, normal, 9.5, width / 2 - MARGEM), {
    x: MARGEM, y: height - 45, size: 9.5, font: normal, color: VOLTAGEM,
  });

  if (primeira) {
    const identificacao = [
      perfil && perfil.cnpj ? `CNPJ ${perfil.cnpj}` : `CNPJ ${LACUNA}`,
      perfil && perfil.endereco ? perfil.endereco : null,
      perfil && perfil.insc_estadual ? `IE ${perfil.insc_estadual}` : null,
    ].filter(Boolean).join(' · ');

    pagina.drawText(cortar(identificacao, normal, 7.5, width - MARGEM * 2), {
      x: MARGEM, y: height - 58, size: 7.5, font: normal, color: rgb(0.65, 0.7, 0.77),
    });

    const alvo = [
      licitacao.orgao_nome,
      licitacao.modalidade && licitacao.numero_compra
        ? `${licitacao.modalidade} ${licitacao.numero_compra}`
        : licitacao.modalidade,
      licitacao.processo ? `processo ${licitacao.processo}` : null,
      [licitacao.municipio, licitacao.uf].filter(Boolean).join('/'),
    ].filter(Boolean).join(' · ');

    pagina.drawText(cortar(alvo, normal, 8.5, width - MARGEM * 2), {
      x: MARGEM, y: height - 76, size: 8.5, font: normal, color: CLARO,
    });

    let y = height - alturaFaixa - 24;
    pagina.drawText('OBJETO', { x: MARGEM, y, size: 7, font: normal, color: SUAVE });
    y -= 12;
    for (const linha of quebrar(licitacao.objeto || '', normal, 9, width - MARGEM * 2).slice(0, 4)) {
      pagina.drawText(linha, { x: MARGEM, y, size: 9, font: normal, color: TINTA });
      y -= 11;
    }
    return y - 14;
  }

  return height - alturaFaixa - 24;
}

/**
 * XLSX com a mesma tabela, para os editais que exigem planilha editável — com
 * as fórmulas VIVAS (`quantidade × unitário` e a soma do total), nunca valores
 * colados. Também sem coluna de custo.
 */
function gerarXlsx({ proposta, licitacao, perfil, itens, exigeMarca }) {
  const entregues = itensEntregues(itens);
  const razao = (perfil && (perfil.razao_social || perfil.nome)) || 'Studio Mythos';

  const cabecalho = ['Item', 'Descrição', 'Marca/Modelo', 'Unidade', 'Quantidade', 'Valor unitário (R$)', 'Valor total (R$)'];
  const larguras = [6, 58, 22, 10, 12, 16, 16];
  // Sem marca/modelo a coluna C sai e tudo anda uma casa à esquerda.
  const colunas = exigeMarca ? cabecalho : cabecalho.filter((_, i) => i !== 2);
  const largurasUsadas = exigeMarca ? larguras : larguras.filter((_, i) => i !== 2);

  const COL_QUANTIDADE = exigeMarca ? 'E' : 'D';
  const COL_UNITARIO = exigeMarca ? 'F' : 'E';
  const COL_TOTAL = exigeMarca ? 'G' : 'F';

  const linhas = [
    [{ texto: 'PROPOSTA COMERCIAL', estilo: 'negrito' }],
    [{ texto: razao }, null, { texto: perfil && perfil.cnpj ? `CNPJ ${perfil.cnpj}` : `CNPJ ${LACUNA}` }],
    [{ texto: licitacao.orgao_nome || LACUNA }],
    [
      {
        texto: [licitacao.modalidade, licitacao.numero_compra].filter(Boolean).join(' ') || LACUNA,
      },
      null,
      { texto: licitacao.processo ? `Processo ${licitacao.processo}` : '' },
    ],
    [{ texto: resumirDescricao(licitacao.objeto, 300), estilo: 'texto' }],
    [],
  ];

  const primeiraDoItem = linhas.length + 2; // +1 do cabeçalho, +1 para virar 1-based
  linhas.push(colunas.map((titulo) => ({ texto: titulo, estilo: 'cabecalho' })));

  entregues.forEach((item, i) => {
    const numeroDaLinha = primeiraDoItem + i;
    const linha = [
      { numero: item.item_numero },
      { texto: resumirDescricao(item.descricao, 400), estilo: 'texto' },
      ...(exigeMarca ? [{ texto: item.marca_modelo || LACUNA }] : []),
      { texto: item.unidade || '' },
      { numero: item.quantidade, estilo: 'quantidade' },
      { numero: item.valor_unitario, estilo: 'dinheiro4' },
      // A fórmula é o ponto da seção 19.3: muda a quantidade, o total muda.
      //
      // O ROUND não é enfeite: o unitário tem 4 casas, e sem arredondar a linha
      // em 2 o Excel soma os centésimos de centavo e o total da planilha sai um
      // centavo diferente do total do PDF. Dois totais diferentes no mesmo
      // envelope é pedido de impugnação.
      {
        formula: `ROUND(${COL_QUANTIDADE}${numeroDaLinha}*${COL_UNITARIO}${numeroDaLinha},2)`,
        estilo: 'dinheiro2',
      },
    ];
    linhas.push(linha);
  });

  const ultimaDoItem = primeiraDoItem + entregues.length - 1;
  const linhaDoTotal = [];
  linhaDoTotal[exigeMarca ? 4 : 3] = { texto: 'VALOR TOTAL', estilo: 'negrito' };
  linhaDoTotal[exigeMarca ? 6 : 5] = entregues.length
    ? { formula: `SUM(${COL_TOTAL}${primeiraDoItem}:${COL_TOTAL}${ultimaDoItem})`, estilo: 'total' }
    : { numero: 0, estilo: 'total' };
  linhas.push(linhaDoTotal);
  linhas.push([]);

  for (const [rotulo, valor] of [
    ['Validade da proposta', proposta.validade_dias ? `${proposta.validade_dias} dias` : LACUNA],
    ['Prazo de entrega', proposta.prazo_entrega || LACUNA],
    ['Prazo de execução', proposta.prazo_execucao || ''],
    ['Garantia', proposta.garantia || LACUNA],
    ['Condição de pagamento', proposta.condicao_pagamento || LACUNA],
    ['Dados bancários', proposta.dados_bancarios || LACUNA],
    ['Observações', proposta.observacoes || ''],
  ]) {
    if (valor === '') continue;
    linhas.push([{ texto: rotulo, estilo: 'negrito' }, { texto: valor, estilo: 'texto' }]);
  }

  linhas.push([]);
  linhas.push([{ texto: DECLARACAO_DE_PRECOS, estilo: 'texto' }]);
  linhas.push([
    {
      texto: `${(perfil && cidadeDoEndereco(perfil.endereco)) || LACUNA}, ${porExtenso()} — gerado pelo Painel de Licitações`,
    },
  ]);

  return planilha.gerar({
    nomeDaAba: 'Proposta',
    larguras: largurasUsadas,
    linhas,
    congelar: primeiraDoItem - 1,
  });
}

/** Nome do arquivo entregue: `Proposta_StudioMythos_PE-45-2026.pdf`. */
function nomeDoArquivo({ licitacao, perfil, formato }) {
  const pedacos = [
    formato === 'xlsx' ? 'Planilha_de_precos' : 'Proposta_comercial',
    arquivos.limpar((perfil && (perfil.nome_fantasia || perfil.nome)) || 'StudioMythos').replace(/\s+/g, ''),
    arquivos
      .limpar(`${arquivos.siglaDaModalidade(licitacao.modalidade)}-${licitacao.numero_compra || licitacao.id}`)
      .replace(/\s+/g, '-'),
  ].filter(Boolean);
  return `${pedacos.join('_').slice(0, 120)}.${formato}`;
}

/** Gera os dois arquivos e grava no volume, devolvendo os caminhos relativos. */
async function gravar({ proposta, licitacao, perfil, itens, exigeMarca }) {
  const pasta = `propostas/${licitacao.id}`;

  const pdf = await gerarPdf({ proposta, licitacao, perfil, itens, exigeMarca });
  const nomePdf = nomeDoArquivo({ licitacao, perfil, formato: 'pdf' });
  const salvoPdf = await pacote.gravar(pasta, nomePdf, pdf);

  const xlsx = gerarXlsx({ proposta, licitacao, perfil, itens, exigeMarca });
  const nomeXlsx = nomeDoArquivo({ licitacao, perfil, formato: 'xlsx' });
  const salvoXlsx = await pacote.gravar(pasta, nomeXlsx, xlsx);

  return {
    pdf: { ...salvoPdf, nome: nomePdf },
    xlsx: { ...salvoXlsx, nome: nomeXlsx },
    gerado_em: dataBR(new Date()),
  };
}

module.exports = { gerarPdf, gerarXlsx, gravar, nomeDoArquivo, entregar, itensEntregues, DECLARACAO_DE_PRECOS };
