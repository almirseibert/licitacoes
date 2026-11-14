// Pesos da pontuação lidos da tabela `regras_pontuacao` (seção 6).
//
// `aderencia.js` continua sem ler configuração por conta própria: quem chama
// `pontuar()` passa os pesos. Este módulo é o único lugar que fala com o banco,
// e guarda o resultado por alguns segundos para a coleta não consultar a cada
// licitação.
const pool = require('../config/db');
const { PESOS } = require('./aderencia');

const VALIDADE_MS = 30000;
// Um cache por organização (Seção 1b): cada cliente tem os seus pesos.
const cache = new Map(); // organizacaoId -> { pesos, em }

// Rótulo e grupo de cada peso, para a tela de Configurações (seção 11.13).
// Chave que não estiver aqui continua funcionando, mas não aparece na tela —
// é o caso das chaves estruturais (titulo_caracteres, uf_empresa...).
const CATALOGO = {
  palavra_max: { grupo: 'Palavra-chave', rotulo: 'Máximo pela palavra-chave', descricao: 'Teto dos pontos que uma palavra pode somar.' },
  palavra_titulo_multiplicador: { grupo: 'Palavra-chave', rotulo: 'Multiplicador no início do objeto', descricao: 'Casar no começo do objeto vale este múltiplo.' },

  valor_ate_5k: { grupo: 'Valor', rotulo: 'Abaixo de R$ 5 mil' },
  valor_5k_80k: { grupo: 'Valor', rotulo: 'R$ 5 mil a R$ 80 mil', descricao: 'Faixa da exclusividade ME/EPP — art. 48, I.' },
  valor_80k_200k: { grupo: 'Valor', rotulo: 'R$ 80 mil a R$ 200 mil' },
  valor_acima_200k: { grupo: 'Valor', rotulo: 'Acima de R$ 200 mil' },

  modalidade: { grupo: 'Modalidade', rotulo: 'Pontos por modalidade', descricao: 'Um valor por tipo de disputa.' },

  beneficio_exclusivo: { grupo: 'Benefício ME/EPP', rotulo: 'Item exclusivo ME/EPP', descricao: 'Art. 48, I — concorrência menor.' },
  beneficio_cota: { grupo: 'Benefício ME/EPP', rotulo: 'Cota reservada de 25%', descricao: 'Art. 48, III.' },

  uf_casa: { grupo: 'Localização', rotulo: 'Estado da empresa' },
  uf_vizinhas: { grupo: 'Localização', rotulo: 'Estados vizinhos' },
  uf_demais: { grupo: 'Localização', rotulo: 'Demais estados (disputa eletrônica)' },
  visita_fora_do_estado: { grupo: 'Localização', rotulo: 'Exige visita técnica fora do estado' },

  prazo_mais_7d: { grupo: 'Prazo', rotulo: 'Mais de 7 dias até o fim' },
  prazo_3a7d: { grupo: 'Prazo', rotulo: 'De 3 a 7 dias' },
  prazo_menos_3d: { grupo: 'Prazo', rotulo: 'Menos de 3 dias' },

  palavra_excluida: { grupo: 'Penalidades', rotulo: 'Palavra excluída no objeto', descricao: 'A licitação some do Radar.' },
  objeto_social_fora: { grupo: 'Penalidades', rotulo: 'Objeto social não cobre', descricao: 'Nenhum CNAE da empresa cobre o objeto (seção 6.2).' },
  objeto_social_parcial: { grupo: 'Penalidades', rotulo: 'Objeto social cobre parcialmente' },
  orcamento_sigiloso: { grupo: 'Penalidades', rotulo: 'Orçamento sigiloso' },
  sem_atestado: { grupo: 'Penalidades', rotulo: 'Exige atestado que não temos', descricao: 'Aplicado a partir da leitura do edital (Fase 4).' },
  sem_conselho: { grupo: 'Penalidades', rotulo: 'Exige registro em conselho', descricao: 'Aplicado a partir da leitura do edital (Fase 4).' },
  capital_insuficiente: { grupo: 'Penalidades', rotulo: 'Exige capital acima do nosso', descricao: 'Aplicado a partir da leitura do edital (Fase 4).' },
  garantia_proposta: { grupo: 'Penalidades', rotulo: 'Exige garantia de proposta' },
};

