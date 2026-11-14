// Job `varrer_estrategicas` (seção 22.3) — o filão de melhor relação
// esforço/retorno.
//
// Deserta é contratação que o órgão ainda precisa fazer, com concorrência zero
// e pressa: abre caminho para contratação direta pelo art. 75, III da Lei
// 14.133, mantidas as condições do edital. Fracassada é o mesmo tratamento
// legal, com um aviso — houve interessados, e vale ler o que desclassificou as
// propostas antes de montar a sua.
//
// Duas origens alimentam a lista, e é de propósito (ver a divergência
// registrada na migração 011): a deserta que passou pelo radar e a que nunca
// passou. A segunda é a maioria, e costuma ser a melhor: ninguém a viu.
const pool = require('../config/db');
const escopo = require('../servicos/escopo');
const fila = require('../servicos/fila');
const alertas = require('../servicos/alertas');
const servicoMonitor = require('../servicos/monitor');
const similaridade = require('../regras/similaridade');

// A janela da seção 22.3: contratações encerradas nos últimos 180 dias.
const DIAS = 180;

// Quantas assinaturas calcular por rodada, e de quantas em quantas linhas elas
// voltam ao banco. Calcular é barato; escrever uma por `UPDATE` não era —
// 5.200 idas ao banco levavam 77 s, contra menos de 2 s em lotes de 200.
const LOTE_ASSINATURAS = 6000;
const LINHAS_POR_UPDATE = 200;

function recortar(valor, tamanho) {
  if (valor === null || valor === undefined) return null;
  return String(valor).slice(0, tamanho);
}

/**
 * Preenche `assinatura_objeto` onde ainda falta, nas duas tabelas.
 * É o que torna possível reconhecer que o órgão reabriu o mesmo objeto.
 */
async function calcularAssinaturas({ lote = LOTE_ASSINATURAS } = {}) {
  let feitas = 0;

  for (const tabela of ['licitacoes', 'historico_precos']) {
    const [linhas] = await pool.query(
      `SELECT id, objeto, orgao_nome FROM ${tabela}
        WHERE assinatura_objeto IS NULL AND objeto IS NOT NULL LIMIT ?`,
      [lote]
    );
    const calculadas = linhas.map((linha) => ({
      id: linha.id,
      assinatura: recortar(similaridade.assinaturaObjeto(linha.objeto, { orgaoNome: linha.orgao_nome }), 255),
    }));

    // Um `UPDATE ... CASE id` por lote. Volta o mesmo resultado que a linha a
    // linha, numa ida ao banco em vez de duzentas.
    for (let i = 0; i < calculadas.length; i += LINHAS_POR_UPDATE) {
      const lote = calculadas.slice(i, i + LINHAS_POR_UPDATE);
      const casos = lote.map(() => 'WHEN ? THEN ?').join(' ');
      const valores = lote.flatMap((c) => [c.id, c.assinatura]);
      await pool.query(
        `UPDATE ${tabela} SET assinatura_objeto = CASE id ${casos} END WHERE id IN (?)`,
        [...valores, lote.map((c) => c.id)]
      );
      feitas += lote.length;
    }
  }
  return feitas;
}

/**
 * Passo 1 e 2 da seção 22.3, lado do radar: item que ficou sem vencedor numa
 * compra que já foi homologada.
 *
 * `tem_resultado = 0` sozinho não basta — item de compra ainda em andamento
 * também não tem resultado, e não é deserta coisa nenhuma. Por isso a compra
 * precisa estar encerrada.
 */
