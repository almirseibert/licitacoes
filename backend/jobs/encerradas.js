// Job `coletar_encerradas` (seção 14) — alimenta o preço de referência.
//
// Duas coisas diferentes, que convém não confundir:
//
//   coletarEncerradas()  varre o PNCP por contratações JÁ ENCERRADAS, grava
//                        estimado × homologado em `historico_precos` e não
//                        toca em `licitacoes`. É amostra estatística, não
//                        oportunidade: encerrada não serve para disputar.
//
//   registrarResultados() para UMA licitação do radar, busca o vencedor de
//                        cada item no PNCP e grava em `licitacao_itens` e
//                        `propostas_concorrentes`. É o "quem levou, por quanto".
const pool = require('../config/db');
const fila = require('../servicos/fila');
const adaptadores = require('../adaptadores');
const regras = require('../regras/preco');
const servico = require('../servicos/preco');

// Teto por execução: a conduta da seção 5.4 pede ritmo baixo, e uma varredura
// que nunca termina é pior do que uma que termina menor.
const PAGINAS_POR_TERMO = 2;
const POR_PAGINA = 100;

function paraData(valor) {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function recortar(valor, tamanho) {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  return texto ? texto.slice(0, tamanho) : null;
}

/**
 * Grava uma contratação encerrada na amostra. Idempotente pela chave externa:
 * rodar o job duas vezes no mesmo dia não duplica nem infla a mediana.
 */
async function guardarEncerrada(licitacao, { adaptador = 'pncp', grupo } = {}) {
  const estimado = Number(licitacao.valor_estimado) || null;
  const homologado = Number(licitacao.valor_homologado) || null;
  const desconto = regras.descontoDe({
    valor_estimado: estimado,
    valor_homologado: homologado,
  });

  const [r] = await pool.query(
    `INSERT INTO historico_precos
       (adaptador, chave_externa, grupo, modalidade, familia, uf, esfera,
        orgao_cnpj, orgao_nome, objeto, valor_estimado, valor_homologado,
        desconto, sem_homologacao, encerrada_em, publicada_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       valor_homologado = VALUES(valor_homologado),
       desconto = VALUES(desconto),
       sem_homologacao = VALUES(sem_homologacao),
       encerrada_em = COALESCE(VALUES(encerrada_em), encerrada_em),
       publicada_em = COALESCE(VALUES(publicada_em), publicada_em)`,
    [
      adaptador,
      licitacao.chave_externa,
      recortar(grupo, 60),
      recortar(licitacao.modalidade, 60),
      regras.familiaModalidade(licitacao.modalidade),
      recortar(licitacao.uf, 2),
      recortar(licitacao.esfera, 20),
      recortar(licitacao.orgao_cnpj, 14),
      recortar(licitacao.orgao_nome, 255),
      licitacao.objeto || null,
      estimado,
      homologado,
      desconto,
      // Encerrada sem homologação é deserta ou fracassada: entra na amostra
      // como fato, mas fora da mediana de desconto.
      desconto === null ? 1 : 0,
      paraData(licitacao.fim_propostas),
      paraData(licitacao.publicada_em),
    ]
  );

  // Em ON DUPLICATE KEY UPDATE o insertId só é diferente de zero no insert.
  return { nova: Boolean(r.insertId) };
}

/**
 * Varre as fontes com adaptador capaz de buscar encerradas, usando as palavras
 * ativas. O grupo da palavra é o grupo da amostra — é o que liga o número ao
 * que a empresa realmente disputa.
 */
async function coletarEncerradas({ fonteId, termo, paginas = PAGINAS_POR_TERMO } = {}) {
  const inicio = Date.now();

  const [fontes] = await pool.query(
    fonteId
      ? 'SELECT id, nome, adaptador, config FROM fontes WHERE id = ?'
      : "SELECT id, nome, adaptador, config FROM fontes WHERE ativa = 1 AND adaptador = 'pncp' ORDER BY prioridade",
    fonteId ? [Number(fonteId)] : []
  );

  const [palavras] = await pool.query(
    termo
      ? 'SELECT ? AS termo, NULL AS grupo, 1 AS usar_aspas'
      : // Seção 1b: a amostra de preço é do catálogo — usa a união das palavras
        // das organizações ativas, cada termo uma vez.
        `SELECT p.termo, MAX(p.grupo) AS grupo, MAX(p.usar_aspas) AS usar_aspas
           FROM palavras_chave p
           JOIN organizacoes g ON g.id = p.organizacao_id AND g.status <> 'suspensa'
          WHERE p.ativa = 1
          GROUP BY p.termo
          ORDER BY MAX(p.peso) DESC`,
    termo ? [termo] : []
  );

  let encontradas = 0;
  let novas = 0;
  const erros = [];

  for (const fonte of fontes) {
    const adaptador = adaptadores.obter(fonte.adaptador);
    if (adaptador.somenteEnriquecimento || typeof adaptador.buscar !== 'function') continue;

    for (const palavra of palavras) {
      for (let pagina = 1; pagina <= paginas; pagina += 1) {
        try {
          const resposta = await adaptador.buscar({
            config: { ...(fonte.config || {}), status: 'encerradas', tam_pagina: POR_PAGINA },
            fonteId: fonte.id,
            termo: palavra.termo,
            usarAspas: Boolean(palavra.usar_aspas),
            pagina,
          });

          const lista = resposta.licitacoes || [];
          if (!lista.length) break;

          for (const licitacao of lista) {
            encontradas += 1;
            const r = await guardarEncerrada(licitacao, {
              adaptador: fonte.adaptador,
              grupo: palavra.grupo,
            });
            if (r.nova) novas += 1;
          }

          if (lista.length < POR_PAGINA) break;
        } catch (erro) {
          erros.push(`${palavra.termo} (p.${pagina}): ${erro.message}`);
          break;
        }
      }
    }

    await pool.query(
      'UPDATE fontes SET ultimo_status = ? WHERE id = ?',
      [`Encerradas: ${encontradas} lidas, ${novas} novas na amostra de preço.`, fonte.id]
    );
  }

  const recalculo = await servico.recalcular();

  return {
    encontradas,
    novas,
    referencias_gravadas: recalculo.gravadas,
    erros,
    duracao_ms: Date.now() - inicio,
  };
}

/**
 * Vencedor de cada item de uma licitação do radar, pelo PNCP.
 *
 * O PNCP publica o resultado homologado — um vencedor por item, com CNPJ,
 * porte e valor unitário. A lista completa de propostas é do Compras.gov.br e
 * hoje está atrás de CAPTCHA (ver adaptadores/comprasgov.js): quando a fonte
 * for essa, a função devolve `bloqueado` com o link, e não inventa linha.
 */
async function registrarResultados({ licitacaoId }) {
  const [[licitacao]] = await pool.query(
    `SELECT l.id, l.chave_externa, l.fonte_id, l.link_disputa, l.plataforma_disputa,
            l.valor_estimado, f.adaptador
       FROM licitacoes l JOIN fontes f ON f.id = l.fonte_id
      WHERE l.id = ?`,
    [licitacaoId]
  );
  if (!licitacao) throw new Error('Licitação não encontrada.');

  const adaptador = adaptadores.obter(licitacao.adaptador);
  if (typeof adaptador.resultadoDoItem !== 'function') {
    return { gravados: 0, aviso: `A fonte "${licitacao.adaptador}" não publica resultado por item.` };
  }

  const [itens] = await pool.query(
    'SELECT numero_item, valor_unit_estimado FROM licitacao_itens WHERE licitacao_id = ? ORDER BY numero_item',
    [licitacaoId]
  );
  if (!itens.length) {
    return { gravados: 0, aviso: 'Sem itens gravados ainda: detalhe a licitação primeiro.' };
  }

  let gravados = 0;
  let semResultado = 0;
  const erros = [];

  for (const item of itens) {
    let resultados;
    try {
      resultados = await adaptador.resultadoDoItem({
        chaveExterna: licitacao.chave_externa,
        numeroItem: item.numero_item,
      });
    } catch (erro) {
      erros.push(`item ${item.numero_item}: ${erro.message}`);
      continue;
    }

    const lista = Array.isArray(resultados) ? resultados : (resultados && resultados.data) || [];
    if (!lista.length) {
      semResultado += 1;
      continue;
    }

    for (const r of lista) {
      const cnpj = String(r.niFornecedor || '').replace(/\D/g, '') || null;
      const porte = String(r.porteFornecedorNome || '').toLowerCase();
      const unitario = Number(r.valorUnitarioHomologado) || null;

      await pool.query(
        `INSERT INTO propostas_concorrentes
           (licitacao_id, item_numero, posicao, cnpj, empresa, uf, me_epp, mei,
            situacao, valor_ofertado, valor_negociado, origem)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pncp')
         ON DUPLICATE KEY UPDATE
           posicao = VALUES(posicao),
           empresa = VALUES(empresa),
           me_epp = VALUES(me_epp),
           mei = VALUES(mei),
           situacao = VALUES(situacao),
           valor_negociado = VALUES(valor_negociado)`,
        [
          licitacaoId,
          item.numero_item,
          Number(r.ordemClassificacaoSrp) || 1,
          cnpj,
          recortar(r.nomeRazaoSocialFornecedor, 255),
          // O resultado do PNCP não traz UF do fornecedor; deixar em branco é
          // melhor do que repetir a UF do órgão como se fosse a dele.
          null,
          /micro|pequen|epp|me\b/.test(porte) ? 1 : 0,
          porte.includes('microempreendedor') ? 1 : 0,
          recortar(r.situacaoCompraItemResultadoNome, 60),
          // O PNCP publica o homologado, não o ofertado na abertura: os dois
          // campos recebem o mesmo número, e a origem diz o que ele é.
          unitario,
          unitario,
        ]
      );

      gravados += 1;
    }

    // Em registro de preços o PNCP devolve vários fornecedores para o mesmo
    // item, todos com `ordemClassificacaoSrp = 1` — foi o que apareceu na
    // licitação 677 (TIM, Telefônica, Claro e IVM no item 1). Gravar "o de
    // ordem 1" deixaria no item o último que a API listou, que é sorteio.
    // O item guarda o de menor preço, que é o que interessa para comparar.
    const melhor = lista
      .filter((x) => Number.isFinite(Number(x.valorUnitarioHomologado)))
      .sort((a, b) => Number(a.valorUnitarioHomologado) - Number(b.valorUnitarioHomologado))[0];

    if (melhor) {
      await pool.query(
        `UPDATE licitacao_itens
            SET valor_homologado = ?, fornecedor_vencedor = ?, cnpj_vencedor = ?
          WHERE licitacao_id = ? AND numero_item = ?`,
        [
          Number(melhor.valorTotalHomologado) || null,
          recortar(melhor.nomeRazaoSocialFornecedor, 255),
          String(melhor.niFornecedor || '').replace(/\D/g, '') || null,
          licitacaoId,
          item.numero_item,
        ]
      );
    }
  }

  return {
    gravados,
    itens: itens.length,
    sem_resultado: semResultado,
    erros,
    aviso:
      gravados === 0
        ? 'O portal ainda não publicou resultado para nenhum item desta licitação.'
        : null,
  };
}

/**
 * Semeia `precos_referencia` com o levantamento da seção 12. Roda no `semear`
 * e é idempotente: não mexe nas linhas calculadas.
 */
async function semearEstudo() {
  let gravadas = 0;
  for (const linha of regras.ESTUDO) {
    const [r] = await pool.query(
      `INSERT INTO precos_referencia
         (grupo, familia, desconto_mediano, desconto_q1, desconto_q3,
          pct_acima_estimado, pct_sem_homologacao, mediana_propostas, amostra,
          origem, apurado_em)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 0, 'estudo', ?)
       ON DUPLICATE KEY UPDATE id = id`,
      [
        linha.grupo,
        linha.familia,
        linha.desconto_mediano,
        linha.desconto_q1,
        linha.desconto_q3,
        linha.pct_acima_estimado,
        linha.mediana_propostas,
        linha.apurado_em,
      ]
    );
    if (r.insertId) gravadas += 1;
  }
  return gravadas;
}

function registrarNaFila() {
  fila.registrar('coletar_encerradas', (payload) => coletarEncerradas(payload || {}));
  fila.registrar('registrar_resultados', (payload) => registrarResultados(payload));
  fila.registrar('recalcular_precos', () => servico.recalcular());
}

module.exports = {
  coletarEncerradas,
  registrarResultados,
  guardarEncerrada,
  semearEstudo,
  registrarNaFila,
};
