// Feriados (seção 25.1) — nacionais da BrasilAPI, estaduais e municipais da mão.
//
// Não existe fonte única e confiável para feriado estadual e municipal no
// Brasil: cada ente publica o seu em lei própria, e nenhuma API cobre todos.
// Por isso os nacionais vêm de fora e os outros são cadastrados — e um feriado
// municipal faltando não quebra o cálculo, só o torna conservador de um dia,
// o que é o lado certo para errar num prazo.
const pool = require('../config/db');
const { buscarJson } = require('./http');

const BRASILAPI = 'https://brasilapi.com.br/api/feriados/v1';

function chaveDe({ data, abrangencia, uf, municipio }) {
  const dia = String(data).slice(0, 10);
  return [dia, abrangencia, uf || '', municipio || ''].join('|').slice(0, 80);
}

/** Guarda um feriado. Idempotente pela chave de propósito. */
async function guardar({ data, nome, abrangencia = 'nacional', uf = null, municipio = null, origem = 'manual' }) {
  const dia = String(data).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw new Error(`data inválida: ${data}`);
  if (abrangencia === 'estadual' && !uf) throw new Error('feriado estadual precisa da UF.');
  if (abrangencia === 'municipal' && !municipio) throw new Error('feriado municipal precisa do município.');

  const [r] = await pool.query(
    `INSERT INTO feriados (data, nome, abrangencia, uf, municipio, origem, chave)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE nome = VALUES(nome)`,
    [dia, String(nome || 'feriado').slice(0, 120), abrangencia, uf, municipio, origem, chaveDe({ data: dia, abrangencia, uf, municipio })]
  );
  return { nova: Boolean(r.insertId) };
}

/**
 * Baixa os feriados nacionais de um ano na BrasilAPI.
 * Ano já baixado não é rebaixado: feriado nacional não muda depois de publicado.
 */
async function importarNacionais(ano, { forcar = false } = {}) {
  const [[ja]] = await pool.query(
    "SELECT COUNT(*) AS n FROM feriados WHERE abrangencia = 'nacional' AND YEAR(data) = ?",
    [ano]
  );
  if (Number(ja.n) >= 8 && !forcar) return { ano, baixados: 0, ja: Number(ja.n) };

  const lista = await buscarJson(`${BRASILAPI}/${ano}`);
  if (!Array.isArray(lista)) throw new Error('a BrasilAPI respondeu em formato inesperado.');

  let novos = 0;
  for (const f of lista) {
    const r = await guardar({ data: f.date, nome: f.name, abrangencia: 'nacional', origem: 'brasilapi' });
    if (r.nova) novos += 1;
  }
  return { ano, baixados: lista.length, novos };
}

/**
 * Garante os feriados dos anos que o cálculo vai precisar: o corrente e o
 * seguinte. Licitação que abre em janeiro conta dias úteis de dezembro.
 */
async function garantirAnos({ de = new Date().getFullYear(), ate = new Date().getFullYear() + 1 } = {}) {
  const resultados = [];
  for (let ano = de; ano <= ate; ano += 1) {
    try {
      resultados.push(await importarNacionais(ano));
    } catch (erro) {
      // Sem internet o painel não trava: usa o que já tem e diz o que faltou.
      resultados.push({ ano, erro: erro.message });
    }
  }
  return resultados;
}

/**
 * Os feriados que podem valer para um cálculo. Devolve tudo o que é nacional,
 * mais o estadual e o municipal — a filtragem por UF e município é da regra,
 * que sabe de que órgão se trata.
 */
async function listar({ de, ate } = {}) {
  const condicoes = [];
  const valores = [];
  if (de) {
    condicoes.push('data >= ?');
    valores.push(String(de).slice(0, 10));
  }
  if (ate) {
    condicoes.push('data <= ?');
    valores.push(String(ate).slice(0, 10));
  }
  const [linhas] = await pool.query(
    `SELECT id, data, nome, abrangencia, uf, municipio, origem FROM feriados
     ${condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : ''}
     ORDER BY data`,
    valores
  );
  return linhas;
}

async function remover(id) {
  const [r] = await pool.query("DELETE FROM feriados WHERE id = ? AND origem <> 'brasilapi'", [id]);
  return r.affectedRows > 0;
}

module.exports = { guardar, importarNacionais, garantirAnos, listar, remover, chaveDe };
