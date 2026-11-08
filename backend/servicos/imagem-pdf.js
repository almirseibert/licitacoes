// Imagem de certidão virando página de PDF (Fase 14).
//
// O caso é diário: a certidão chega como foto ou print — JPG ou PNG —, e o
// edital pede um PDF único. Até aqui essas peças caíam na lista "fora do PDF"
// do pacote, e sobrava converter à mão antes de subir. Agora o painel converte
// na montagem.
//
// O que ele NÃO faz, de propósito: não aumenta resolução, não corrige
// perspectiva, não deixa a foto mais legível. Documento ilegível continua
// ilegível, e a página leva uma nota dizendo que veio de imagem — porque
// pregoeiro que não consegue ler a certidão inabilita, e é melhor você
// descobrir isso aqui do que na sessão.
const fsp = require('fs/promises');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

// A4 em pontos, o mesmo do pacote.
const A4 = [595.28, 841.89];

// Margem da página. Folga suficiente para o rodapé de numeração do pacote não
// encostar na imagem.
const MARGEM = 36;
const ESPACO_RODAPE = 28;

const EXTENSOES = ['.jpg', '.jpeg', '.png'];

function ehImagem(extensao) {
  return EXTENSOES.includes(String(extensao || '').toLowerCase());
}

/**
 * Embute a imagem no documento, pelo que o arquivo é de verdade.
 *
 * A extensão não decide: PNG salvo como .jpg é comum em certidão baixada de
 * portal, e `embedJpg` num PNG estoura. A assinatura dos primeiros bytes é o
 * que vale — e, se ela não for de nenhum dos dois, a peça volta para a lista
 * "fora do PDF" com o motivo, em vez de quebrar a montagem inteira.
 */
async function embutir(documento, bytes) {
  const png = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const jpg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

  if (png) return documento.embedPng(bytes);
  if (jpg) return documento.embedJpg(bytes);

  throw new Error('o arquivo não é um JPG nem um PNG válido, apesar da extensão');
}

/**
 * Desenha a imagem numa página A4 do documento que já está sendo montado.
 *
 * A imagem é ajustada para caber inteira, mantendo a proporção, e centralizada.
 * Nunca é ampliada além do tamanho original: foto pequena esticada para A4 fica
 * ilegível, e ilegível é o que inabilita.
 *
 * @returns {{pagina, largura:number, altura:number, escala:number}}
 */
async function desenharEm(documento, bytes, { rotulo = null, fonte = null } = {}) {
  const imagem = await embutir(documento, bytes);
  const pagina = documento.addPage(A4);

  const disponivelLargura = A4[0] - MARGEM * 2;
  const disponivelAltura = A4[1] - MARGEM * 2 - ESPACO_RODAPE - (rotulo ? 18 : 0);

  const escala = Math.min(disponivelLargura / imagem.width, disponivelAltura / imagem.height, 1);
  const largura = imagem.width * escala;
  const altura = imagem.height * escala;

  const topo = A4[1] - MARGEM - (rotulo ? 18 : 0);

  pagina.drawImage(imagem, {
    x: (A4[0] - largura) / 2,
    y: topo - altura - Math.max(0, (disponivelAltura - altura) / 2),
    width: largura,
    height: altura,
  });

  // A nota de procedência. Curta, no alto, fora da área da imagem: quem folheia
  // precisa saber que aquilo é uma foto de documento, não o documento emitido.
  if (rotulo && fonte) {
    pagina.drawText(String(rotulo).slice(0, 110), {
      x: MARGEM,
      y: A4[1] - MARGEM - 10,
      size: 8,
      font: fonte,
      color: rgb(0.45, 0.45, 0.45),
    });
  }

  return { pagina, largura, altura, escala };
}

/**
 * Um PDF de uma página a partir de um arquivo de imagem no disco.
 *
 * Serve para converter uma peça do cofre isoladamente, fora da montagem do
 * pacote — e é também o que torna esta conversão testável sem montar um
 * pacote inteiro.
 */
async function deArquivo(caminho, { rotulo = null } = {}) {
  const bytes = await fsp.readFile(caminho);
  const documento = await PDFDocument.create();
  const fonte = await documento.embedFont(StandardFonts.Helvetica);

  documento.setProducer('Painel de Licitações — Studio Mythos');
  const r = await desenharEm(documento, bytes, { rotulo, fonte });

  return {
    bytes: Buffer.from(await documento.save()),
    folhas: 1,
    largura: r.largura,
    altura: r.altura,
    // Abaixo de 1 a imagem foi reduzida para caber; igual a 1 ela entrou no
    // tamanho original, e a legibilidade é a da foto que você subiu.
    escala: Math.round(r.escala * 1000) / 1000,
  };
}

module.exports = { ehImagem, deArquivo, desenharEm, embutir, EXTENSOES, A4, MARGEM };
