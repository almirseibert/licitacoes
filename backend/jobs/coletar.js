// Job `coletar_fontes` (seção 14) — varre as fontes ativas com as palavras ativas.
//
// Fluxo:
//   coletar_fontes            -> enfileira um coletar_fonte por fonte que já venceu o intervalo
//   coletar_fonte  {fonteId}  -> busca cada palavra no adaptador, pontua e grava
//   detalhar_licitacao {id}   -> busca detalhe + itens no portal e repontua
//
// Nunca apaga nada: licitação já existente é atualizada, preservando o que é do
// usuário (etapa do funil, favorito, descarte, anotações).
const pool = require('../config/db');
const fila = require('../servicos/fila');
const adaptadores = require('../adaptadores');
const { pontuar } = require('../regras/aderencia');
const { normalizar } = require('../regras/texto');
const pesosDoBanco = require('../regras/pesos');
const objetoSocial = require('../regras/objeto-social');

const PONTUACAO_PARA_DETALHAR = 30;

// ---------------------------------------------------------------- utilidades
function paraMysql(data) {
  if (!data) return null;
  const d = data instanceof Date ? data : new Date(data);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function recortar(valor, tamanho) {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  if (!texto) return null;
  return texto.slice(0, tamanho);
}

async function carregarContexto() {
  const [palavras] = await pool.query(
    'SELECT id, termo, grupo, peso, usar_aspas, fontes_ids FROM palavras_chave WHERE ativa = 1 ORDER BY peso DESC, termo ASC'
  );
  const [excluidas] = await pool.query('SELECT termo FROM palavras_excluidas WHERE ativa = 1');
  const [perfis] = await pool.query(
    'SELECT cnaes FROM empresa_perfis ORDER BY padrao DESC, id ASC LIMIT 1'
  );
  const cnaes = perfis.length
    ? (typeof perfis[0].cnaes === 'string' ? JSON.parse(perfis[0].cnaes || '[]') : perfis[0].cnaes) || []
    : [];

  return {
    palavras: palavras.map((p) => ({
      ...p,
      fontes_ids: typeof p.fontes_ids === 'string' ? JSON.parse(p.fontes_ids) : p.fontes_ids,
    })),
    palavrasExcluidas: excluidas.map((e) => e.termo),
    pesos: await pesosDoBanco.carregar(),
    cnaes,
  };
}

/**
 * Checa o objeto social (seção 6.2) e só então pontua — `pontuar()` lê
 * `licitacao.objeto_social` para aplicar a penalidade.
 */
function avaliar(licitacao, contexto) {
  const social = objetoSocial.avaliar(licitacao.objeto, contexto.cnaes);
  const participacao = objetoSocial.podeParticipar(social);
  const avaliacao = pontuar({ ...licitacao, objeto_social: social.estado }, contexto);
  return { ...avaliacao, social, participacao };
}

function palavraAtendeFonte(palavra, fonteId) {
  if (!palavra.fontes_ids) return true;
  const lista = Array.isArray(palavra.fontes_ids) ? palavra.fontes_ids : [];
  return lista.length === 0 || lista.includes(fonteId);
}

// ------------------------------------------------------------------- gravação
/**
 * Insere ou atualiza uma licitação. Devolve { id, novo }.
 * A chave única é (fonte_id, chave_externa) — é o que impede duplicata.
 */
async function salvarLicitacao(licitacao, avaliacao) {
  const campos = {
    fonte_id: licitacao.fonte_id,
    chave_externa: recortar(licitacao.chave_externa, 120),
    numero_controle: recortar(licitacao.numero_controle, 60),
    orgao_cnpj: recortar(licitacao.orgao_cnpj, 14),
    orgao_nome: recortar(licitacao.orgao_nome, 255),
    unidade: recortar(licitacao.unidade, 255),
    esfera: licitacao.esfera || 'Outra',
    uf: recortar(licitacao.uf, 2),
    municipio: recortar(licitacao.municipio, 120),
    modalidade: recortar(licitacao.modalidade, 60),
    modo_disputa: recortar(licitacao.modo_disputa, 60),
    numero_compra: recortar(licitacao.numero_compra, 60),
    processo: recortar(licitacao.processo, 80),
    objeto: licitacao.objeto || null,
    valor_estimado: licitacao.valor_estimado ?? null,
    valor_homologado: licitacao.valor_homologado ?? null,
    orcamento_sigiloso: licitacao.orcamento_sigiloso ? 1 : 0,
    abertura_propostas: paraMysql(licitacao.abertura_propostas),
    fim_propostas: paraMysql(licitacao.fim_propostas),
    situacao: recortar(licitacao.situacao, 60),
    plataforma_disputa: recortar(licitacao.plataforma_disputa, 160),
    link_portal: recortar(licitacao.link_portal, 500),
    link_disputa: recortar(licitacao.link_disputa, 500),
    grupo: recortar(avaliacao.grupo, 60),
    palavra_casada: recortar(avaliacao.palavra, 160),
    pontuacao: avaliacao.pontuacao,
    pontuacao_detalhe: JSON.stringify(avaliacao.detalhe || []),
    beneficio_me: recortar(avaliacao.beneficio_me, 40),
    objeto_social: (avaliacao.social && avaliacao.social.estado) || null,
    objeto_social_motivo: recortar(avaliacao.social && avaliacao.social.motivo, 255),
    pode_participar: (avaliacao.participacao && avaliacao.participacao.pode) || 'Depende',
    motivo_participacao: recortar(avaliacao.participacao && avaliacao.participacao.motivo, 255),
    bruto: JSON.stringify(licitacao.bruto || null),
  };

  const colunas = Object.keys(campos);

  // Procuramos antes de gravar em vez de usar ON DUPLICATE KEY UPDATE: neste
  // servidor `affectedRows` vem 1 tanto na inserção quanto na duplicata sem
  // mudança, e aí o "novas" da coleta mentiria — e licitação nova é o que
  // dispara o detalhamento.
  const [existentes] = await pool.query(
    'SELECT id FROM licitacoes WHERE fonte_id = ? AND chave_externa = ? LIMIT 1',
    [campos.fonte_id, campos.chave_externa]
  );

  if (existentes.length) {
    // Colunas do usuário (etapa, favorito, descartada, motivo_descarte) ficam de fora
    // do UPDATE de propósito: a coleta não desfaz decisão de quem usa o painel.
    const atualizaveis = colunas.filter((c) => c !== 'fonte_id' && c !== 'chave_externa');
    await pool.query(
      `UPDATE licitacoes SET ${atualizaveis.map((c) => `\`${c}\` = ?`).join(', ')} WHERE id = ?`,
      [...atualizaveis.map((c) => campos[c]), existentes[0].id]
    );
    return { id: existentes[0].id, novo: false };
  }

  const [resultado] = await pool.query(
    `INSERT INTO licitacoes (${colunas.map((c) => `\`${c}\``).join(', ')})
     VALUES (${colunas.map(() => '?').join(', ')})`,
    colunas.map((c) => campos[c])
  );
  return { id: resultado.insertId, novo: true };
}

async function salvarItens(licitacaoId, itens) {
  if (!itens || !itens.length) return 0;
  let gravados = 0;
  for (const item of itens) {
    if (item.numero_item === null || item.numero_item === undefined) continue;
    await pool.query(
      `INSERT INTO licitacao_itens
        (licitacao_id, numero_item, descricao, quantidade, unidade, valor_unit_estimado,
         valor_total_estimado, beneficio, situacao_item, tem_resultado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         descricao = VALUES(descricao), quantidade = VALUES(quantidade), unidade = VALUES(unidade),
         valor_unit_estimado = VALUES(valor_unit_estimado), valor_total_estimado = VALUES(valor_total_estimado),
         beneficio = VALUES(beneficio), situacao_item = VALUES(situacao_item), tem_resultado = VALUES(tem_resultado)`,
      [
        licitacaoId,
        item.numero_item,
        item.descricao || null,
        item.quantidade ?? null,
        recortar(item.unidade, 40),
        item.valor_unit_estimado ?? null,
        item.valor_total_estimado ?? null,
        recortar(item.beneficio, 80),
        recortar(item.situacao_item, 60),
        item.tem_resultado ? 1 : 0,
      ]
    );
    gravados += 1;
  }
  return gravados;
}

// -------------------------------------------------------------------- coletas
/**
 * Coleta uma fonte inteira. Com `simular: true` não grava nada — é o
 * "Testar agora" da tela de Fontes (seção 4.1).
 */
async function coletarFonte({
  fonteId,
  termo = null,
  usarAspas = true,
  peso = 10,
  simular = false,
  limitePaginas = null,
}) {
  const inicio = Date.now();
  const [fontes] = await pool.query('SELECT * FROM fontes WHERE id = ?', [fonteId]);
  if (!fontes.length) throw new Error(`Fonte ${fonteId} não encontrada.`);
  const fonte = fontes[0];

  const adaptador = adaptadores.obter(fonte.adaptador);
  const config = typeof fonte.config === 'string' ? JSON.parse(fonte.config || '{}') : fonte.config || {};
  const contexto = await carregarContexto();

  const termos = termo
    ? [{ termo, peso, grupo: null, usar_aspas: usarAspas ? 1 : 0 }]
    : contexto.palavras.filter((p) => palavraAtendeFonte(p, fonte.id));

  // Simulação de um termo ainda não cadastrado: ele entra na pontuação só desta
  // execução, senão a tela mostraria notas menores do que as reais depois de ativar.
  if (termo && !contexto.palavras.some((p) => normalizar(p.termo) === normalizar(termo))) {
    contexto.palavras = [...contexto.palavras, { termo, peso, grupo: null }];
  }

  const paginasMax = limitePaginas || Number(config.paginas_max || 3);
  const resumo = { encontradas: 0, novas: 0, atualizadas: 0, ignoradas: 0, erros: [], amostra: [] };
  const vistas = new Set();

  for (const palavra of termos) {
    for (let pagina = 1; pagina <= paginasMax; pagina += 1) {
      let resultado;
      try {
        resultado = await adaptador.buscar({
          config,
          fonteId: fonte.id,
          termo: palavra.termo,
          usarAspas: palavra.usar_aspas !== 0,
          pagina,
        });
      } catch (erro) {
        resumo.erros.push(`"${palavra.termo}" p.${pagina}: ${erro.message}`);
        break;
      }

      const lote = resultado.licitacoes || [];
      if (!lote.length) break;

      for (const licitacao of lote) {
        resumo.encontradas += 1;
        const identidade = `${licitacao.fonte_id}|${licitacao.chave_externa}`;
        if (vistas.has(identidade)) continue; // mesma licitação em dois termos
        vistas.add(identidade);

        const avaliacao = avaliar(licitacao, contexto);

        // Encerradas e palavras excluídas não entram no Radar (seção 6).
        if (avaliacao.encerrada || avaliacao.excluida) {
          resumo.ignoradas += 1;
          continue;
        }

        if (simular) {
          if (resumo.amostra.length < 20) {
            resumo.amostra.push({
              objeto: (licitacao.objeto || '').slice(0, 180),
              orgao_nome: licitacao.orgao_nome,
              uf: licitacao.uf,
              municipio: licitacao.municipio,
              modalidade: licitacao.modalidade,
              valor_estimado: licitacao.valor_estimado,
              fim_propostas: licitacao.fim_propostas,
              pontuacao: avaliacao.pontuacao,
              palavra: avaliacao.palavra,
              objeto_social: avaliacao.social.estado,
              link_portal: licitacao.link_portal,
            });
          }
          continue;
        }

        try {
          const { id, novo } = await salvarLicitacao(licitacao, avaliacao);
          if (novo) resumo.novas += 1;
          else resumo.atualizadas += 1;

          if (novo && avaliacao.pontuacao >= PONTUACAO_PARA_DETALHAR) {
            await fila.enfileirar(
              'detalhar_licitacao',
              { licitacaoId: id },
              { prioridade: 20, chaveUnica: `detalhar:${id}` }
            );
          }
        } catch (erro) {
          resumo.erros.push(`gravar ${licitacao.chave_externa}: ${erro.sqlMessage || erro.message}`);
        }
      }

      if (lote.length < Number(config.tam_pagina || 100)) break; // última página
    }
  }

  const duracao = Date.now() - inicio;
  const status = resumo.erros.length && !resumo.encontradas
    ? `erro: ${resumo.erros[0]}`.slice(0, 255)
    : `ok: ${resumo.encontradas} encontradas, ${resumo.novas} novas`.slice(0, 255);

  if (!simular) {
    await pool.query('UPDATE fontes SET ultima_coleta = NOW(), ultimo_status = ? WHERE id = ?', [status, fonte.id]);
    await pool.query(
      `INSERT INTO execucoes_coleta (fonte_id, termo, encontradas, novas, atualizadas, ignoradas, duracao_ms, status, mensagem)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fonte.id,
        termo,
        resumo.encontradas,
        resumo.novas,
        resumo.atualizadas,
        resumo.ignoradas,
        duracao,
        resumo.erros.length ? 'parcial' : 'ok',
        resumo.erros.slice(0, 3).join(' | ').slice(0, 500) || null,
      ]
    );
  }

  return { ...resumo, fonte: fonte.nome, termos: termos.length, duracao_ms: duracao, status };
}

