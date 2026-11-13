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
const { ehOperadora } = require('./escopo');

const VALIDADE_CACHE_MS = 30000;

// As chaves que existem. Nada fora desta lista é aceito: tabela de chave/valor
// sem catálogo vira depósito de lixo em três meses.
//
// Seção 1b: as de OPERAÇÃO (CHAVES) valem para o serviço inteiro e só a
// organização operadora muda; as de PREFERÊNCIA (CHAVES_ORG) são de cada
// organização, em `org_configuracoes`.
const CHAVES_ORG = {
  alerta_email_para: { tipo: 'texto', descricao: 'Para quem vai o e-mail de alerta desta organização.' },
  alerta_whatsapp_destino: { tipo: 'texto', descricao: 'Número do WhatsApp que recebe o alerta, com DDI.' },
};

const CHAVES = {
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

/**
 * Preferência de uma organização, caindo no padrão quando vazia. O padrão do
 * ambiente (ALERTA_PARA, WHATSAPP_DESTINO) só vale para a organização
 * operadora: para as outras, cair nele mandaria o alerta de um cliente para a
 * caixa de outro.
 */
async function textoDaOrganizacao(organizacaoId, chave, padrao = '') {
  const [[linha]] = await pool.query(
    'SELECT valor FROM org_configuracoes WHERE organizacao_id = ? AND chave = ?',
    [organizacaoId, chave]
  );
  const valor = linha && linha.valor;
  if (valor !== null && valor !== undefined && valor !== '') return String(valor);
  return ehOperadora(organizacaoId) ? padrao : '';
}

/**
 * Lista para a tela: as preferências da organização e, marcadas `global`, as
 * de operação (que só a operadora edita — `editavel` diz isso à tela).
 */
async function listar(organizacaoId) {
  const [daOrg] = await pool.query('SELECT chave, valor, atualizado_em FROM org_configuracoes WHERE organizacao_id = ?', [
    organizacaoId,
  ]);
  const porChave = new Map(daOrg.map((l) => [l.chave, l]));
  const preferencias = Object.entries(CHAVES_ORG).map(([chave, def]) => ({
    chave,
    valor: porChave.has(chave) ? porChave.get(chave).valor : null,
    descricao: def.descricao,
    atualizado_em: porChave.has(chave) ? porChave.get(chave).atualizado_em : null,
    global: false,
    editavel: true,
  }));

  let operacao = [];
  try {
    const [linhas] = await pool.query(
      'SELECT chave, valor, descricao, atualizado_em FROM configuracoes ORDER BY chave'
    );
    const editavel = ehOperadora(organizacaoId);
    operacao = linhas.filter((l) => CHAVES[l.chave]).map((l) => ({ ...l, global: true, editavel }));
  } catch (erro) {
    if (erro.code !== 'ER_NO_SUCH_TABLE') throw erro;
  }
  return [...preferencias, ...operacao];
}

/**
 * Grava um conjunto de chaves. Valor vazio volta a NULL, isto é, volta a
 * obedecer o ambiente — é como se "limpa" uma configuração.
 * @returns {{gravadas:string[], recusadas:string[]}}
 */
async function salvar(organizacaoId, campos = {}) {
  const gravadas = [];
  const recusadas = [];
  const operadora = ehOperadora(organizacaoId);

  for (const [chave, bruto] of Object.entries(campos)) {
    const daOrganizacao = CHAVES_ORG[chave];
    // Chave de operação pedida por quem não opera o serviço: recusada.
    const definicao = daOrganizacao || (operadora ? CHAVES[chave] : null);
    if (!definicao) {
      recusadas.push(chave);
      continue;
    }

    let valor = bruto === null || bruto === undefined ? '' : String(bruto).trim();

    if (daOrganizacao) {
      await pool.query(
        `INSERT INTO org_configuracoes (organizacao_id, chave, valor) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
        [organizacaoId, chave, valor === '' ? null : valor.slice(0, 500)]
      );
      gravadas.push(chave);
      continue;
    }

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

module.exports = { CHAVES, CHAVES_ORG, todas, texto, numero, textoDaOrganizacao, listar, salvar, esquecer };
