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
const escopo = require('../servicos/escopo');
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
async function descartarVencidas({ corte = CORTE, limite = 2000, organizacaoId = null } = {}) {
  // Seção 1b: o descarte é da organização. Cada linha é (organização,
  // licitação): a mesma vencida pode ser descartada para uma e estar em
  // "Vou disputar" para outra.
  const [candidatas] = await pool.query(
    `SELECT id, organizacao_id, valor_estimado, pontuacao
       FROM ${escopo.porOrganizacao()} l
      WHERE descartada = 0
        ${organizacaoId ? `AND organizacao_id = ${escopo.idOrganizacao(organizacaoId)}` : ''}
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

  // `descartado_em` recebe a data do prazo, não a de hoje: o descarte aconteceu
  // quando o prazo venceu. Gravar NOW() jogaria, na primeira rodada do job em
  // produção, meses de licitações vencidas dentro do período de 90 dias.
  for (const [orgId, linhas] of escopo.agruparPorOrganizacao(candidatas)) {
    const ids = linhas.map((l) => l.id);
    await pool.query(
      `UPDATE org_licitacoes o JOIN licitacoes l ON l.id = o.licitacao_id
          SET o.descartada = 1,
              o.etapa = 'Descartada',
              o.etapa_em = NOW(),
              o.motivo_descarte = ?,
              o.descartado_em = l.fim_propostas
        WHERE o.organizacao_id = ? AND o.licitacao_id IN (?)`,
      [descarte.NAO_ANALISADA.chave, orgId, ids]
    );

    // Mudança de etapa vira anotação, como qualquer outra (Fase 6) — o histórico
    // do card tem de contar quem descartou, e aqui foi o painel.
    const valores = ids.map((id) => [orgId, id, 'Triagem → Descartada (prazo venceu sem análise)', 'sistema']);
    await pool.query('INSERT INTO anotacoes (organizacao_id, licitacao_id, texto, tipo) VALUES ?', [valores]);
  }

  const valor = candidatas.reduce((soma, l) => soma + Number(l.valor_estimado || 0), 0);
  return { descartadas: candidatas.length, valor: Math.round(valor * 100) / 100, corte };
}

function registrarNaFila() {
  fila.registrar('descartar_vencidas', (payload) => descartarVencidas(payload || {}));
}

module.exports = { descartarVencidas, registrarNaFila, CORTE, CARENCIA_HORAS };
