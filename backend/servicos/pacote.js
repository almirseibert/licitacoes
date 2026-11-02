// Montagem do envio (seção 17.5): ZIP numerado ou PDF único com capa, índice e
// numeração contínua de folhas.
//
// O PDF único é o que a maioria dos portais prefere e o que mais economiza
// tempo. Arquivo que não for PDF (JPG de certidão, XLSX da planilha) não some:
// vai à parte, dentro do ZIP, e a tela avisa.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const arquivos = require('./arquivos');

// Voltage Obsidian (seção 15) — a capa é a única peça do painel que vira papel.
const OBSIDIANA = rgb(0.039, 0.055, 0.102);
const VOLTAGEM = rgb(0.133, 0.827, 0.933);
const TEXTO = rgb(0.898, 0.906, 0.922);
const SUAVE = rgb(0.58, 0.64, 0.72);

const A4 = [595.28, 841.89];

function dataBR(valor) {
  if (!valor) return '—';
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

/** Tira o que o PDF padrão (WinAnsi) não sabe desenhar, para nunca quebrar a geração. */
function seguro(texto) {
  return String(texto || '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[^\x20-\xFF]/g, '');
}

function cortar(texto, fonte, tamanho, largura) {
  let saida = seguro(texto);
  while (saida.length > 3 && fonte.widthOfTextAtSize(saida, tamanho) > largura) {
    saida = saida.slice(0, -2);
  }
  return saida;
}

function quebrar(texto, fonte, tamanho, largura) {
  const palavras = seguro(texto).split(/\s+/);
  const linhas = [];
  let atual = '';
  for (const palavra of palavras) {
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
 * Monta o PDF único: capa, índice, documentos na ordem e numeração no rodapé.
 *
 * @param {object} dados
 *   - licitacao, perfil
 *   - pecas: [{ ordem, rotulo, caminhoAbsoluto, extensao, validade }]
 * @returns {{ bytes:Buffer, folhas:number, indice:Array, fora:Array }}
 */
async function montarPdfUnico({ licitacao, perfil, pecas }) {
  const documento = await PDFDocument.create();
  const normal = await documento.embedFont(StandardFonts.Helvetica);
  const negrito = await documento.embedFont(StandardFonts.HelveticaBold);

  documento.setTitle(seguro(`Habilitação — ${perfil.razao_social || perfil.nome}`));
  documento.setProducer('Painel de Licitações — Studio Mythos');

  const capa = documento.addPage(A4);
  desenharCapa(capa, { licitacao, perfil, normal, negrito });

  // O índice é escrito depois (só então sabemos a página de cada peça), mas
  // precisa existir agora para não deslocar a numeração.
  const indicePagina = documento.addPage(A4);

  const indice = [];
  const fora = [];

  for (const peca of pecas) {
    if (peca.extensao !== '.pdf') {
      fora.push(peca);
      continue;
    }

    let origem;
    try {
      origem = await PDFDocument.load(await fsp.readFile(peca.caminhoAbsoluto), { ignoreEncryption: true });
    } catch (erro) {
      fora.push({ ...peca, erro: `não foi possível mesclar: ${erro.message}` });
      continue;
    }

    const paginaInicial = documento.getPageCount() + 1;
    const copiadas = await documento.copyPages(origem, origem.getPageIndices());
    // Cada documento começa em página nova — é o que o pregoeiro espera ao folhear.
    for (const pagina of copiadas) documento.addPage(pagina);

    indice.push({
      ordem: peca.ordem,
      rotulo: peca.rotulo,
      pagina: paginaInicial,
      folhas: copiadas.length,
      validade: peca.validade || null,
    });
  }

  desenharIndice(indicePagina, { indice, fora, normal, negrito });

  // Rodapé contínuo, depois de saber o total.
  const paginas = documento.getPages();
  const total = paginas.length;
  const empresa = seguro(perfil.nome_fantasia || perfil.nome || 'Studio Mythos');
  paginas.forEach((pagina, i) => {
    if (i === 0) return; // a capa não leva rodapé
    const texto = `${empresa} - fl. ${i + 1} de ${total}`;
    const tamanho = 8;
    const largura = normal.widthOfTextAtSize(texto, tamanho);
    const { width } = pagina.getSize();
    pagina.drawText(texto, {
      x: width - largura - 36,
      y: 22,
      size: tamanho,
      font: normal,
      color: rgb(0.35, 0.4, 0.47),
    });
  });

  return { bytes: Buffer.from(await documento.save()), folhas: total, indice, fora };
}

function desenharCapa(pagina, { licitacao, perfil, normal, negrito }) {
  const { width, height } = pagina.getSize();
  pagina.drawRectangle({ x: 0, y: 0, width, height, color: OBSIDIANA });
  pagina.drawRectangle({ x: 0, y: height - 6, width, height: 6, color: VOLTAGEM });

  const margem = 56;
  let y = height - 120;

  pagina.drawText('DOCUMENTOS DE HABILITACAO', {
    x: margem, y, size: 22, font: negrito, color: TEXTO,
  });
  y -= 18;
  pagina.drawText(seguro(perfil.razao_social || perfil.nome || 'Studio Mythos'), {
    x: margem, y, size: 12, font: normal, color: VOLTAGEM,
  });

  y -= 56;
  const linhas = [
    ['Orgao', licitacao.orgao_nome],
    ['Unidade', licitacao.unidade],
    ['Modalidade', `${licitacao.modalidade || ''} ${licitacao.numero_compra ? `no ${licitacao.numero_compra}` : ''}`.trim()],
    ['Local', [licitacao.municipio, licitacao.uf].filter(Boolean).join('/')],
    ['Fim das propostas', dataBR(licitacao.fim_propostas)],
    ['CNPJ da licitante', perfil.cnpj || '—'],
    ['Emitido em', dataBR(new Date())],
  ];

  for (const [rotulo, valor] of linhas) {
    if (!valor) continue;
    pagina.drawText(seguro(rotulo).toUpperCase(), { x: margem, y, size: 8, font: normal, color: SUAVE });
    pagina.drawText(cortar(valor, normal, 11, width - margem * 2 - 130), {
      x: margem + 130, y: y - 1, size: 11, font: normal, color: TEXTO,
    });
    y -= 26;
  }

  y -= 14;
  pagina.drawText('OBJETO', { x: margem, y, size: 8, font: normal, color: SUAVE });
  y -= 16;
  for (const linha of quebrar(licitacao.objeto || '', normal, 10, width - margem * 2).slice(0, 8)) {
    pagina.drawText(linha, { x: margem, y, size: 10, font: normal, color: TEXTO });
    y -= 14;
  }

  pagina.drawText('Gerado pelo Painel de Licitacoes da Studio Mythos', {
    x: margem, y: 40, size: 8, font: normal, color: SUAVE,
  });
}

function desenharIndice(pagina, { indice, fora, normal, negrito }) {
  const { width, height } = pagina.getSize();
  const margem = 56;
  let y = height - 80;

  pagina.drawText('INDICE', { x: margem, y, size: 16, font: negrito, color: rgb(0.1, 0.12, 0.16) });
  y -= 10;
  pagina.drawLine({
    start: { x: margem, y },
    end: { x: width - margem, y },
    thickness: 1,
    color: rgb(0.8, 0.83, 0.87),
  });
  y -= 24;

  for (const item of indice) {
    const numero = String(item.ordem).padStart(2, '0');
    pagina.drawText(numero, { x: margem, y, size: 10, font: negrito, color: rgb(0.3, 0.35, 0.42) });
    pagina.drawText(cortar(item.rotulo, normal, 10, width - margem * 2 - 140), {
      x: margem + 28, y, size: 10, font: normal, color: rgb(0.1, 0.12, 0.16),
    });

    const folha = `fl. ${item.pagina}`;
    pagina.drawText(folha, {
      x: width - margem - normal.widthOfTextAtSize(folha, 10),
      y, size: 10, font: normal, color: rgb(0.3, 0.35, 0.42),
    });
    y -= 16;

    if (item.validade) {
      pagina.drawText(cortar(item.validade, normal, 8, 300), {
        x: margem + 28, y: y + 4, size: 8, font: normal, color: rgb(0.45, 0.5, 0.57),
      });
      y -= 8;
    }
    if (y < 90) break;
  }

  if (fora.length && y > 70) {
    y -= 12;
    pagina.drawText('Enviados a parte (nao sao PDF):', {
      x: margem, y, size: 9, font: negrito, color: rgb(0.6, 0.3, 0.1),
    });
    y -= 13;
    for (const peca of fora.slice(0, 6)) {
      pagina.drawText(cortar(`- ${peca.rotulo}`, normal, 9, width - margem * 2), {
        x: margem, y, size: 9, font: normal, color: rgb(0.4, 0.3, 0.2),
      });
      y -= 12;
    }
  }
}

/**
 * Checklist que vai dentro do ZIP (`00_CHECKLIST.pdf`, seção 9.3): o que foi,
 * a validade de cada peça e o que faltou.
 */
async function montarChecklist({ licitacao, perfil, pecas, faltando }) {
  const documento = await PDFDocument.create();
  const normal = await documento.embedFont(StandardFonts.Helvetica);
  const negrito = await documento.embedFont(StandardFonts.HelveticaBold);
  const pagina = documento.addPage(A4);
  const { width, height } = pagina.getSize();
  const margem = 56;
  let y = height - 70;

  pagina.drawText('CHECKLIST DO ENVIO', { x: margem, y, size: 16, font: negrito, color: rgb(0.1, 0.12, 0.16) });
  y -= 18;
  pagina.drawText(cortar(`${licitacao.orgao_nome || ''} — ${licitacao.modalidade || ''} ${licitacao.numero_compra || ''}`, normal, 10, width - margem * 2), {
    x: margem, y, size: 10, font: normal, color: rgb(0.35, 0.4, 0.47),
  });
  y -= 30;

  for (const peca of pecas) {
    pagina.drawText(`${String(peca.ordem).padStart(2, '0')}  ${cortar(peca.rotulo, normal, 10, 330)}`, {
      x: margem, y, size: 10, font: normal, color: rgb(0.1, 0.12, 0.16),
    });
    if (peca.validade) {
      pagina.drawText(cortar(peca.validade, normal, 9, 160), {
        x: width - margem - 170, y, size: 9, font: normal, color: rgb(0.35, 0.4, 0.47),
      });
    }
    y -= 15;
    if (y < 110) break;
  }

  if (faltando.length) {
    y -= 16;
    pagina.drawText('FALTANDO', { x: margem, y, size: 11, font: negrito, color: rgb(0.7, 0.15, 0.15) });
    y -= 16;
    for (const falta of faltando) {
      pagina.drawText(cortar(`- ${falta.rotulo}: ${falta.motivo}`, normal, 9, width - margem * 2), {
        x: margem, y, size: 9, font: normal, color: rgb(0.5, 0.15, 0.15),
      });
      y -= 13;
      if (y < 60) break;
    }
  }

  pagina.drawText(`Gerado em ${dataBR(new Date())} pelo Painel de Licitacoes`, {
    x: margem, y: 36, size: 8, font: normal, color: rgb(0.5, 0.55, 0.6),
  });

  return Buffer.from(await documento.save());
}

/** Nome do arquivo de saída (seção 17.5). */
function nomeDoPacote({ licitacao, perfil, formato }) {
  const pedacos = [
    'Habilitacao',
    arquivos.limpar(perfil.nome_fantasia || perfil.nome || 'StudioMythos').replace(/\s+/g, ''),
    arquivos.limpar(`${arquivos.siglaDaModalidade(licitacao.modalidade)}-${licitacao.numero_compra || licitacao.id}`).replace(/\s+/g, '-'),
    arquivos.limpar(licitacao.orgao_nome || '').split(' ').slice(0, 3).join(''),
  ].filter(Boolean);
  return `${pedacos.join('_').slice(0, 120)}.${formato === 'zip' ? 'zip' : 'pdf'}`;
}

/** Grava o pacote no volume e devolve o caminho relativo. */
async function gravar(relativaDaPasta, nome, bytes) {
  const pasta = arquivos.garantirPasta(relativaDaPasta);
  const destino = path.join(pasta, nome);
  await fsp.writeFile(destino, bytes);
  return {
    caminho: path.posix.join(relativaDaPasta, nome),
    tamanho: fs.statSync(destino).size,
  };
}

module.exports = { montarPdfUnico, montarChecklist, nomeDoPacote, gravar, dataBR, seguro };
