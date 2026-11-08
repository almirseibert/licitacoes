// Configurações editáveis pela tela (seção 11.13), em `configuracoes`.
//
// Regra do lugar: variável de ambiente é o padrão de quem sobe o serviço; a
// tabela é a palavra de quem usa o painel. Valor vazio na tabela quer dizer
// "fica com o do ambiente" — assim ninguém precisa redigitar no painel o que
// já configurou no EasyPanel, e ninguém precisa mexer no deploy para trocar o
// destinatário de um alerta.
//
// O cache de 30 s existe porque isto é lido em job que roda em laço; a tela
// chama `esquecer()` depois de salvar, então a mudança aparece na hora.
const pool = require('../config/db');

const VALIDADE_CACHE_MS = 30000;

// As chaves que existem. Nada fora desta lista é aceito: tabela de chave/valor
// sem catálogo vira depósito de lixo em três meses.
const CHAVES = {
  alerta_email_para: { tipo: 'texto' },
  alerta_whatsapp_destino: { tipo: 'texto' },
  limite_mb_por_licitacao: { tipo: 'numero', minimo: 10, maximo: 10000 },
  coleta_hora_inicio: { tipo: 'numero', minimo: 0, maximo: 23 },
  coleta_hora_fim: { tipo: 'numero', minimo: 0, maximo: 23 },
};

let cache = null;
let cacheEm = 0;

function esquecer() {
  cache = null;
  cacheEm = 0;
}

/** Tudo o que está gravado, como mapa chave -> valor (string ou null). */
async function todas() {
  if (cache && Date.now() - cacheEm < VALIDADE_CACHE_MS) return cache;
  const mapa = {};
  try {
    const [linhas] = await pool.query('SELECT chave, valor FROM configuracoes');
    for (const l of linhas) mapa[l.chave] = l.valor;
  } catch (erro) {
    // Tabela ainda não migrada: o painel segue com o ambiente, sem quebrar.
    if (erro.code !== 'ER_NO_SUCH_TABLE') throw erro;
  }
  // Duas leituras simultâneas podem preencher o cache duas vezes, com o mesmo
  // conteúdo: é desperdício de uma consulta, não corrupção de dado. Trancar
  // isso custaria mais do que a consulta que se evita.
  // eslint-disable-next-line require-atomic-updates
  cache = mapa;
  // eslint-disable-next-line require-atomic-updates
  cacheEm = Date.now();
  return cache;
}

/** Valor de texto, caindo no padrão quando a tabela não disser nada. */
async function texto(chave, padrao = '') {
  const mapa = await todas();
  const valor = mapa[chave];
  return valor === null || valor === undefined || valor === '' ? padrao : String(valor);
}

/** Valor numérico, caindo no padrão quando vazio ou ilegível. */
async function numero(chave, padrao) {
  const bruto = await texto(chave, '');
  if (bruto === '') return padrao;
  const n = Number(bruto);
  return Number.isFinite(n) ? n : padrao;
}

/** Lista para a tela: chave, valor, descrição. */
async function listar() {
  try {
    const [linhas] = await pool.query(
      'SELECT chave, valor, descricao, atualizado_em FROM configuracoes ORDER BY chave'
    );
    return linhas;
  } catch (erro) {
    if (erro.code === 'ER_NO_SUCH_TABLE') return [];
    throw erro;
  }
}

/**
 * Grava um conjunto de chaves. Valor vazio volta a NULL, isto é, volta a
 * obedecer o ambiente — é como se "limpa" uma configuração.
 * @returns {{gravadas:string[], recusadas:string[]}}
 */
async function salvar(campos = {}) {
  const gravadas = [];
  const recusadas = [];

  for (const [chave, bruto] of Object.entries(campos)) {
    const definicao = CHAVES[chave];
    if (!definicao) {
      recusadas.push(chave);
      continue;
    }

    let valor = bruto === null || bruto === undefined ? '' : String(bruto).trim();
    if (valor === '') {
      await pool.query('UPDATE configuracoes SET valor = NULL WHERE chave = ?', [chave]);
      gravadas.push(chave);
      continue;
    }

    if (definicao.tipo === 'numero') {
      const n = Number(valor);
      if (!Number.isFinite(n) || n < definicao.minimo || n > definicao.maximo) {
        recusadas.push(chave);
        continue;
      }
      valor = String(Math.round(n));
    }

    await pool.query(
      `INSERT INTO configuracoes (chave, valor) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
      [chave, valor.slice(0, 500)]
    );
    gravadas.push(chave);
  }

  esquecer();
  return { gravadas, recusadas };
}

module.exports = { CHAVES, todas, texto, numero, listar, salvar, esquecer };
