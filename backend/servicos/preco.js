// Preço de referência e concorrência (seção 12) — a parte que fala com o banco.
// A matemática fica em regras/preco.js.
const pool = require('../config/db');
const { daOrganizacao } = require('./escopo');
const regras = require('../regras/preco');
const segmentos = require('../regras/segmentos');
const segmentar = require('../jobs/segmentar');

// As linhas de `precos_referencia` por ÁREA (agregado de vários segmentos) levam este prefixo no
// campo `grupo`, para não colidir com um segmento de mesmo nome e sem mudar a chave única da tabela.
const PREFIXO_AREA = 'Área · ';

/**
 * A referência que melhor serve a uma licitação, do mais específico ao mais largo:
 *   1. o segmento do catálogo (classificado pelo objeto) + família dela;
 *   2. o grupo de palavras-chave (o das três linhas do estudo de 10/10/2026) + família;
 *   3. a área do catálogo + família;
 *   4. 'Geral' + a mesma família;
 *   5. 'Geral' + 'Pregão', que é a linha mais larga do estudo.
 *
 * Em cada degrau o calculado ganha do estudo, mas só com amostra suficiente —
 * oito encerradas não mandam mais do que 1.371 contratações levantadas à mão.
 * Chame com `objeto` (ou `segmento`/`area`) para usar o catálogo; sem eles só valem 2, 4 e 5.
 */