/** Lista para a tela: valor atual, padrão de fábrica e de onde veio. */
async function listar(organizacaoId) {
  const [linhas] = await pool.query('SELECT chave, valor FROM regras_pontuacao WHERE organizacao_id = ?', [
    organizacaoId,
  ]);
  const salvos = new Map(linhas.map((l) => [l.chave, typeof l.valor === 'string' ? JSON.parse(l.valor) : l.valor]));

  return Object.entries(CATALOGO).map(([chave, meta]) => ({
    chave,
    grupo: meta.grupo,
    rotulo: meta.rotulo,
    descricao: meta.descricao || null,
    valor: salvos.has(chave) ? salvos.get(chave) : PESOS[chave],
    padrao: PESOS[chave],
    alterado: salvos.has(chave) && JSON.stringify(salvos.get(chave)) !== JSON.stringify(PESOS[chave]),
  }));
}

/** Pesos efetivos: os de fábrica com o que o usuário mudou por cima. */
async function carregar(organizacaoId, { semCache = false } = {}) {
  const guardado = cache.get(organizacaoId);
  if (!semCache && guardado && Date.now() - guardado.em < VALIDADE_MS) return guardado.pesos;

  const [linhas] = await pool.query('SELECT chave, valor FROM regras_pontuacao WHERE organizacao_id = ?', [
    organizacaoId,
  ]);
  const pesos = { ...PESOS };
  for (const linha of linhas) {
    const valor = typeof linha.valor === 'string' ? JSON.parse(linha.valor) : linha.valor;
    if (valor === null || valor === undefined) continue;
    // `modalidade` é um objeto: mescla para não perder uma chave que a tela não enviou.
    if (linha.chave === 'modalidade' && typeof valor === 'object') {
      pesos.modalidade = { ...PESOS.modalidade, ...valor };
    } else {
      pesos[linha.chave] = valor;
    }
  }

  // Duas leituras simultâneas podem preencher o cache duas vezes, com o mesmo
  // conteúdo: é desperdício de uma consulta, não corrupção de dado.
  cache.set(organizacaoId, { pesos, em: Date.now() });
  return pesos;
}

function limparCache(organizacaoId) {
  if (organizacaoId === undefined) cache.clear();
  else cache.delete(organizacaoId);
}

/**
 * Grava os pesos que a tela mandou. Só aceita chaves do catálogo e números
 * dentro de -100 a 100 — peso digitado errado não pode quebrar a pontuação.
 */
async function salvar(organizacaoId, alteracoes) {
  const entradas = Object.entries(alteracoes || {});
  if (!entradas.length) throw new Error('Nenhum peso para salvar.');

  for (const [chave, valor] of entradas) {
    if (!CATALOGO[chave]) throw new Error(`Peso desconhecido: "${chave}".`);
    validar(chave, valor);
  }

  for (const [chave, valor] of entradas) {
    const meta = CATALOGO[chave];
    await pool.query(
      `INSERT INTO regras_pontuacao (organizacao_id, chave, valor, rotulo, grupo, descricao)
       VALUES (?, ?, CAST(? AS JSON), ?, ?, ?)
       ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
      [organizacaoId, chave, JSON.stringify(valor), meta.rotulo, meta.grupo, meta.descricao || null]
    );
  }

  limparCache(organizacaoId);
  return entradas.length;
}

function validar(chave, valor) {
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor) || valor < -100 || valor > 100) {
      throw new Error(`"${CATALOGO[chave].rotulo}" precisa ser um número entre -100 e 100.`);
    }
    return;
  }
  if (chave === 'modalidade' && valor && typeof valor === 'object') {
    for (const [tipo, pontos] of Object.entries(valor)) {
      if (!(tipo in PESOS.modalidade)) throw new Error(`Modalidade desconhecida: "${tipo}".`);
      if (typeof pontos !== 'number' || pontos < -100 || pontos > 100) {
        throw new Error(`Os pontos de "${tipo}" precisam ser um número entre -100 e 100.`);
      }
    }
    return;
  }
  throw new Error(`Valor inválido para "${CATALOGO[chave].rotulo}".`);
}

/** Volta um peso ao padrão de fábrica. */
async function restaurar(organizacaoId, chave) {
  if (!CATALOGO[chave]) throw new Error(`Peso desconhecido: "${chave}".`);
  await pool.query('DELETE FROM regras_pontuacao WHERE organizacao_id = ? AND chave = ?', [organizacaoId, chave]);
  limparCache(organizacaoId);
}

module.exports = { listar, carregar, salvar, restaurar, limparCache, CATALOGO };
