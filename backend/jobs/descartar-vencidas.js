// Job `descartar_vencidas` (seção 20.4) — alimentar o diagnóstico sem obrigar
// ninguém a descartar na mão.
//
// Licitação de pontuação baixa que ficou parada em Triagem até o prazo vencer
// não vai mais ser disputada. Deixá-la viva no Radar é ruído; apagá-la é perder
// a informação. Então ela vira `descartada` com motivo `nao_analisada`: fica
// fora do ranking de bloqueios (nada barrou — ninguém analisou) e conta no
// total, onde revela o outro problema, que é volume demais chegando.
//
// A regra do CLAUDE.md vale inteira aqui: decisão do usuário não se sobrescreve.
// Por isso o job só toca em card que ninguém moveu de Triagem, que não está
// favoritado e que ainda não tem descarte nenhum.
const pool = require('../config/db');
const fila = require('../servicos/fila');
const descarte = require('../regras/descarte');

// O corte da seção 6: abaixo de 30 é a faixa "baixa", a que não se analisa.
// Acima disso o painel não decide pelo usuário — a licitação vence o prazo e
// fica como estava, porque "eu ia olhar e não deu tempo" é informação diferente
// de "não valia olhar", e some se o job igualar as duas.
const CORTE = 30;

// Carência depois do prazo. O fim das propostas no PNCP às vezes é corrigido
// horas depois da data original; descartar no minuto seguinte produziria
// descarte de licitação que, no fim, foi reaberta.
const CARENCIA_HORAS = 24;

/**
 * Descarta as vencidas sem análise.
 * Idempotente: já descartada não entra no filtro, rodar de novo não muda nada.
 */
async function descartarVencidas({ corte = CORTE, limite = 2000 } = {}) {
  const [candidatas] = await pool.query(
    `SELECT id, valor_estimado, pontuacao
       FROM licitacoes
      WHERE descartada = 0
        AND etapa = 'Triagem'
        AND favorito = 0
        AND motivo_descarte IS NULL
        AND pontuacao < ?
        AND fim_propostas IS NOT NULL
        AND fim_propostas < DATE_SUB(NOW(), INTERVAL ? HOUR)
      ORDER BY fim_propostas ASC
      LIMIT ?`,
    [corte, CARENCIA_HORAS, limite]
  );

  if (!candidatas.length) return { descartadas: 0, valor: 0, corte };

  const ids = candidatas.map((l) => l.id);
  // `descartado_em` recebe a data do prazo, não a de hoje: o descarte aconteceu
  // quando o prazo venceu. Gravar NOW() jogaria, na primeira rodada do job em
  // produção, meses de licitações vencidas dentro do período de 90 dias.
  await pool.query(
    `UPDATE licitacoes
        SET descartada = 1,
            etapa = 'Descartada',
            etapa_em = NOW(),
            motivo_descarte = ?,
            descartado_em = fim_propostas
      WHERE id IN (?)`,
    [descarte.NAO_ANALISADA.chave, ids]
  );

  // Mudança de etapa vira anotação, como qualquer outra (Fase 6) — o histórico
  // do card tem de contar quem descartou, e aqui foi o painel.
  const valores = ids.map((id) => [id, 'Triagem → Descartada (prazo venceu sem análise)', 'sistema']);
  await pool.query('INSERT INTO anotacoes (licitacao_id, texto, tipo) VALUES ?', [valores]);

  const valor = candidatas.reduce((soma, l) => soma + Number(l.valor_estimado || 0), 0);
  return { descartadas: ids.length, valor: Math.round(valor * 100) / 100, corte };
}

function registrarNaFila() {
  fila.registrar('descartar_vencidas', (payload) => descartarVencidas(payload || {}));
}

module.exports = { descartarVencidas, registrarNaFila, CORTE, CARENCIA_HORAS };