async function doRadar({ dias = DIAS } = {}) {
  const [itens] = await pool.query(
    `SELECT i.licitacao_id, i.numero_item, i.situacao_item, i.valor_total_estimado,
            l.orgao_cnpj, l.orgao_nome, l.uf, l.objeto, l.assinatura_objeto, l.fim_propostas
       FROM licitacao_itens i
       JOIN licitacoes l ON l.id = i.licitacao_id
      WHERE l.fim_propostas IS NOT NULL
        AND l.fim_propostas < NOW()
        AND l.fim_propostas >= DATE_SUB(NOW(), INTERVAL ? DAY)
        AND (
          i.situacao_item IN ('Deserto', 'Fracassado')
          OR (i.tem_resultado = 0 AND i.cnpj_vencedor IS NULL
              AND l.situacao IN ('Homologada', 'Encerrada', 'Deserta', 'Fracassada'))
        )`,
    [dias]
  );

  let criadas = 0;
  for (const item of itens) {
    const tipo = String(item.situacao_item || '').toLowerCase() === 'fracassado' ? 'fracassada' : 'deserta';
    const [r] = await pool.query(
      `INSERT INTO oportunidades_retomada
         (chave, licitacao_id, item_numero, tipo, orgao_cnpj, orgao_nome, uf, objeto,
          assinatura_objeto, valor_estimado, encerrada_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE tipo = VALUES(tipo), valor_estimado = VALUES(valor_estimado)`,
      [
        `lic:${item.licitacao_id}:${item.numero_item}`,
        item.licitacao_id,
        item.numero_item,
        tipo,
        item.orgao_cnpj,
        recortar(item.orgao_nome, 255),
        item.uf,
        item.objeto,
        recortar(item.assinatura_objeto, 255),
        item.valor_total_estimado,
        item.fim_propostas,
      ]
    );
    if (r.insertId) criadas += 1;
  }

  // A licitação inteira sem vencedor nenhum entra na fila da seção 22.2.
  await pool.query(
    `UPDATE licitacoes l
        SET l.estrategica = CASE WHEN l.situacao = 'Fracassada' THEN 'fracassada' ELSE 'deserta' END
      WHERE l.id IN (SELECT DISTINCT licitacao_id FROM oportunidades_retomada WHERE licitacao_id IS NOT NULL)
        AND l.estrategica IS NULL`
  );

  return { itens: itens.length, criadas };
}

/**
 * Passo 1 e 2, lado da amostra de preços: contratação encerrada sem
 * homologação. É a deserta que nunca apareceu no radar — a maioria delas.
 *
 * Aqui não há item: o PNCP publica o encerramento da compra inteira nessa
 * coleta. A oportunidade fica no nível da contratação, com `item_numero` nulo,
 * e a tela diz isso.
 */
