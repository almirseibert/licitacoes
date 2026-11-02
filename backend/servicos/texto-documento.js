// Extração de texto dos documentos (seção 8.1).
//
//   PDF com camada de texto → pdf-parse (página a página, para o checklist dizer
//                             em que página está a exigência)
//   PDF escaneado           → menos de 200 caracteres: marca para leitura manual.
//                             Não fazemos OCR nesta fase, como diz a spec.
//   .docx                   → mammoth
//   .txt                    → direto
//   conteúdo de .zip        → o job varre a pasta `_extraido`
const fs = require('fs');
const path = require('path');

const MINIMO_DE_TEXTO = 200; // abaixo disso, o PDF é imagem

async function lerPdf(absoluto) {
  const { PDFParse } = require('pdf-parse');
  const leitor = new PDFParse({ data: fs.readFileSync(absoluto) });
  try {
    const resultado = await leitor.getText();
    const paginas = (resultado.pages || []).map((p, i) => ({
      num: p.num || i + 1,
      texto: p.text || '',
    }));
    // Sem páginas (versões antigas): cai para o texto inteiro como página 1.
    if (!paginas.length && resultado.text) paginas.push({ num: 1, texto: resultado.text });
    return { paginas, total: resultado.total || paginas.length };
  } finally {
    await leitor.destroy().catch(() => {});
  }
}

async function lerDocx(absoluto) {
  const mammoth = require('mammoth');
  const { value } = await mammoth.extractRawText({ path: absoluto });
  return { paginas: [{ num: 1, texto: value || '' }], total: 1 };
}

function lerTxt(absoluto) {
  return { paginas: [{ num: 1, texto: fs.readFileSync(absoluto, 'utf8') }], total: 1 };
}

/**
 * Lê um arquivo do volume.
 * @returns {{paginas:Array<{num,texto}>, total:number, caracteres:number,
 *            precisaLeituraManual:boolean, suportado:boolean}}
 */
async function ler(absoluto) {
  const extensao = path.extname(absoluto).toLowerCase();
  let bruto;

  if (extensao === '.pdf') bruto = await lerPdf(absoluto);
  else if (extensao === '.docx') bruto = await lerDocx(absoluto);
  else if (extensao === '.txt') bruto = lerTxt(absoluto);
  else return { paginas: [], total: 0, caracteres: 0, precisaLeituraManual: false, suportado: false };

  const caracteres = bruto.paginas.reduce((soma, p) => soma + p.texto.length, 0);
  return {
    ...bruto,
    caracteres,
    // PDF escaneado: existe, abre, mas não tem o que ler.
    precisaLeituraManual: extensao === '.pdf' && caracteres < MINIMO_DE_TEXTO,
    suportado: true,
  };
}

module.exports = { ler, MINIMO_DE_TEXTO };
