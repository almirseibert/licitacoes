// Gerador de proposta (seção 19) — a parte que fala com o banco.
// A matemática fica em regras/proposta.js e a saída em servicos/proposta-saida.js.
//
// A proposta nasce dos itens do edital já cadastrados: redigitar 62 descrições
// é como se perde uma disputa antes de começar. O que você informa é custo e
// margem; o preço, o semáforo e o total o painel calcula.
const pool = require('../config/db');
const regras = require('../regras/proposta');
const precos = require('./preco');
const perfis = require('./perfil');
const saida = require('./proposta-saida');

/** Campos do cabeçalho que a tela edita (seção 19.1). */
const CAMPOS_CABECALHO = [
  'validade_dias',
  'prazo_entrega',
  'prazo_execucao',
  'garantia',
  'condicao_pagamento',
  'dados_bancarios',
  'observacoes',
  'status',
];

const CAMPOS_ITEM = ['descricao', 'marca_modelo', 'unidade', 'quantidade', 'custo_unitario', 'margem_pct', 'valor_unitario', 'disputar'];

const STATUS = new Set(['rascunho', 'final', 'enviada']);

function numero(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

async function licitacaoDe(licitacaoId) {
  const [[licitacao]] = await pool.query('SELECT * FROM licitacoes WHERE id = ?', [licitacaoId]);
  if (!licitacao) throw new Error('Licitação não encontrada.');
  return licitacao;
}

/**
 * Cria a proposta e copia os itens do edital.
 *
 * Copia, não referencia: o edital pode ser retificado depois e a proposta que
 * você assinou tem de continuar dizendo o que você assinou.
 */
async function criar({ licitacaoId, perfilId = null }) {
  const licitacao = await licitacaoDe(licitacaoId);
  const perfil = await perfis.padrao(perfilId);

  const [resultado] = await pool.query(
    'INSERT INTO propostas (licitacao_id, perfil_id) VALUES (?, ?)',
    [licitacao.id, perfil.id]
  );

  const copiados = await puxarItens(resultado.insertId);
  return { id: resultado.insertId, itens: copiados.copiados };
}

/**
 * Traz para a proposta os itens do edital que ainda não estão nela. Serve na
 * criação e depois: item costuma chegar num segundo `detalhar`, e sem isto a
 * proposta ficaria presa ao que havia no dia em que nasceu.
 */
async function puxarItens(propostaId) {
  const [[proposta]] = await pool.query('SELECT * FROM propostas WHERE id = ?', [propostaId]);
  if (!proposta) throw new Error('Proposta não encontrada.');

  const [doEdital] = await pool.query(
    'SELECT numero_item, descricao, quantidade, unidade FROM licitacao_itens WHERE licitacao_id = ? ORDER BY numero_item',
    [proposta.licitacao_id]
  );
  if (!doEdital.length) {
    return {
      copiados: 0,
      aviso:
        'Esta licitação ainda não tem itens cadastrados. Use "rebuscar no portal" na licitação e tente de novo.',
    };
  }

  const [existentes] = await pool.query('SELECT item_numero FROM proposta_itens WHERE proposta_id = ?', [propostaId]);
  const jaTem = new Set(existentes.map((e) => e.item_numero));
  const novos = doEdital.filter((i) => !jaTem.has(i.numero_item));
  if (!novos.length) return { copiados: 0, aviso: null };

  for (const item of novos) {
    await pool.query(
      'INSERT INTO proposta_itens (proposta_id, item_numero, descricao, quantidade, unidade) VALUES (?, ?, ?, ?, ?)',
      [propostaId, item.numero_item, item.descricao, item.quantidade, item.unidade]
    );
  }

  await recalcular(propostaId);
  return { copiados: novos.length, aviso: null };
}

/** As propostas de uma licitação, para a aba e para o bloco 3 do envio. */
async function listar(licitacaoId) {
  const [linhas] = await pool.query(
    `SELECT p.id, p.status, p.valor_total, p.custo_total, p.margem_media, p.arquivo_pdf, p.arquivo_xlsx,
            p.criado_em, p.atualizado_em,
            (SELECT COUNT(*) FROM proposta_itens i WHERE i.proposta_id = p.id AND i.disputar = 1) AS itens
       FROM propostas p
      WHERE p.licitacao_id = ?
      ORDER BY p.id DESC`,
    [licitacaoId]
  );
  return linhas;
}

/**
 * A proposta inteira, pronta para a tela: itens com as três referências da
 * seção 19.2, semáforo, alerta de inexequibilidade e o rodapé.
 */
async function obter(propostaId) {
  const [[proposta]] = await pool.query('SELECT * FROM propostas WHERE id = ?', [propostaId]);
  if (!proposta) return null;

  const licitacao = await licitacaoDe(proposta.licitacao_id);
  const [[perfil]] = await pool.query('SELECT * FROM empresa_perfis WHERE id = ?', [proposta.perfil_id]);

  // O estimado unitário fica no edital, não na proposta: a proposta guarda o
  // que é seu (custo, margem, preço), e a referência do órgão é lida na hora.
  const [itens] = await pool.query(
    `SELECT i.*, e.valor_unit_estimado, e.beneficio, e.valor_total_estimado
       FROM proposta_itens i
       LEFT JOIN licitacao_itens e
              ON e.licitacao_id = ? AND e.numero_item = i.item_numero
      WHERE i.proposta_id = ?
      ORDER BY i.item_numero`,
    [proposta.licitacao_id, propostaId]
  );

  const referencia = await precos.referenciaPara(licitacao);
  const descontoMediano = referencia ? numero(referencia.desconto_mediano) : null;
  const avaliados = itens.map((item) => regras.avaliarItem(item, { descontoMediano }));
  const totais = regras.totais(avaliados);
  const exigeMarca = regras.exigeMarca(licitacao);

  const avisos = [];
  if (exigeMarca) {
    const semMarca = avaliados.filter((i) => i.disputar && !i.marca_modelo);
    if (semMarca.length) {
      avisos.push(
        `${semMarca.length} item(ns) sem marca/modelo. Em compra de material isso costuma desclassificar a proposta.`
      );
    }
  }
  if (totais.itens_sem_preco) {
    avisos.push(`${totais.itens_sem_preco} item(ns) sem preço: informe o custo e a margem, ou tire da disputa.`);
  }
  if (totais.inexequiveis) {
    avisos.push(
      `${totais.inexequiveis} item(ns) com preço inexequível. Perder a disputa por inexequibilidade é pior do que não disputar.`
    );
  }
  if (!referencia) {
    avisos.push('Sem mediana de fechamento para este grupo: o semáforo fica cinza e só o estimado serve de teto.');
  }

  return {
    proposta: {
      ...proposta,
      valor_total: numero(proposta.valor_total),
      custo_total: numero(proposta.custo_total),
      margem_media: numero(proposta.margem_media),
    },
    licitacao: {
      id: licitacao.id,
      objeto: licitacao.objeto,
      orgao_nome: licitacao.orgao_nome,
      unidade: licitacao.unidade,
      modalidade: licitacao.modalidade,
      numero_compra: licitacao.numero_compra,
      processo: licitacao.processo,
      municipio: licitacao.municipio,
      uf: licitacao.uf,
      grupo: licitacao.grupo,
      valor_estimado: numero(licitacao.valor_estimado),
      fim_propostas: licitacao.fim_propostas,
    },
    perfil: perfil || null,
    referencia: referencia && {
      base: referencia.base,
      origem: referencia.origem,
      amostra: referencia.amostra,
      apurado_em: referencia.apurado_em,
      desconto_mediano: descontoMediano,
    },
    itens: avaliados,
    totais,
    exige_marca: exigeMarca,
    avisos,
  };
}

/** Grava o cabeçalho (validade, prazos, garantia, pagamento, banco, status). */
async function atualizar(propostaId, campos) {
  const pedacos = [];
  const valores = [];

  for (const campo of CAMPOS_CABECALHO) {
    if (!(campo in campos)) continue;
    let valor = campos[campo];

    if (campo === 'status') {
      if (!STATUS.has(valor)) throw new Error('Status inválido. Use rascunho, final ou enviada.');
    } else if (campo === 'validade_dias') {
      valor = numero(valor);
      if (valor !== null && (valor < 1 || valor > 365)) {
        throw new Error('A validade da proposta precisa ficar entre 1 e 365 dias.');
      }
    } else if (valor === '') {
      valor = null;
    }

    pedacos.push(`${campo} = ?`);
    valores.push(valor);
  }

  if (!pedacos.length) throw new Error('Nada para salvar.');

  const [r] = await pool.query(`UPDATE propostas SET ${pedacos.join(', ')} WHERE id = ?`, [...valores, propostaId]);
  if (!r.affectedRows) throw new Error('Proposta não encontrada.');
  await recalcular(propostaId);
  return obter(propostaId);
}

/**
 * Grava um item e recalcula o preço.
 *
 * Preço digitado à mão manda: quando `valor_unitario` vem no corpo, ele é o que
 * vale e a margem passa a ser consequência dele. É o caso do lance acertado na
 * sessão, que não nasce de conta de margem nenhuma.
 */
async function atualizarItem(propostaId, itemId, campos) {
  const [[item]] = await pool.query('SELECT * FROM proposta_itens WHERE id = ? AND proposta_id = ?', [
    itemId,
    propostaId,
  ]);
  if (!item) throw new Error('Item não encontrado nesta proposta.');

  const atual = { ...item };
  for (const campo of CAMPOS_ITEM) {
    if (!(campo in campos)) continue;
    if (campo === 'disputar') {
      atual.disputar = Number(campos.disputar) ? 1 : 0;
    } else if (['quantidade', 'custo_unitario', 'margem_pct', 'valor_unitario'].includes(campo)) {
      const valor = numero(campos[campo]);
      if (valor !== null && valor < 0) throw new Error('Quantidade, custo, margem e preço não podem ser negativos.');
      atual[campo] = valor;
    } else {
      atual[campo] = campos[campo] === '' ? null : campos[campo];
    }
  }

  const precoNaMao = 'valor_unitario' in campos && numero(campos.valor_unitario) !== null;
  if (precoNaMao) {
    atual.margem_pct = regras.margemDoPreco({ custo: atual.custo_unitario, preco: atual.valor_unitario });
  } else {
    atual.valor_unitario = regras.precoUnitario(atual);
  }
  atual.valor_total = regras.totalDaLinha(atual);

  await pool.query(
    `UPDATE proposta_itens
        SET descricao = ?, marca_modelo = ?, unidade = ?, quantidade = ?,
            custo_unitario = ?, margem_pct = ?, valor_unitario = ?, valor_total = ?, disputar = ?
      WHERE id = ? AND proposta_id = ?`,
    [
      atual.descricao,
      atual.marca_modelo,
      atual.unidade,
      atual.quantidade,
      atual.custo_unitario,
      atual.margem_pct,
      atual.valor_unitario,
      atual.valor_total,
      atual.disputar,
      itemId,
      propostaId,
    ]
  );

  await recalcular(propostaId);
  return obter(propostaId);
}

/**
 * Aplica a mesma margem a todos os itens com custo informado. É o atalho que
 * torna 62 itens viável: você acerta a margem geral e corrige só as exceções.
 */
async function margemEmLote(propostaId, margem) {
  const m = numero(margem);
  if (m === null || m < -0.9 || m > 10) throw new Error('Informe a margem como fração entre -0,9 e 10.');

  await pool.query(
    `UPDATE proposta_itens
        SET margem_pct = ?,
            valor_unitario = ROUND(custo_unitario * (1 + ?), 4),
            valor_total = ROUND(quantidade * ROUND(custo_unitario * (1 + ?), 4), 2)
      WHERE proposta_id = ? AND custo_unitario IS NOT NULL`,
    [m, m, m, propostaId]
  );

  await recalcular(propostaId);
  return obter(propostaId);
}

/** Recalcula o rodapé gravado no cabeçalho (total, custo e margem média). */
async function recalcular(propostaId) {
  const [itens] = await pool.query('SELECT * FROM proposta_itens WHERE proposta_id = ?', [propostaId]);
  const totais = regras.totais(itens.map((i) => regras.avaliarItem(i)));

  await pool.query('UPDATE propostas SET valor_total = ?, custo_total = ?, margem_media = ? WHERE id = ?', [
    totais.valor_total,
    totais.custo_total,
    totais.margem_media,
    propostaId,
  ]);
  return totais;
}

/**
 * Gera o PDF e o XLSX (seção 19.3) e grava os caminhos.
 *
 * Nenhuma coluna de custo entra nos dois arquivos: a fronteira é garantida em
 * servicos/proposta-saida.js, que lê os itens por uma única função. Aqui só
 * cuidamos de não gerar papel inútil — proposta sem item com preço não sai.
 */
async function gerarSaida(propostaId) {
  const completa = await obter(propostaId);
  if (!completa) throw new Error('Proposta não encontrada.');

  const comPreco = completa.itens.filter((i) => i.disputar && i.valor_unitario !== null);
  if (!comPreco.length) {
    throw new Error('Nenhum item com preço. Informe o custo e a margem de ao menos um item que você vai disputar.');
  }

  const gravado = await saida.gravar({
    proposta: completa.proposta,
    licitacao: completa.licitacao,
    perfil: completa.perfil,
    itens: completa.itens,
    exigeMarca: completa.exige_marca,
  });

  await pool.query('UPDATE propostas SET arquivo_pdf = ?, arquivo_xlsx = ? WHERE id = ?', [
    gravado.pdf.caminho,
    gravado.xlsx.caminho,
    propostaId,
  ]);

  const semPreco = completa.totais.itens_sem_preco;
  return {
    pdf: { nome: gravado.pdf.nome, tamanho: gravado.pdf.tamanho },
    xlsx: { nome: gravado.xlsx.nome, tamanho: gravado.xlsx.tamanho },
    itens: comPreco.length,
    valor_total: completa.totais.valor_total,
    // O que a tela precisa repetir: custo e margem não estão nos arquivos.
    mensagem:
      `Proposta gerada com ${comPreco.length} item(ns), total de R$ ${(completa.totais.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. ` +
      'Custo e margem não aparecem no PDF nem no XLSX.' +
      (semPreco ? ` ${semPreco} item(ns) sem preço ficaram de fora.` : ''),
    avisos: completa.avisos,
  };
}

async function remover(propostaId) {
  const [r] = await pool.query('DELETE FROM propostas WHERE id = ?', [propostaId]);
  if (!r.affectedRows) throw new Error('Proposta não encontrada.');
  return { ok: true };
}

/**
 * As propostas desta licitação que já têm arquivo gerado — é o que o bloco 3
 * da tela "Montar envio" oferece (seção 17.4).
 */
async function arquivosParaEnvio(licitacaoId) {
  const [linhas] = await pool.query(
    `SELECT id, status, valor_total, arquivo_pdf, arquivo_xlsx, atualizado_em
       FROM propostas
      WHERE licitacao_id = ? AND (arquivo_pdf IS NOT NULL OR arquivo_xlsx IS NOT NULL)
      ORDER BY FIELD(status, 'final', 'enviada', 'rascunho'), id DESC`,
    [licitacaoId]
  );

  // A proposta do topo da ordem (final antes de rascunho, mais nova antes da
  // mais velha) entra marcada; as outras ficam visíveis e desmarcadas, como o
  // resto da tela "Montar envio" faz.
  const primeira = linhas.length ? linhas[0].id : null;

  const pecas = [];
  for (const proposta of linhas) {
    if (proposta.arquivo_pdf) {
      pecas.push({
        chave: `proposta-${proposta.id}-pdf`,
        proposta_id: proposta.id,
        formato: 'pdf',
        titulo: 'Proposta comercial.pdf',
        caminho: proposta.arquivo_pdf,
        status: proposta.status,
        valor_total: numero(proposta.valor_total),
        gerado_em: proposta.atualizado_em,
        marcado: proposta.id === primeira,
      });
    }
    if (proposta.arquivo_xlsx) {
      pecas.push({
        chave: `proposta-${proposta.id}-xlsx`,
        proposta_id: proposta.id,
        formato: 'xlsx',
        titulo: 'Planilha de precos.xlsx',
        caminho: proposta.arquivo_xlsx,
        status: proposta.status,
        valor_total: numero(proposta.valor_total),
        gerado_em: proposta.atualizado_em,
        marcado: proposta.id === primeira,
      });
    }
  }
  return pecas;
}

module.exports = {
  criar,
  puxarItens,
  listar,
  obter,
  atualizar,
  atualizarItem,
  margemEmLote,
  recalcular,
  gerarSaida,
  remover,
  arquivosParaEnvio,
  CAMPOS_CABECALHO,
  CAMPOS_ITEM,
};