async function daAmostra({ dias = DIAS } = {}) {
  // COALESCE com a publicação pelo mesmo motivo da Fase 11: sem ela, mais da
  // metade da amostra ficava invisível aqui, e deserta que ninguém vê é
  // exatamente o que esta tela existe para achar.
  const [linhas] = await pool.query(
    `SELECT id, orgao_cnpj, orgao_nome, uf, objeto, assinatura_objeto, valor_estimado,
            COALESCE(encerrada_em, publicada_em) AS encerrada_em
       FROM historico_precos
      WHERE sem_homologacao = 1
        AND COALESCE(encerrada_em, publicada_em) IS NOT NULL
        AND COALESCE(encerrada_em, publicada_em) >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
    [dias]
  );

  let criadas = 0;
  for (const linha of linhas) {
    const [r] = await pool.query(
      `INSERT INTO oportunidades_retomada
         (chave, historico_id, item_numero, tipo, orgao_cnpj, orgao_nome, uf, objeto,
          assinatura_objeto, valor_estimado, encerrada_em)
       VALUES (?, ?, NULL, 'deserta', ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE valor_estimado = VALUES(valor_estimado)`,
      [
        `hist:${linha.id}`,
        linha.id,
        linha.orgao_cnpj,
        recortar(linha.orgao_nome, 255),
        linha.uf,
        linha.objeto,
        recortar(linha.assinatura_objeto, 255),
        linha.valor_estimado,
        linha.encerrada_em,
      ]
    );
    if (r.insertId) criadas += 1;
  }

  // DIVERGÊNCIA registrada: a amostra diz que a compra encerrou sem
  // homologação, mas não diz se foi por falta de proposta (deserta) ou por
  // desclassificação de todas (fracassada) — o PNCP não publica esse motivo
  // nessa consulta. Entram como 'deserta', que é o caso comum, e a tela avisa
  // que a distinção só sai abrindo o processo no portal.
  return { encerradas: linhas.length, criadas };
}

/**
 * Passo 3 da seção 22.3: procura, no mesmo órgão, licitação posterior com
 * objeto semelhante. Achou, liga as duas e avisa — reabertura é prazo correndo.
 */
async function ligarReaberturas() {
  const [pendentes] = await pool.query(
    `SELECT id, licitacao_id, historico_id, orgao_cnpj, orgao_nome, objeto,
            assinatura_objeto, encerrada_em, valor_estimado
       FROM oportunidades_retomada
      WHERE situacao = 'aguardando' AND orgao_cnpj IS NOT NULL AND assinatura_objeto <> ''`
  );

  let ligadas = 0;
  let avisos = 0;

  for (const oportunidade of pendentes) {
    // Candidatas: o mesmo órgão, depois do encerramento, ainda viva.
    const [candidatas] = await pool.query(
      `SELECT id, objeto, assinatura_objeto, fim_propostas, valor_estimado
         FROM licitacoes
        WHERE orgao_cnpj = ?
          AND assinatura_objeto IS NOT NULL
          AND criado_em > ?
          AND (licitacoes.id <> ? OR ? IS NULL)
        ORDER BY fim_propostas DESC
        LIMIT 200`,
      [
        oportunidade.orgao_cnpj,
        oportunidade.encerrada_em,
        oportunidade.licitacao_id || 0,
        oportunidade.licitacao_id,
      ]
    );
    if (!candidatas.length) continue;

    const melhor = similaridade.melhorCorrespondencia(oportunidade.assinatura_objeto, candidatas);
    if (!melhor) continue;

    await pool.query(
      `UPDATE oportunidades_retomada
          SET situacao = 'reaberta', nova_licitacao_id = ?, observacao = ?
        WHERE id = ?`,
      [
        melhor.candidato.id,
        `Reaberta: objeto ${Math.round(melhor.semelhanca * 100)}% semelhante ao que ficou sem vencedor.`,
        oportunidade.id,
      ]
    );
    if (oportunidade.licitacao_id) {
      await pool.query('UPDATE licitacoes SET reaberta_como = ? WHERE id = ?', [
        melhor.candidato.id,
        oportunidade.licitacao_id,
      ]);
      await servicoMonitor.registrarEvento({
        licitacaoId: oportunidade.licitacao_id,
        tipo: 'reaberta',
        descricao: `O órgão reabriu o mesmo objeto na licitação ${melhor.candidato.id}.`,
        dados: { nova_licitacao_id: melhor.candidato.id, semelhanca: melhor.semelhanca },
        chave: `reaberta:${oportunidade.licitacao_id}:${melhor.candidato.id}`,
      });
    }
    ligadas += 1;

    const prazo = melhor.candidato.fim_propostas
      ? ` — prazo até ${new Date(melhor.candidato.fim_propostas).toLocaleDateString('pt-BR')}`
      : '';
    // Reabertura é fato do catálogo: avisa quem se interessou pela antiga ou
    // pela nova (Seção 1b).
    const interessadas = await escopo.organizacoesInteressadas(pool, [
      oportunidade.licitacao_id,
      melhor.candidato.id,
    ]);
    for (const organizacaoId of interessadas) {
      if (await alertas.criar({
        organizacaoId,
        tipo: 'reabertura',
        nivel: 'atencao',
        chave: `reabertura:${oportunidade.id}:${melhor.candidato.id}`,
        licitacaoId: melhor.candidato.id,
        quando: melhor.candidato.fim_propostas,
        mensagem:
          `${oportunidade.orgao_nome || 'O órgão'} reabriu o objeto que ficou sem vencedor em ` +
          `${new Date(oportunidade.encerrada_em).toLocaleDateString('pt-BR')}${prazo}`,
      })) {
        avisos += 1;
      }
    }
  }

  return { ligadas, avisos };
}

/**
 * Baixa concorrência (seção 22.2).
 *
 * DIVERGÊNCIA DA SPEC, registrada como o CLAUDE.md pede: a seção define baixa
 * concorrência como "o item teve 1 ou 2 propostas", e esse número só existe no
 * Compras.gov.br, que hoje bloqueia (ver adaptadores/comprasgov.js). Inventar
 * uma contagem de propostas seria dado falso.
 *
 * O que o painel tem é o desconto: contratação que fechou praticamente no
 * estimado é a impressão digital de quem não teve com quem disputar. Então a
 * fila existe, medida pelo desconto no 1º quartil do grupo ou abaixo, e a tela
 * diz que é inferência de desconto, não contagem de proposta.
 */
async function baixaConcorrencia({ dias = DIAS } = {}) {
  const [linhas] = await pool.query(
    `SELECT h.id, h.grupo, h.familia, h.desconto, h.orgao_nome, h.uf, h.objeto,
            h.valor_estimado, h.valor_homologado, h.encerrada_em, r.desconto_q1
       FROM historico_precos h
       JOIN precos_referencia r
         ON r.grupo = COALESCE(h.grupo, 'Geral') AND r.familia = h.familia
      WHERE h.sem_homologacao = 0
        AND h.desconto IS NOT NULL
        AND r.desconto_q1 IS NOT NULL
        AND h.desconto <= r.desconto_q1
        AND h.encerrada_em >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      ORDER BY h.valor_estimado DESC
      LIMIT 500`,
    [dias]
  );
  return linhas;
}

// Janela da fila "Iminência" (seção 22.2): prazo acabando em menos disto.
const HORAS_IMINENCIA = 24;

/**
 * Iminência (seção 22.2).
 *
 * DIVERGÊNCIA DA SPEC, registrada como o CLAUDE.md pede: a seção define
 * iminência como licitação aberta, prazo acabando em menos de 24 h, "e
 * nenhuma proposta registrada" — e a própria seção admite que isso só se vê
 * onde a plataforma publica, hoje só no Compras.gov.br, que está atrás de
 * CAPTCHA (seção 5.2, adaptadores/comprasgov.js). O painel não tem contagem de
 * proposta de licitação ainda aberta para a maioria das fontes, e inventar um
 * "zero propostas" seria dado falso — a regra de ouro da seção 1 (lacuna
 * visível, nunca valor inventado).
 *
 * O que dá para fazer sem inventar nada: listar o que é urgente de verdade —
 * aberta, não descartada, prazo dentro de 24 h — e deixar claro na tela que é
 * "está acabando", não "ninguém disputou ainda". Quem quiser saber se há
 * proposta abre o link do portal de disputa (seção 30, item 2) e confere.
 */
async function iminencia({ organizacaoId, horas = HORAS_IMINENCIA } = {}) {
  const [linhas] = await pool.query(
    `SELECT id, numero_controle, objeto, orgao_nome, orgao_cnpj, uf, municipio,
            modalidade, valor_estimado, fim_propostas, pontuacao, link_portal,
            link_disputa
       FROM ${escopo.daOrganizacao(organizacaoId)} l
      WHERE descartada = 0
        AND fim_propostas IS NOT NULL
        AND fim_propostas BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL ? HOUR)
      ORDER BY fim_propostas ASC
      LIMIT 200`,
    [horas]
  );
  return linhas;
}

/** A varredura inteira. Diária, 05h (seção 14). */
async function varrerEstrategicas({ dias = DIAS } = {}) {
  const assinaturas = await calcularAssinaturas({});
  const radar = await doRadar({ dias });
  const amostra = await daAmostra({ dias });
  const reaberturas = await ligarReaberturas();

  const [[contagem]] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(situacao = 'aguardando') AS aguardando,
            SUM(situacao = 'reaberta') AS reabertas,
            ROUND(SUM(CASE WHEN situacao = 'aguardando' THEN valor_estimado ELSE 0 END), 2) AS valor
       FROM oportunidades_retomada`
  );

  return {
    assinaturas,
    radar,
    amostra,
    reaberturas,
    total: Number(contagem.total || 0),
    aguardando: Number(contagem.aguardando || 0),
    reabertas: Number(contagem.reabertas || 0),
    valor: Number(contagem.valor || 0),
  };
}

function registrarNaFila() {
  fila.registrar('varrer_estrategicas', (payload) => varrerEstrategicas(payload || {}));
}

module.exports = {
  varrerEstrategicas,
  calcularAssinaturas,
  doRadar,
  daAmostra,
  ligarReaberturas,
  baixaConcorrencia,
  iminencia,
  registrarNaFila,
  DIAS,
};
