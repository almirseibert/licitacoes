// Classifica no catálogo de segmentos o que ainda não foi (area/segmento NULL). Barato e idempotente:
// só olha linhas sem segmento, em lotes, e agrupa os UPDATEs por (área, segmento).
// Não vai à internet e não chama IA (CLAUDE.md: a IA só roda por clique).
const pool = require('../config/db');
const { classificar } = require('../regras/segmentos');

const TABELAS = ['historico_precos', 'mercado_contratos', 'mercado_atas'];

async function segmentarTabela(tabela, { lote = 2000, limite = Infinity } = {}) {
  let feitos = 0;
  let semClassificacao = 0;
  let ultimoId = 0;

  while (feitos < limite) {
    const [linhas] = await pool.query(
      `SELECT id, objeto FROM ${tabela} WHERE segmento IS NULL AND id > ? ORDER BY id LIMIT ?`,
      [ultimoId, lote]
    );
    if (!linhas.length) break;
    ultimoId = linhas[linhas.length - 1].id;

    const grupos = new Map();
    for (const l of linhas) {
      const r = classificar(l.objeto);
      if (!r.classificado) semClassificacao += 1;
      const chave = `${r.area}\u0000${r.segmento}`;
      if (!grupos.has(chave)) grupos.set(chave, { area: r.area, segmento: r.segmento, ids: [] });
      grupos.get(chave).ids.push(l.id);
    }
    for (const g of grupos.values()) {
      await pool.query(`UPDATE ${tabela} SET area = ?, segmento = ? WHERE id IN (?)`, [g.area, g.segmento, g.ids]);
    }
    feitos += linhas.length;
  }
  return { tabela, classificadas: feitos, sem_classificacao: semClassificacao };
}

async function segmentarTudo(opcoes = {}) {
  const resultado = [];
  for (const tabela of TABELAS) resultado.push(await segmentarTabela(tabela, opcoes));
  return resultado;
}

function registrarNaFila() {
  require('../servicos/fila').registrar('segmentar', () => segmentarTudo());
}

module.exports = { segmentarTabela, segmentarTudo, registrarNaFila, TABELAS };
