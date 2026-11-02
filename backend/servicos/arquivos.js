// Pastas e nomes dos arquivos no volume (seção 7.1).
//
// A pasta precisa ser legível por quem abre o explorador de arquivos e válida
// no Windows e no Linux — daí tirar acento, cortar caractere proibido e limitar
// o tamanho. O volume é montado em DIR_DADOS (./dados no desenvolvimento,
// /dados no container).
const fs = require('fs');
const path = require('path');
const { dirDados } = require('../config/ambiente');

const MAX_PASTA = 70;
// \ / : * ? " < > | são inválidos no Windows; o resto é higiene.
const PROIBIDOS = /[\\/:*?"<>|\u0000-\u001f]/g;

const SIGLAS = [
  [/pregao.*eletronic/, 'PE'],
  [/pregao.*presencial/, 'PP'],
  [/dispensa|inexigibilidade/, 'DISP'],
  [/credenciamento|chamada publica|chamamento/, 'CRED'],
  [/concorrencia.*eletronic/, 'CE'],
  [/concorrencia.*presencial/, 'CP'],
  [/concorrencia/, 'CE'],
  [/leilao/, 'LEI'],
];

function semAcento(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function limpar(texto) {
  return semAcento(texto).replace(PROIBIDOS, '').replace(/\s+/g, ' ').trim();
}

function siglaDaModalidade(modalidade) {
  const m = semAcento(modalidade).toLowerCase();
  for (const [padrao, sigla] of SIGLAS) {
    if (padrao.test(m)) return sigla;
  }
  return 'LIC';
}

function dataCurta(data) {
  if (!data) return 'sem-data';
  const d = data instanceof Date ? data : new Date(data);
  if (Number.isNaN(d.getTime())) return 'sem-data';
  return d.toISOString().slice(0, 10);
}

/** `2026-11-14 RS Lajeado - PREFEITURA MUNICIPAL (PE 45)` */
function nomeDaPasta(licitacao) {
  const sigla = siglaDaModalidade(licitacao.modalidade);
  const numero = limpar(licitacao.numero_compra || licitacao.chave_externa.split('/').pop());
  const sufixo = ` (${sigla} ${numero})`;
  const prefixo = limpar(
    `${dataCurta(licitacao.fim_propostas)} ${licitacao.uf || ''} ${licitacao.municipio || ''} - ${licitacao.orgao_nome || ''}`
  );

  // O sufixo é o que identifica a licitação: ele fica inteiro e quem encolhe é o resto.
  const espaco = Math.max(10, MAX_PASTA - sufixo.length);
  return `${prefixo.slice(0, espaco).trim()}${sufixo}`;
}

/** Nome do arquivo gravado: `01_Edital_Pregao_45-2026.pdf` */
function nomeDoArquivo(sequencial, titulo, extensao) {
  // O título do portal às vezes já vem com a extensão ("Edital.pdf"); sem tirar,
  // o arquivo viraria "01_Edital.pdf.pdf" e a pasta extraída, "..._zip_extraido".
  const semExtensao = String(titulo || 'documento').replace(
    new RegExp(`\\${extensao || '.nada'}$`, 'i'),
    ''
  );
  const base = limpar(semExtensao || 'documento')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 90)
    .replace(/^[._]+|[._]+$/g, '');
  const numero = String(sequencial || 0).padStart(2, '0');
  const ext = extensao ? (extensao.startsWith('.') ? extensao : `.${extensao}`) : '';
  return `${numero}_${base || 'documento'}${ext.toLowerCase()}`;
}

/**
 * Extensão real do arquivo: o PNCP manda o nome no Content-Disposition e às
 * vezes ele vem percent-encoded duas vezes.
 */
function extensaoDe(disposicao, tipo, titulo) {
  const nome = nomeNoContentDisposition(disposicao);
  const candidato = nome || titulo || '';
  const porNome = path.extname(candidato).toLowerCase();
  if (porNome && porNome.length <= 6) return porNome;

  const porTipo = {
    'application/pdf': '.pdf',
    'application/zip': '.zip',
    'application/x-zip-compressed': '.zip',
    'application/x-rar-compressed': '.rar',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'text/plain': '.txt',
  }[String(tipo || '').split(';')[0].trim().toLowerCase()];

  return porTipo || '.bin';
}

function nomeNoContentDisposition(disposicao) {
  if (!disposicao) return null;
  const estrela = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(disposicao);
  const simples = /filename="?([^";]+)"?/i.exec(disposicao);
  const bruto = (estrela && estrela[1]) || (simples && simples[1]);
  if (!bruto) return null;

  let nome = bruto.trim();
  for (let i = 0; i < 2 && /%[0-9a-f]{2}/i.test(nome); i += 1) {
    try {
      nome = decodeURIComponent(nome);
    } catch {
      break;
    }
  }
  return nome;
}

function caminhoAbsoluto(...partes) {
  return path.resolve(dirDados, ...partes);
}

function garantirPasta(relativa) {
  const absoluta = caminhoAbsoluto(relativa);
  fs.mkdirSync(absoluta, { recursive: true });
  return absoluta;
}

/**
 * Confere que um caminho relativo não escapa do volume. Vale para tudo que vem
 * do banco e chega a uma rota de download: um `..` no caminho não pode virar
 * leitura de arquivo fora de DIR_DADOS.
 */
function dentroDoVolume(relativa) {
  const raiz = path.resolve(dirDados);
  const alvo = path.resolve(raiz, relativa || '');
  return alvo === raiz || alvo.startsWith(raiz + path.sep);
}

module.exports = {
  nomeDaPasta,
  nomeDoArquivo,
  extensaoDe,
  nomeNoContentDisposition,
  siglaDaModalidade,
  caminhoAbsoluto,
  garantirPasta,
  dentroDoVolume,
  limpar,
  MAX_PASTA,
};
