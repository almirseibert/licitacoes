// Escritor de XLSX mínimo, com FÓRMULA VIVA (seção 19.3).
//
// Por que à mão em vez de uma biblioteca: o painel precisa de uma única coisa
// que as bibliotecas leves não dão — célula de fórmula sem valor colado, para
// o edital que exige planilha editável recalcular quando o pregoeiro (ou você)
// muda a quantidade. O arquivo é um zip de seis XMLs; `adm-zip` já é
// dependência do projeto por causa do edital em zip.
//
// `fullCalcOnLoad` é o detalhe que faz funcionar: sem ele, Excel e LibreOffice
// mostram célula de fórmula vazia até alguém editar a planilha, porque nós não
// gravamos o valor em cache.
const AdmZip = require('adm-zip');

/** Formatos numéricos próprios (o Excel reserva os códigos até 163). */
const FORMATOS = [
  { id: 164, codigo: '"R$"\\ #,##0.00' },
  { id: 165, codigo: '"R$"\\ #,##0.0000' },
  { id: 166, codigo: '#,##0.0000' },
];

/**
 * Estilos disponíveis para as células, na ordem em que entram em `cellXfs`.
 * O nome é o que o chamador usa; a posição é o que vai no XML.
 */
const ESTILOS = [
  'normal',      // 0
  'cabecalho',   // 1
  'texto',       // 2 — com quebra de linha, para a descrição do edital
  'quantidade',  // 3
  'dinheiro4',   // 4 — unitário, 4 casas
  'dinheiro2',   // 5 — total, 2 casas
  'total',       // 6 — negrito + 2 casas
  'negrito',     // 7
];

const INDICE = new Map(ESTILOS.map((nome, i) => [nome, i]));

function escapar(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Caractere de controle invalida o XML inteiro, e descrição de edital vem
    // cheia deles (quebra de linha solta, tabulação, hífen de controle).
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ');
}

/** 1 → A, 27 → AA. */
function coluna(numero) {
  let n = numero;
  let nome = '';
  while (n > 0) {
    const resto = (n - 1) % 26;
    nome = String.fromCharCode(65 + resto) + nome;
    n = Math.floor((n - resto) / 26);
  }
  return nome;
}

function celula(valor, linha, indiceColuna) {
  const ref = coluna(indiceColuna) + linha;
  if (valor === null || valor === undefined || valor === '') return '';

  const bruto = typeof valor === 'object' ? valor : { texto: valor };
  const estilo = INDICE.has(bruto.estilo) ? ` s="${INDICE.get(bruto.estilo)}"` : '';

  // Fórmula sem <v>: é o que mantém a planilha viva.
  if (bruto.formula) {
    return `<c r="${ref}"${estilo}><f>${escapar(bruto.formula)}</f></c>`;
  }
  if (bruto.numero !== undefined && bruto.numero !== null && bruto.numero !== '') {
    return `<c r="${ref}"${estilo}><v>${Number(bruto.numero)}</v></c>`;
  }
  if (bruto.texto === undefined || bruto.texto === null || bruto.texto === '') return '';

  // String em linha (inlineStr) dispensa a tabela de strings compartilhadas:
  // um arquivo menos para manter, e planilha de proposta não repete texto.
  return `<c r="${ref}"${estilo} t="inlineStr"><is><t xml:space="preserve">${escapar(bruto.texto)}</t></is></c>`;
}

const TIPOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const RELS_PLANILHA = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

function estilos() {
  // O código de formato leva aspas ("R$"), que dentro de um atributo XML TÊM de
  // ir escapadas: sem isso o styles.xml fica inválido e o Excel recusa a
  // planilha inteira, pedindo reparo.
  const numFmts = FORMATOS.map((f) => `<numFmt numFmtId="${f.id}" formatCode="${escapar(f.codigo)}"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="${FORMATOS.length}">${numFmts}</numFmts>
<fonts count="2">
<font><sz val="10"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><name val="Calibri"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE8EAED"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="8">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
</styleSheet>`;
}

/**
 * Monta o arquivo.
 *
 * @param {object} dados
 *   - nomeDaAba: até 31 caracteres, sem : \\ / ? * [ ]
 *   - larguras: largura de cada coluna, em caracteres
 *   - linhas: matriz de células; cada célula é string, número, ou
 *     `{ texto | numero | formula, estilo }`
 *   - congelar: número da última linha fixa na rolagem (0 = nenhuma)
 * @returns {Buffer}
 */
function gerar({ nomeDaAba = 'Planilha', larguras = [], linhas = [], congelar = 0 }) {
  const colunas = larguras.length
    ? `<cols>${larguras
        .map((largura, i) => `<col min="${i + 1}" max="${i + 1}" width="${largura}" customWidth="1"/>`)
        .join('')}</cols>`
    : '';

  const corpo = linhas
    .map((linha, i) => {
      const numeroDaLinha = i + 1;
      const celulas = linha.map((valor, j) => celula(valor, numeroDaLinha, j + 1)).join('');
      return `<row r="${numeroDaLinha}">${celulas}</row>`;
    })
    .join('');

  const fixa = Number(congelar) > 0
    ? `<pane ySplit="${Number(congelar)}" topLeftCell="A${Number(congelar) + 1}" activePane="bottomLeft" state="frozen"/>`
    : '';

  const planilha = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0">${fixa}</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="14"/>
${colunas}
<sheetData>${corpo}</sheetData>
</worksheet>`;

  const nome = String(nomeDaAba).replace(/[:\\/?*[\]]/g, ' ').slice(0, 31) || 'Planilha';
  const pasta = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${escapar(nome)}" sheetId="1" r:id="rId1"/></sheets>
<calcPr calcId="0" fullCalcOnLoad="1"/>
</workbook>`;

  const zip = new AdmZip();
  zip.addFile('[Content_Types].xml', Buffer.from(TIPOS, 'utf8'));
  zip.addFile('_rels/.rels', Buffer.from(RELS, 'utf8'));
  zip.addFile('xl/workbook.xml', Buffer.from(pasta, 'utf8'));
  zip.addFile('xl/_rels/workbook.xml.rels', Buffer.from(RELS_PLANILHA, 'utf8'));
  zip.addFile('xl/styles.xml', Buffer.from(estilos(), 'utf8'));
  zip.addFile('xl/worksheets/sheet1.xml', Buffer.from(planilha, 'utf8'));
  return zip.toBuffer();
}

module.exports = { gerar, coluna, ESTILOS };