async function referenciaPara({ grupo, modalidade, objeto, segmento, area }) {
  const familia = regras.familiaModalidade(modalidade);
  if (!segmento && objeto) {
    const c = segmentos.classificar(objeto);
    if (c.classificado) {
      segmento = c.segmento;
      area = area || c.area;
    }
  }
  if (segmento && !area) area = segmentos.areaDoSegmento(segmento);

  const degraus = [
    segmento && { grupo: segmento, familia, nome: segmento },
    grupo && grupo !== 'Geral' && { grupo, familia, nome: grupo },
    area && { grupo: PREFIXO_AREA + area, familia, nome: `área ${area}` },
    { grupo: 'Geral', familia, nome: 'Geral' },
    { grupo: 'Geral', familia: 'Pregão', nome: 'Geral' },
  ].filter(Boolean);
  const maisEspecifico = degraus[0];

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
          degrau === maisEspecifico
            ? `${degrau.nome} · ${degrau.familia}`
            : `${degrau.nome} · ${degrau.familia} (sem amostra suficiente de ${maisEspecifico.nome})`,
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

  const referencia = await referenciaPara(licitacao); // `objeto` vem junto: é ele que acha o segmento
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
    // A frase que abre a aba: o que a referência diz para esta licitação, em português.
    frase: regras.fraseDaReferencia({
      referencia: referencia && {
        desconto_mediano: numero(referencia.desconto_mediano),
        desconto_q1: numero(referencia.desconto_q1),
        desconto_q3: numero(referencia.desconto_q3),
        pct_acima_estimado: numero(referencia.pct_acima_estimado),
      },
      segmento: referencia ? referencia.grupo : licitacao.grupo,
      familia: regras.familiaModalidade(licitacao.modalidade),
    }),
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
  // O que chegou depois da última rodada ainda não tem segmento: classifica antes de agrupar.
  await segmentar.segmentarTudo();

  const [linhas] = await pool.query(
    `SELECT grupo, area, segmento, familia, desconto, sem_homologacao FROM historico_precos
      WHERE familia IS NOT NULL AND familia <> ''`
  );

  // Uma passada na memória: cada linha entra no seu grupo de palavras-chave (as linhas do estudo),
  // no seu segmento, na sua área e no 'Geral' da família.
  const montes = new Map();
  const somar = (grupo, familia, linha) => {
    const chave = `${familia}\u0000${grupo}`;
    if (!montes.has(chave)) montes.set(chave, { grupo, familia, linhas: [] });
    montes.get(chave).linhas.push(linha);
  };
  for (const l of linhas) {
    if (l.grupo) somar(l.grupo, l.familia, l);
    if (l.segmento && l.segmento !== segmentos.SEM_CLASSIFICACAO.segmento) somar(l.segmento, l.familia, l);
    if (l.area && l.area !== segmentos.SEM_CLASSIFICACAO.area) somar(PREFIXO_AREA + l.area, l.familia, l);
    somar('Geral', l.familia, l);
  }

  let gravadas = 0;
  for (const alvo of montes.values()) {
    const e = regras.estatistica(alvo.linhas);
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

  return { gravadas, combinacoes: montes.size };
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

/**
 * Condições SQL (sobre `historico_precos`) dos filtros da tela: segmento OU área OU grupo de palavras-chave,
 * família, UF, esfera, faixa de valor estimado e período de encerramento. Valor inválido é ignorado —
 * filtro que não se entende não pode zerar a amostra calado.
 */
function condicoesDaAmostra({ grupo, area, segmento, familia, uf, esfera, valor_min, valor_max, de, ate } = {}) {
  // `grupo` é o campo antigo; a referência de uma licitação pode vir nomeada por segmento ou por "Área · X".
  if (!segmento && !area && grupo) {
    if (grupo.startsWith(PREFIXO_AREA)) area = grupo.slice(PREFIXO_AREA.length);
    else if (segmentos.areaDoSegmento(grupo)) segmento = grupo;
  }
  const onde = [];
  const valores = [];
  const numero_ = (v) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const dia = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);

  if (segmento) {
    onde.push('segmento = ?');
    valores.push(segmento);
  } else if (area) {
    onde.push('area = ?');
    valores.push(area);
  } else if (grupo && grupo !== 'Geral') {
    onde.push('grupo = ?');
    valores.push(grupo);
  }
  if (familia) {
    onde.push('familia = ?');
    valores.push(regras.familiaModalidade(familia));
  }
  const filtros = [];
  if (uf && /^[A-Za-z]{2}$/.test(String(uf))) {
    filtros.push(['uf = ?', String(uf).toUpperCase()]);
  }
  if (esfera) filtros.push(['esfera = ?', String(esfera)]);
  if (numero_(valor_min) !== null) filtros.push(['valor_estimado >= ?', numero_(valor_min)]);
  if (numero_(valor_max) !== null) filtros.push(['valor_estimado <= ?', numero_(valor_max)]);
  if (dia(de)) filtros.push(['encerrada_em >= ?', dia(de)]);
  if (dia(ate)) filtros.push(['encerrada_em <= ?', dia(ate)]);
  for (const [clausula, valor] of filtros) {
    onde.push(clausula);
    valores.push(valor);
  }
  return { onde, valores, filtrado: filtros.length > 0 };
}

/**
 * A referência para o que a tela escolheu. Sem filtro extra usa a tabela já calculada
 * (`referenciaPara`, com seus degraus); com UF, esfera, faixa de valor ou período calcula na hora sobre
 * a amostra filtrada — essas combinações são muitas demais para ficarem pré-calculadas.
 */
async function referenciaDoFiltro(params = {}) {
  let { area } = params;
  const { grupo, segmento } = params;
  if (segmento && !area) area = segmentos.areaDoSegmento(segmento);
  const modalidade = params.familia || 'Pregão';
  const familia = regras.familiaModalidade(modalidade);
  const rotulo = segmento || area || (grupo && grupo !== 'Geral' ? grupo : 'Geral');

  const cond = condicoesDaAmostra({ ...params, area, familia: modalidade });
  if (!cond.filtrado) {
    return { referencia: await referenciaPara({ grupo, modalidade, segmento, area }), rotulo, familia, filtrado: false };
  }

  const [linhas] = await pool.query(
    `SELECT desconto, sem_homologacao FROM historico_precos WHERE ${cond.onde.join(' AND ')}`,
    cond.valores
  );
  const e = regras.estatistica(linhas);
  const referencia = e.amostra
    ? { ...e, grupo: rotulo, familia, origem: 'calculado', apurado_em: null, base: `${rotulo} · ${familia} · só com os filtros aplicados` }
    : null;
  return { referencia, rotulo, familia, filtrado: true };
}

const comNumeros = (ref) =>
  ref && {
    ...ref,
    desconto_mediano: numero(ref.desconto_mediano),
    desconto_q1: numero(ref.desconto_q1),
    desconto_q3: numero(ref.desconto_q3),
    pct_acima_estimado: numero(ref.pct_acima_estimado),
    pct_sem_homologacao: numero(ref.pct_sem_homologacao),
  };

/**
 * O que a tela "Preço de referência" mostra: a frase, de onde vem o número, a referência para o
 * simulador e as opções dos seletores (catálogo Área → Segmento com a contagem de cada um).
 */
async function resumoDoSegmento(params = {}) {
  const { referencia, rotulo, familia, filtrado } = await referenciaDoFiltro(params);
  const ref = comNumeros(referencia);

  const [grupos] = await pool.query('SELECT DISTINCT grupo FROM precos_referencia ORDER BY FIELD(grupo, \'Geral\') DESC, grupo');
  const [familias] = await pool.query("SELECT DISTINCT familia FROM precos_referencia ORDER BY FIELD(familia, 'Pregão', 'Dispensa'), familia");
  const [ufs] = await pool.query("SELECT DISTINCT uf FROM historico_precos WHERE uf IS NOT NULL AND uf <> '' ORDER BY uf");
  const [esferas] = await pool.query("SELECT DISTINCT esfera FROM historico_precos WHERE esfera IS NOT NULL AND esfera <> '' ORDER BY esfera");
  const [contagens] = await pool.query(
    `SELECT area, segmento, COUNT(*) AS n FROM historico_precos
      WHERE sem_homologacao = 0 AND segmento IS NOT NULL GROUP BY area, segmento`
  );
  const n = new Map(contagens.map((c) => [`${c.area}\u0000${c.segmento}`, Number(c.n)]));
  const catalogo = segmentos.listarCatalogo().map((a) => {
    const lista = a.segmentos.map((nome) => ({ nome, n: n.get(`${a.area}\u0000${nome}`) || 0 }));
    return { area: a.area, n: lista.reduce((t, x) => t + x.n, 0), segmentos: lista };
  });
  const semClassificacao = n.get(`${segmentos.SEM_CLASSIFICACAO.area}\u0000${segmentos.SEM_CLASSIFICACAO.segmento}`) || 0;

  const cond = condicoesDaAmostra({ ...params, familia: undefined });
  const onde = ['sem_homologacao = 0', ...cond.onde];
  const [[totais]] = await pool.query(
    `SELECT COUNT(*) AS encerradas, MIN(encerrada_em) AS de, MAX(encerrada_em) AS ate FROM historico_precos WHERE ${onde.join(' AND ')}`,
    cond.valores
  );
  const base = regras.baseDaReferencia(ref);
  return {
    grupo: rotulo,
    familia,
    filtrado,
    referencia: ref,
    frase: regras.fraseDaReferencia({ referencia: ref, segmento: rotulo, familia }),
    base,
    base_rotulo: ref ? ref.base : null,
    // Só os grupos de palavras-chave (as linhas do estudo): segmentos e áreas têm seus próprios seletores.
    grupos: grupos.map((g) => g.grupo).filter((g) => !g.startsWith(PREFIXO_AREA) && !segmentos.areaDoSegmento(g)),
    familias: familias.map((f) => f.familia),
    catalogo,
    sem_classificacao: semClassificacao,
    ufs: ufs.map((u) => u.uf),
    esferas: esferas.map((e) => e.esfera),
    amostra: { encerradas: Number(totais.encerradas || 0), de: totais.de, ate: totais.ate },
    contexto: regras.CONTEXTO_DO_ESTUDO,
  };
}

/** Contratações reais encerradas parecidas: o que dá substância ao número da frase. */
async function contratacoesParecidas({ q, pagina = 1, porPagina = 15, ...filtros } = {}) {
  const cond = condicoesDaAmostra(filtros);
  const onde = ['sem_homologacao = 0', 'desconto IS NOT NULL', ...cond.onde];
  const valores = [...cond.valores];
  const busca = String(q || '').trim();
  if (busca) {
    onde.push('objeto LIKE ?');
    valores.push(`%${busca.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  }
  const limite = Math.min(Math.max(Number(porPagina) || 15, 1), 50);
  const deslocamento = (Math.max(Number(pagina) || 1, 1) - 1) * limite;
  const clausula = onde.join(' AND ');

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM historico_precos WHERE ${clausula}`, valores);
  const [linhas] = await pool.query(
    `SELECT id, objeto, orgao_nome, uf, modalidade, valor_estimado, valor_homologado, desconto, encerrada_em, grupo, area, segmento
       FROM historico_precos WHERE ${clausula}
      ORDER BY encerrada_em DESC, id DESC LIMIT ? OFFSET ?`,
    [...valores, limite, deslocamento]
  );
  return {
    total: Number(total),
    pagina: Math.max(Number(pagina) || 1, 1),
    por_pagina: limite,
    dados: linhas.map((l) => ({
      ...l,
      valor_estimado: numero(l.valor_estimado),
      valor_homologado: numero(l.valor_homologado),
      desconto: numero(l.desconto),
    })),
  };
}

module.exports = {
  referenciaPara,
  referenciaDoFiltro,
  condicoesDaAmostra,
  PREFIXO_AREA,
  resumoDaLicitacao,
  recalcular,
  listarReferencias,
  resumoDoSegmento,
  contratacoesParecidas,
  concorrentesDa,
  perfilDoConcorrente,
  listarConcorrentes,
};
