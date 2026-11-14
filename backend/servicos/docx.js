// Documento Word (.docx) mínimo, escrito à mão como a planilha (servicos/planilha.js):
// título, uma linha de contexto e uma tabela. Sem dependência nova — um .docx é
// um zip com três XML.
const AdmZip = require('adm-zip');
const { escapar: escaparXml } = require('./planilha');

const TIPOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELACOES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

/** Texto seguro no XML: o mesmo escape da planilha, com vazio no lugar de null. */
function escapar(texto) {
  return escaparXml(texto ?? '');
}

function trecho(texto, { negrito = false, tamanho = 18 } = {}) {
  const propriedades = `<w:rPr>${negrito ? '<w:b/>' : ''}<w:sz w:val="${tamanho}"/></w:rPr>`;
  return `<w:r>${propriedades}<w:t xml:space="preserve">${escapar(texto)}</w:t></w:r>`;
}

function paragrafo(texto, opcoes) {
  return `<w:p>${trecho(texto, opcoes)}</w:p>`;
}

/**
 * @param {object} p
 *   - titulo, subtitulo: texto
 *   - colunas: [{ titulo, largura }] — largura em décimos de polegada (A4 deitado com margem de 1,27 cm: soma ≤ 107)
 *   - linhas: matriz de textos
 * @returns {Buffer}
 */
function gerar({ titulo = '', subtitulo = '', colunas = [], linhas = [] }) {
  const twips = (largura) => Math.round(largura * 144);
  const grade = colunas.map((c) => `<w:gridCol w:w="${twips(c.largura)}"/>`).join('');
  const celula = (texto, coluna, cabecalho) =>
    `<w:tc><w:tcPr><w:tcW w:w="${twips(coluna.largura)}" w:type="dxa"/>${
      cabecalho ? '<w:shd w:val="clear" w:color="auto" w:fill="E7E7E7"/>' : ''
    }</w:tcPr>${paragrafo(texto, { negrito: cabecalho, tamanho: 16 })}</w:tc>`;

  const cabecalho = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${colunas.map((c) => celula(c.titulo, c, true)).join('')}</w:tr>`;
  const corpo = linhas
    .map((linha) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${colunas.map((c, i) => celula(linha[i], c, false)).join('')}</w:tr>`)
    .join('');

  const borda = (lado) => `<w:${lado} w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>`;
  const tabela = `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map(borda)
    .join('')}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${grade}</w:tblGrid>${cabecalho}${corpo}</w:tbl>`;

  const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
${paragrafo(titulo, { negrito: true, tamanho: 28 })}
${subtitulo ? paragrafo(subtitulo, { tamanho: 18 }) : ''}
${tabela}
<w:p/>
<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr>
</w:body>
</w:document>`;

  const zip = new AdmZip();
  zip.addFile('[Content_Types].xml', Buffer.from(TIPOS, 'utf8'));
  zip.addFile('_rels/.rels', Buffer.from(RELACOES, 'utf8'));
  zip.addFile('word/document.xml', Buffer.from(documento, 'utf8'));
  return zip.toBuffer();
}

module.exports = { gerar, escapar };
