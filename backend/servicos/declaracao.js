// Gerador de declarações (seção 18).
//
// Declaração é texto padrão com os dados da licitação trocados. Datilografar
// isso a cada disputa é perda de tempo e fonte de erro — número de pregão
// errado em declaração já desclassificou gente.
//
// Nada é inventado: variável sem dado aparece como lacuna visível
// (`____________`) e é devolvida na lista `faltando`, para a tela cobrar antes
// de você assinar.
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { seguro } = require('./pacote');

const A4 = [595.28, 841.89];
const MARGEM = 64;
const LACUNA = '____________';

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function porExtenso(data = new Date()) {
  const d = data instanceof Date ? data : new Date(data);
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

function cidadeDoEndereco(endereco) {
  if (!endereco) return null;
  // "Rua X, 123 - Bairro, Lajeado/RS" → "Lajeado"
  const comBarra = /([^,/-]+)\s*\/\s*[A-Z]{2}\s*$/.exec(String(endereco).trim());
  if (comBarra) return comBarra[1].trim();
  const partes = String(endereco).split(',').map((p) => p.trim()).filter(Boolean);
  return partes.length ? partes[partes.length - 1] : null;
}

/** As variáveis da seção 18.1, mais duas derivadas que evitam frase torta. */
function variaveis({ licitacao, perfil }) {
  const numero = licitacao.numero_compra || (licitacao.chave_externa || '').split('/').pop() || null;
  const processo = licitacao.processo || null;

  return {
    razao_social: perfil.razao_social || perfil.nome || null,
    cnpj: perfil.cnpj || null,
    endereco: perfil.endereco || null,
    representante: perfil.representante || null,
    cpf_representante: perfil.cpf_representante || null,
    orgao: licitacao.orgao_nome || null,
    uf_orgao: licitacao.uf || null,
    modalidade: licitacao.modalidade || null,
    numero_licitacao: numero,
    processo,
    objeto: licitacao.objeto || null,
    cidade_empresa: cidadeDoEndereco(perfil.endereco),
    data_extenso: porExtenso(),
    ano: String(new Date().getFullYear()),
    // Derivadas: entram no texto só quando há dado, sem deixar vírgula solta.
    processo_frase: processo ? `, processo administrativo nº ${processo}` : '',
    municipio_orgao: licitacao.municipio || null,
  };
}

// Variáveis que podem ficar vazias sem que a declaração perca sentido.
const OPCIONAIS = new Set(['processo', 'processo_frase', 'municipio_orgao', 'endereco', 'cidade_empresa', 'uf_orgao']);

/**
 * Troca as variáveis do corpo.
 * @returns {{ texto:string, faltando:string[] }}
 */
function preencher(corpo, dados) {
  const faltando = new Set();

  const texto = String(corpo).replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_todo, nome) => {
    const chave = nome.toLowerCase();
    if (!(chave in dados)) {
      faltando.add(chave);
      return LACUNA;
    }
    const valor = dados[chave];
    if (valor === null || valor === undefined || valor === '') {
      if (!OPCIONAIS.has(chave)) faltando.add(chave);
      return OPCIONAIS.has(chave) ? '' : LACUNA;
    }
    return String(valor);
  });

  // A substituição pode deixar espaço duplo onde entrou string vazia.
  return { texto: texto.replace(/[ \t]{2,}/g, ' '), faltando: [...faltando] };
}

function quebrar(texto, fonte, tamanho, largura) {
  const linhas = [];
  for (const paragrafo of seguro(texto).split('\n')) {
    if (!paragrafo.trim()) {
      linhas.push('');
      continue;
    }
    let atual = '';
    for (const palavra of paragrafo.split(/\s+/)) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (fonte.widthOfTextAtSize(tentativa, tamanho) > largura && atual) {
        linhas.push(atual);
        atual = palavra;
      } else {
        atual = tentativa;
      }
    }
    linhas.push(atual);
  }
  return linhas;
}

/**
 * Gera o PDF da declaração: título, corpo, local e data, e o bloco de
 * assinatura. O painel não assina nada (seção 17.7) — entrega pronta para você
 * assinar no gov.br ou no seu certificado.
 */
async function gerarPdf({ titulo, texto, dados }) {
  const documento = await PDFDocument.create();
  const normal = await documento.embedFont(StandardFonts.Helvetica);
  const negrito = await documento.embedFont(StandardFonts.HelveticaBold);
  documento.setTitle(seguro(titulo));

  let pagina = documento.addPage(A4);
  const { width, height } = pagina.getSize();
  const util = width - MARGEM * 2;
  let y = height - MARGEM - 20;

  const titulada = seguro(titulo).toUpperCase();
  pagina.drawText(titulada, {
    x: (width - negrito.widthOfTextAtSize(titulada, 13)) / 2,
    y, size: 13, font: negrito, color: rgb(0.1, 0.12, 0.16),
  });
  y -= 42;

  const novaPagina = () => {
    pagina = documento.addPage(A4);
    y = height - MARGEM;
  };

  for (const linha of quebrar(texto, normal, 11, util)) {
    if (y < MARGEM + 140) novaPagina();
    if (linha) {
      pagina.drawText(linha, { x: MARGEM, y, size: 11, font: normal, color: rgb(0.1, 0.12, 0.16) });
    }
    y -= 17;
  }

  // Local e data.
  y -= 24;
  if (y < MARGEM + 120) novaPagina();
  const local = `${dados.cidade_empresa || LACUNA}, ${dados.data_extenso}.`;
  pagina.drawText(seguro(local), { x: MARGEM, y, size: 11, font: normal, color: rgb(0.1, 0.12, 0.16) });

  // Assinatura.
  y -= 70;
  const meio = width / 2;
  pagina.drawLine({
    start: { x: meio - 150, y },
    end: { x: meio + 150, y },
    thickness: 0.8,
    color: rgb(0.3, 0.35, 0.42),
  });
  y -= 15;

  for (const linha of [
    dados.representante || LACUNA,
    dados.cpf_representante ? `CPF ${dados.cpf_representante}` : null,
    dados.razao_social || LACUNA,
    dados.cnpj ? `CNPJ ${dados.cnpj}` : null,
  ].filter(Boolean)) {
    const texto1 = seguro(linha);
    pagina.drawText(texto1, {
      x: meio - normal.widthOfTextAtSize(texto1, 10) / 2,
      y, size: 10, font: normal, color: rgb(0.2, 0.25, 0.32),
    });
    y -= 14;
  }

  pagina.drawText('Documento gerado pelo Painel de Licitacoes - assine no gov.br ou com seu certificado.', {
    x: MARGEM, y: 36, size: 7.5, font: normal, color: rgb(0.55, 0.6, 0.66),
  });

  return Buffer.from(await documento.save());
}

module.exports = { variaveis, preencher, gerarPdf, porExtenso, cidadeDoEndereco, LACUNA, OPCIONAIS };