/** Varre todas as fontes ativas que já venceram o `intervalo_horas`. */
async function coletarFontes({ forcar = false } = {}) {
  const [fontes] = await pool.query(
    `SELECT id, nome, adaptador, intervalo_horas, ultima_coleta
       FROM fontes
      WHERE ativa = 1
      ORDER BY prioridade ASC, id ASC`
  );

  const enfileiradas = [];
  const semAdaptador = [];
  for (const fonte of fontes) {
    // Fonte cadastrada para um adaptador que ainda não existe (Fase 14) fica de fora.
    if (!adaptadores.existe(fonte.adaptador)) {
      semAdaptador.push(fonte.nome);
      continue;
    }
    const vencida =
      forcar ||
      !fonte.ultima_coleta ||
      Date.now() - new Date(fonte.ultima_coleta).getTime() >= (fonte.intervalo_horas || 6) * 3600000;
    if (!vencida) continue;

    await fila.enfileirar(
      'coletar_fonte',
      { fonteId: fonte.id },
      { prioridade: 10, chaveUnica: `coletar:${fonte.id}` }
    );
    enfileiradas.push(fonte.nome);
  }
  return { enfileiradas, semAdaptador };
}

/** Busca detalhe e itens de uma licitação já gravada e repontua. */
async function detalharLicitacao({ licitacaoId }) {
  const [linhas] = await pool.query(
    `SELECT l.*, f.adaptador, f.config
       FROM licitacoes l JOIN fontes f ON f.id = l.fonte_id
      WHERE l.id = ?`,
    [licitacaoId]
  );
  if (!linhas.length) throw new Error(`Licitação ${licitacaoId} não encontrada.`);
  const licitacao = linhas[0];
  const adaptador = adaptadores.obter(licitacao.adaptador);

  const detalhe = await adaptador.detalhar({ chaveExterna: licitacao.chave_externa }).catch((erro) => {
    console.warn(`Detalhe indisponível para ${licitacao.chave_externa}: ${erro.message}`);
    return null;
  });

  const itens = await adaptador.listarItens({ chaveExterna: licitacao.chave_externa }).catch((erro) => {
    console.warn(`Itens indisponíveis para ${licitacao.chave_externa}: ${erro.message}`);
    return [];
  });

  const gravados = await salvarItens(licitacaoId, itens);

  const contexto = await carregarContexto();
  const mesclada = {
    ...licitacao,
    ...Object.fromEntries(Object.entries(detalhe || {}).filter(([, v]) => v !== null && v !== undefined)),
    beneficios_itens: itens.map((i) => i.beneficio).filter(Boolean),
  };
  const avaliacao = avaliar(mesclada, contexto);

  await pool.query(
    `UPDATE licitacoes SET
       modalidade = COALESCE(?, modalidade),
       modo_disputa = COALESCE(?, modo_disputa),
       situacao = COALESCE(?, situacao),
       numero_compra = COALESCE(?, numero_compra),
       processo = COALESCE(?, processo),
       objeto = COALESCE(?, objeto),
       abertura_propostas = COALESCE(?, abertura_propostas),
       fim_propostas = COALESCE(?, fim_propostas),
       valor_estimado = COALESCE(?, valor_estimado),
       valor_homologado = COALESCE(?, valor_homologado),
       link_disputa = COALESCE(?, link_disputa),
       beneficio_me = COALESCE(?, beneficio_me),
       objeto_social = ?,
       objeto_social_motivo = ?,
       pode_participar = ?,
       motivo_participacao = ?,
       pontuacao = ?,
       pontuacao_detalhe = ?
     WHERE id = ?`,
    [
      recortar(detalhe && detalhe.modalidade, 60),
      recortar(detalhe && detalhe.modo_disputa, 60),
      recortar(detalhe && detalhe.situacao, 60),
      recortar(detalhe && detalhe.numero_compra, 60),
      recortar(detalhe && detalhe.processo, 80),
      (detalhe && detalhe.objeto) || null,
      paraMysql(detalhe && detalhe.abertura_propostas),
      paraMysql(detalhe && detalhe.fim_propostas),
      (detalhe && detalhe.valor_estimado) ?? null,
      (detalhe && detalhe.valor_homologado) ?? null,
      recortar(detalhe && detalhe.link_disputa, 500),
      recortar(avaliacao.beneficio_me, 40),
      avaliacao.social.estado,
      recortar(avaliacao.social.motivo, 255),
      avaliacao.participacao.pode,
      recortar(avaliacao.participacao.motivo, 255),
      avaliacao.pontuacao,
      JSON.stringify(avaliacao.detalhe || []),
      licitacaoId,
    ]
  );

  return { itens: gravados, pontuacao: avaliacao.pontuacao };
}

