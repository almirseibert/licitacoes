// Preço de referência e concorrência (seção 12) — a parte que fala com o banco.
// A matemática fica em regras/preco.js.
const pool = require('../config/db');
const { daOrganizacao } = require('./escopo');
const regras = require('../regras/preco');

/**
 * A referência que melhor serve a uma licitação, em três degraus:
 *   1. grupo + família dela;
 *   2. 'Geral' + a mesma família;
 *   3. 'Geral' + 'Pregão', que é a linha mais larga do estudo.
 *
 * Em cada degrau o calculado ganha do estudo, mas só com amostra suficiente —
 * oito encerradas não mandam mais do que 1.371 contratações levantadas à mão.
 */
async function referenciaPara({ grupo, modalidade }) {
  const familia = regras.familiaModalidade(modalidade);
  const degraus = [
    { grupo: grupo || 'Geral', familia },
    { grupo: 'Geral', familia },
    { grupo: 'Geral', familia: 'Pregão' },
  ];

  for (const degrau of degraus) {
    if (!degrau.grupo || !degrau.familia) continue;
    const [linhas] = await pool.query(
      `SELECT * FROM precos_referencia
        WHERE grupo = ? AND familia = ?
          AND (origem = 'estudo' OR amostra >= ?)
        ORDER BY FIELD(origem, 'calculado', 'estudo')
        LIMIT 1`,
      [degrau.grupo, degrau.familia, regras.AMOSTRA_MINIMA]
    );
    if (linhas.length) {
      return {
        ...linhas[0],
        // O que a tela diz embaixo do número: de onde ele veio.
        base:
          degrau.grupo === (grupo || 'Geral') && degrau.familia === familia
            ? `${degrau.grupo} · ${degrau.familia}`
            : `${degrau.grupo} · ${degrau.familia} (sem amostra do grupo desta licitação)`,
      };
    }
  }

  return null;
}

/** O bloco da seção 12 para uma licitação. */
async function resumoDaLicitacao(organizacaoId, licitacaoId) {
  const [[licitacao]] = await pool.query(
    `SELECT id, objeto, grupo, modalidade, valor_estimado, valor_homologado,
            custo_estimado, orcamento_sigiloso, valor_proposto, etapa
       FROM ${daOrganizacao(organizacaoId, { todas: true })} l WHERE id = ?`,
    [licitacaoId]
  );
  if (!licitacao) return null;

  const referencia = await referenciaPara(licitacao);
  const faixa = regras.faixa({ valorEstimado: licitacao.valor_estimado, referencia });
  const custo = licitacao.custo_estimado;

  return {
    licitacao: {
      id: licitacao.id,
      grupo: licitacao.grupo,
      modalidade: licitacao.modalidade,
      familia: regras.familiaModalidade(licitacao.modalidade),
      valor_estimado: licitacao.valor_estimado,
      custo_estimado: custo,
      valor_proposto: licitacao.valor_proposto,
      orcamento_sigiloso: licitacao.orcamento_sigiloso,
    },
    referencia: referencia && {
      grupo: referencia.grupo,
      familia: referencia.familia,
      base: referencia.base,
      origem: referencia.origem,
      amostra: referencia.amostra,
      apurado_em: referencia.apurado_em,
      desconto_mediano: numero(referencia.desconto_mediano),
      desconto_q1: numero(referencia.desconto_q1),
      desconto_q3: numero(referencia.desconto_q3),
      pct_acima_estimado: numero(referencia.pct_acima_estimado),
      pct_sem_homologacao: numero(referencia.pct_sem_homologacao),
      mediana_propostas: referencia.mediana_propostas,
    },
    ...faixa,
    margem_mediana: regras.margem({ custo, preco: faixa.fecha_por }),
    margem_proposta: regras.margem({ custo, preco: licitacao.valor_proposto }),
    // Orçamento sigiloso: sem estimado não há faixa, e dizer isso é melhor do
    // que mostrar zero.
    aviso: licitacao.orcamento_sigiloso
      ? 'Orçamento sigiloso: o órgão não publicou o estimado, então não dá para projetar a faixa.'
      : !licitacao.valor_estimado
        ? 'Esta licitação veio sem valor estimado: a faixa só aparece quando o órgão publicar.'
        : null,
    contexto: regras.CONTEXTO_DO_ESTUDO,
  };
}

