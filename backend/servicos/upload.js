// Upload de arquivos para o volume (seções 9.1 e 17.2).
//
// Tudo o que chega por upload é tratado como conteúdo desconhecido: o nome
// original nunca vira caminho, a extensão é checada contra uma lista curta e o
// arquivo é gravado com nome que o painel escolhe.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const arquivos = require('./arquivos');

const LIMITE_BYTES = 25 * 1024 * 1024; // seção 13: até 25 MB por documento
const EXTENSOES = ['.pdf', '.jpg', '.jpeg', '.png', '.docx', '.xlsx', '.xls', '.txt', '.zip'];

const emMemoria = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITE_BYTES, files: 1 },
});

/** Middleware pronto para um campo `arquivo`. */
const um = emMemoria.single('arquivo');

/**
 * Grava o arquivo recebido dentro de `pasta` (relativa ao volume).
 * @returns {{caminho:string, nome:string, tamanho:number, extensao:string}}
 */
function gravar(arquivo, pasta, prefixo = '') {
  const extensao = path.extname(arquivo.originalname || '').toLowerCase();
  if (!EXTENSOES.includes(extensao)) {
    throw new Error(`Tipo de arquivo não aceito (${extensao || 'sem extensão'}). Use: ${EXTENSOES.join(', ')}.`);
  }
  if (!arquivo.size) throw new Error('O arquivo chegou vazio.');

  const base = arquivos
    .limpar(path.basename(arquivo.originalname || 'documento', extensao))
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'documento';
  // Sufixo aleatório: dois uploads do mesmo nome não se sobrescrevem, e o
  // caminho nunca depende do que veio do navegador.
  const nome = `${prefixo}${base}_${crypto.randomBytes(4).toString('hex')}${extensao}`;

  const absoluta = arquivos.garantirPasta(pasta);
  fs.writeFileSync(path.join(absoluta, nome), arquivo.buffer);

  return {
    caminho: path.posix.join(pasta, nome),
    nome: arquivo.originalname ? String(arquivo.originalname).slice(0, 255) : nome,
    tamanho: arquivo.size,
    extensao,
  };
}

/** Transforma erro do multer em mensagem em português (seção 13). */
function tratarErro(erro) {
  if (erro && erro.code === 'LIMIT_FILE_SIZE') {
    return `Arquivo maior que ${Math.round(LIMITE_BYTES / 1024 / 1024)} MB.`;
  }
  return erro && erro.message ? erro.message : 'Não foi possível receber o arquivo.';
}

module.exports = { um, gravar, tratarErro, LIMITE_BYTES, EXTENSOES };