/**
 * Repontua o que já está gravado, sem ir aos portais. É o que faz a tela de
 * Configurações valer alguma coisa: mudou um peso, um CNAE ou uma palavra de
 * corte, o Radar inteiro se reorganiza.
 *
 * Licitação que passa a casar com uma palavra excluída é descartada com o
 * motivo à vista — nunca apagada, para o histórico continuar explicável.
 */
async function repontuar({ lote = 500 } = {}) {
  const contexto = await carregarContexto();
  const resumo = { avaliadas: 0, mudaram: 0, descartadas: 0 };
  let ultimoId = 0;

  for (;;) {
    const [linhas] = await pool.query(
      `SELECT id, objeto, uf, modalidade, valor_estimado, orcamento_sigiloso, fim_propostas,
              pontuacao, descartada, beneficio_me
         FROM licitacoes
        WHERE id > ?
        ORDER BY id ASC
        LIMIT ?`,
      [ultimoId, lote]
    );
    if (!linhas.length) break;
    ultimoId = linhas[linhas.length - 1].id;

    for (const linha of linhas) {
      // O benefício ME/EPP já apurado nos itens é preservado: `pontuar()` o
      // relê a partir de beneficios_itens, que aqui vem do que foi gravado.
      const avaliacao = avaliar(
        { ...linha, beneficios_itens: linha.beneficio_me ? [linha.beneficio_me] : [] },
        contexto
      );
      resumo.avaliadas += 1;

      const descartar = avaliacao.excluida && !linha.descartada;
      if (descartar) resumo.descartadas += 1;
      if (avaliacao.pontuacao !== linha.pontuacao) resumo.mudaram += 1;

      await pool.query(
        `UPDATE licitacoes SET
           pontuacao = ?, pontuacao_detalhe = ?, grupo = ?, palavra_casada = ?,
           objeto_social = ?, objeto_social_motivo = ?,
           pode_participar = ?, motivo_participacao = ?
           ${descartar ? ', descartada = 1, motivo_descarte = ?' : ''}
         WHERE id = ?`,
        [
          avaliacao.pontuacao,
          JSON.stringify(avaliacao.detalhe || []),
          recortar(avaliacao.grupo, 60),
          recortar(avaliacao.palavra, 160),
          avaliacao.social.estado,
          recortar(avaliacao.social.motivo, 255),
          avaliacao.participacao.pode,
          recortar(avaliacao.participacao.motivo, 255),
          ...(descartar ? [recortar('palavra excluída passou a valer', 255)] : []),
          linha.id,
        ]
      );
    }

    if (linhas.length < lote) break;
  }

  return resumo;
}

function registrarNaFila() {
  fila.registrar('coletar_fontes', (payload) => coletarFontes(payload || {}));
  fila.registrar('repontuar', (payload) => repontuar(payload || {}));
  fila.registrar('coletar_fonte', (payload) => coletarFonte(payload));
  fila.registrar('detalhar_licitacao', (payload) => detalharLicitacao(payload));
}

module.exports = {
  coletarFonte,
  coletarFontes,
  detalharLicitacao,
  repontuar,
  avaliar,
  salvarLicitacao,
  salvarItens,
  carregarContexto,
  registrarNaFila,
  PONTUACAO_PARA_DETALHAR,
};