// `Number(null)` é 0: quartil ausente tem de chegar à tela como ausente, não
// como "zero por cento de desconto".
function numero(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/**
 * Recalcula `precos_referencia` a partir de `historico_precos`.
 *
 * DIVERGÊNCIA DA SPEC, registrada como o CLAUDE.md pede: a seção 14 chama este
 * job `recalcular_precos` e manda "mensal, dia 1". Na prática ele roda **todo
 * dia**, de carona na coleta diária de encerradas (`jobs/encerradas.js`, 03h) —
 * chamado direto, sem passar pela fila com esse nome. Diário é estritamente
 * melhor: mediana mais fresca, pelo mesmo custo de uma consulta que já ia
 * rodar de qualquer forma. Não há `recalcular_precos` separado no worker.
 *
 * As linhas do estudo nunca são apagadas: elas são o chão quando a amostra
 * própria ainda é pequena. O cálculo grava com `origem = 'calculado'`, numa
 * linha própria, e `referenciaPara` escolhe.
 */
async function recalcular() {
  const [combinacoes] = await pool.query(
    `SELECT grupo, familia FROM historico_precos
      WHERE familia IS NOT NULL AND familia <> ''
      GROUP BY grupo, familia`
  );

  // 'Geral' é o agregado de todos os grupos da mesma família.
  const familias = [...new Set(combinacoes.map((c) => c.familia))];
  const alvos = [
    ...combinacoes.filter((c) => c.grupo),
    ...familias.map((familia) => ({ grupo: 'Geral', familia })),
  ];

  let gravadas = 0;
  for (const alvo of alvos) {
    const [linhas] = await pool.query(
      `SELECT desconto, sem_homologacao FROM historico_precos
        WHERE familia = ? ${alvo.grupo === 'Geral' ? '' : 'AND grupo = ?'}`,
      alvo.grupo === 'Geral' ? [alvo.familia] : [alvo.familia, alvo.grupo]
    );

    const e = regras.estatistica(linhas);
    if (!e.amostra) continue;

    await pool.query(
      `INSERT INTO precos_referencia
         (grupo, familia, desconto_mediano, desconto_q1, desconto_q3,
          pct_acima_estimado, pct_sem_homologacao, mediana_propostas, amostra,
          origem, apurado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'calculado', CURDATE())
       ON DUPLICATE KEY UPDATE
         desconto_mediano = VALUES(desconto_mediano),
         desconto_q1 = VALUES(desconto_q1),
         desconto_q3 = VALUES(desconto_q3),
         pct_acima_estimado = VALUES(pct_acima_estimado),
         pct_sem_homologacao = VALUES(pct_sem_homologacao),
         amostra = VALUES(amostra),
         apurado_em = VALUES(apurado_em)`,
      [
        alvo.grupo,
        alvo.familia,
        e.desconto_mediano,
        e.desconto_q1,
        e.desconto_q3,
        e.pct_acima_estimado,
        e.pct_sem_homologacao,
        e.mediana_propostas,
        e.amostra,
      ]
    );
    gravadas += 1;
  }

  return { gravadas, combinacoes: alvos.length };
}

/** A tabela inteira, para a tela de preço de referência. */
async function listarReferencias() {
  const [linhas] = await pool.query(
    `SELECT * FROM precos_referencia
      ORDER BY FIELD(grupo, 'Geral') DESC, grupo, FIELD(familia, 'Pregão', 'Dispensa'), familia`
  );
  const [[totais]] = await pool.query(
    `SELECT COUNT(*) AS encerradas,
            SUM(sem_homologacao) AS sem_homologacao,
            MIN(encerrada_em) AS de, MAX(encerrada_em) AS ate
       FROM historico_precos`
  );
  return {
    dados: linhas.map((l) => ({
      ...l,
      desconto_mediano: numero(l.desconto_mediano),
      desconto_q1: numero(l.desconto_q1),
      desconto_q3: numero(l.desconto_q3),
      pct_acima_estimado: numero(l.pct_acima_estimado),
      pct_sem_homologacao: numero(l.pct_sem_homologacao),
    })),
    amostra: {
      encerradas: Number(totais.encerradas || 0),
      sem_homologacao: Number(totais.sem_homologacao || 0),
      de: totais.de,
      ate: totais.ate,
    },
    minimo: regras.AMOSTRA_MINIMA,
    contexto: regras.CONTEXTO_DO_ESTUDO,
  };
}

/** Concorrentes de uma licitação: quem venceu cada item, e por quanto. */
async function concorrentesDa(licitacaoId) {
  const [linhas] = await pool.query(
    `SELECT p.*, i.descricao, i.quantidade, i.unidade, i.valor_unit_estimado
       FROM propostas_concorrentes p
       LEFT JOIN licitacao_itens i
              ON i.licitacao_id = p.licitacao_id AND i.numero_item = p.item_numero
      WHERE p.licitacao_id = ?
      ORDER BY p.item_numero, p.posicao, COALESCE(p.valor_negociado, p.valor_ofertado)`,
    [licitacaoId]
  );

  // Agrupa por empresa: é assim que a aba responde "quem eu encontro aqui".
  const porEmpresa = new Map();
  for (const linha of linhas) {
    const chave = linha.cnpj || linha.empresa || '—';
    if (!porEmpresa.has(chave)) {
      porEmpresa.set(chave, {
        cnpj: linha.cnpj,
        empresa: linha.empresa,
        uf: linha.uf,
        me_epp: linha.me_epp,
        itens: 0,
        total: 0,
      });
    }
    const atual = porEmpresa.get(chave);
    atual.itens += 1;
    atual.total += Number(linha.valor_negociado || linha.valor_ofertado || 0);
  }

  return { dados: linhas, empresas: [...porEmpresa.values()].sort((a, b) => b.total - a.total) };
}

/**
 * Ficha de um concorrente pelo CNPJ: onde apareceu, quanto levou, em que UF.
 * É a base do dossiê da seção 26, que vem completo na fase 12.
 */
async function perfilDoConcorrente(organizacaoId, cnpj) {
  const limpo = String(cnpj || '').replace(/\D/g, '');
  if (!limpo) return null;

  const [[resumo]] = await pool.query(
    `SELECT MAX(p.empresa) AS empresa, MAX(p.uf) AS uf, MAX(p.me_epp) AS me_epp,
            COUNT(DISTINCT p.licitacao_id) AS licitacoes,
            COUNT(*) AS itens,
            SUM(COALESCE(p.valor_negociado, p.valor_ofertado)) AS total
       FROM propostas_concorrentes p
      WHERE p.cnpj = ?`,
    [limpo]
  );
  if (!resumo || !Number(resumo.itens)) return null;

  const [licitacoes] = await pool.query(
    `SELECT l.id, l.objeto, l.orgao_nome, l.uf, l.modalidade, l.grupo,
            l.valor_estimado, l.valor_homologado, l.etapa, l.fim_propostas,
            COUNT(p.id) AS itens,
            SUM(COALESCE(p.valor_negociado, p.valor_ofertado)) AS levou
       FROM propostas_concorrentes p
       JOIN ${daOrganizacao(organizacaoId, { todas: true })} l ON l.id = p.licitacao_id
      WHERE p.cnpj = ?
      GROUP BY l.id
      ORDER BY l.fim_propostas DESC
      LIMIT 50`,
    [limpo]
  );

  const [grupos] = await pool.query(
    `SELECT l.grupo, COUNT(DISTINCT l.id) AS licitacoes
       FROM propostas_concorrentes p
       JOIN ${daOrganizacao(organizacaoId, { todas: true })} l ON l.id = p.licitacao_id
      WHERE p.cnpj = ? AND l.grupo IS NOT NULL
      GROUP BY l.grupo
      ORDER BY licitacoes DESC`,
    [limpo]
  );

  return {
    cnpj: limpo,
    empresa: resumo.empresa,
    uf: resumo.uf,
    me_epp: Number(resumo.me_epp) ? 1 : 0,
    licitacoes: Number(resumo.licitacoes),
    itens: Number(resumo.itens),
    total: Number(resumo.total || 0),
    grupos,
    historico: licitacoes,
  };
}

/** Os concorrentes que mais aparecem, para a tela de preço e concorrência. */
async function listarConcorrentes({ organizacaoId, grupo, limite = 50 } = {}) {
  const [linhas] = await pool.query(
    `SELECT p.cnpj, MAX(p.empresa) AS empresa, MAX(p.uf) AS uf, MAX(p.me_epp) AS me_epp,
            COUNT(DISTINCT p.licitacao_id) AS licitacoes,
            SUM(COALESCE(p.valor_negociado, p.valor_ofertado)) AS total
       FROM propostas_concorrentes p
       JOIN ${daOrganizacao(organizacaoId, { todas: true })} l ON l.id = p.licitacao_id
      WHERE p.cnpj IS NOT NULL ${grupo ? 'AND l.grupo = ?' : ''}
      GROUP BY p.cnpj
      ORDER BY licitacoes DESC, total DESC
      LIMIT ?`,
    grupo ? [grupo, Number(limite)] : [Number(limite)]
  );
  return linhas.map((l) => ({ ...l, total: Number(l.total || 0) }));
}

module.exports = {
  referenciaPara,
  resumoDaLicitacao,
  recalcular,
  listarReferencias,
  concorrentesDa,
  perfilDoConcorrente,
  listarConcorrentes,
};
