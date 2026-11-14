// Contratos do mercado, atas e acompanhamentos (Seção 12 do PLANO_SAAS_CONLICITACAO.md).
//
// As tabelas `mercado_*` são catálogo público (sem organizacao_id). O que é da
// organização aqui é só a leitura: "favorita" e "atividade" (palavra-chave)
// sempre filtram por req.organizacaoId.
const express = require('express');
const pool = require('../config/db');
const { responderErro } = require('../middlewares/responder-erro');
const regras = require('../regras/mercado');
const analise = require('../servicos/analise-mercado');

const POR_PAGINA_MAX = 100;

const ORDENS = {
  contratos: {
    recentes: 'a.data_assinatura DESC, a.id DESC',
    valor: 'a.valor_global DESC, a.id DESC',
    vigencia: 'a.vigencia_fim ASC, a.id ASC',
  },
  atas: {
    recentes: 'a.data_assinatura DESC, a.id DESC',
    vigencia: 'a.vigencia_fim ASC, a.id ASC',
  },
  acompanhamentos: { recentes: 'a.ocorrido_em DESC, a.id DESC' },
};
const TABELAS = { contratos: 'mercado_contratos', atas: 'mercado_atas', acompanhamentos: 'mercado_publicacoes' };

// A licitação do catálogo de onde a publicação saiu, para o "abrir no Radar".
const LICITACAO =
  '(SELECT MIN(lc.id) FROM licitacoes lc WHERE lc.numero_controle = a.numero_controle_compra) AS licitacao_id';
const FAVORITA = `EXISTS (SELECT 1 FROM licitacoes lf JOIN org_licitacoes of_ ON of_.licitacao_id = lf.id
  WHERE lf.numero_controle = a.numero_controle_compra AND of_.organizacao_id = ? AND of_.favorito = 1)`;
// Contar além disto custa uma varredura inteira (LIKE em TEXT) a cada clique;
// a tela mostra "10.000+".
const TETO_CONTAGEM = 10000;

async function listar(tipo, req) {
  const q = req.query;
  const { condicoes, valores } = regras.montarFiltros(tipo, q);

  // "Atividade" = uma palavra-chave da própria organização.
  const atividade = Number.parseInt(q.atividade, 10);
  if (Number.isFinite(atividade)) {
    const [[palavra]] = await pool.query(
      'SELECT termo FROM palavras_chave WHERE id = ? AND organizacao_id = ?',
      [atividade, req.organizacaoId]
    );
    if (palavra) {
      condicoes.push('a.objeto LIKE ?');
      valores.push(regras.like(palavra.termo));
    } else {
      // Palavra de outra organização (ou apagada) não vira "sem filtro": vira lista vazia.
      condicoes.push('1 = 0');
    }
  }
  if (q.favoritas === '1') {
    condicoes.push(FAVORITA);
    valores.push(req.organizacaoId);
  }

  const onde = condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : '';
  const porPagina = Math.min(Math.max(Number.parseInt(q.por_pagina, 10) || 30, 1), POR_PAGINA_MAX);
  const pagina = Math.max(Number.parseInt(q.pagina, 10) || 1, 1);
  const ordem = ORDENS[tipo][q.ordem] || ORDENS[tipo].recentes;
  const tabela = TABELAS[tipo];

  const extras = [LICITACAO];
  const valoresExtras = [];
  if (tipo === 'acompanhamentos') {
    extras.push(`${FAVORITA} AS favorita`);
    valoresExtras.push(req.organizacaoId);
  } else {
    extras.push(`${regras.ESTIMADO} AS valor_estimado`);
  }

  const [[[{ total }]], [linhas]] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS total FROM (SELECT 1 FROM ${tabela} a ${onde} LIMIT ?) t`, [
      ...valores,
      TETO_CONTAGEM + 1,
    ]),
    pool.query(
      `SELECT a.*, ${extras.join(', ')} FROM ${tabela} a ${onde} ORDER BY ${ordem} LIMIT ? OFFSET ?`,
      [...valoresExtras, ...valores, porPagina, (pagina - 1) * porPagina]
    ),
  ]);

  const hoje = regras.hojeEmBrasilia();
  return {
    total: Math.min(total, TETO_CONTAGEM),
    total_limitado: total > TETO_CONTAGEM,
    pagina,
    por_pagina: porPagina,
    dados: linhas.map((l) => {
      const { avisado_em: _a, coletado_em: _c, atualizado_em: _u, ...item } = l;
      if (tipo === 'acompanhamentos') {
        item.favorita = Boolean(l.favorita);
        item.rotulo = regras.ROTULOS_PUBLICACAO[l.tipo];
      } else {
        item.dias_para_fim = regras.diasParaFim(l.vigencia_fim, hoje);
        item.perto_do_fim =
          item.dias_para_fim !== null && item.dias_para_fim >= 0 && item.dias_para_fim <= regras.DIAS_AVISO_FIM;
      }
      return item;
    }),
  };
}

function rotaDeLista(tipo, mensagem) {
  return async (req, res) => {
    try {
      res.json(await listar(tipo, req));
    } catch (erro) {
      responderErro(res, 500, mensagem, erro);
    }
  };
}

// ------------------------------------------------------------- /api/mercado
const mercado = express.Router();

mercado.get('/contratos', rotaDeLista('contratos', 'Não foi possível carregar os contratos do mercado.'));
mercado.get('/atas', rotaDeLista('atas', 'Não foi possível carregar as atas.'));

// O resumo só muda quando a coleta roda (uma vez por dia): 10 min em memória
// poupam ~6 varreduras de tabela a cada tela aberta.
const CACHE_RESUMO_MS = 10 * 60 * 1000;
let cacheResumo = null;

// Guarda a promessa, não o resultado: dois pedidos juntos fazem uma consulta só.
function resumoEmCache() {
  if (!cacheResumo || Date.now() - cacheResumo.em > CACHE_RESUMO_MS) {
    const promessa = calcularResumo().catch((erro) => {
      cacheResumo = null;
      throw erro;
    });
    cacheResumo = { em: Date.now(), promessa };
  }
  return cacheResumo.promessa;
}

async function calcularResumo() {
  // Mês de Brasília (o banco está em UTC).
  const porMes = (tabela) =>
    pool.query(
      `SELECT uf, DATE_FORMAT(DATE_SUB(publicado_em, INTERVAL 3 HOUR), '%Y-%m') AS mes, COUNT(*) AS total
         FROM ${tabela} GROUP BY uf, mes ORDER BY mes DESC, uf LIMIT 120`
    );
  // As listas dos filtros numa varredura por tabela, separadas em JS.
  const combinacoes = (tabela, tipo) =>
    pool.query(`SELECT ${tipo ? 'tipo' : 'NULL AS tipo'}, modalidade, poder, uf FROM ${tabela} GROUP BY 1, 2, 3, 4`);
  const [[contratos], [atas], [combC], [combA]] = await Promise.all([
    porMes('mercado_contratos'),
    porMes('mercado_atas'),
    combinacoes('mercado_contratos', true),
    combinacoes('mercado_atas', false),
  ]);
  const opcoes = {};
  for (const linha of [...combC, ...combA]) {
    for (const campo of ['tipo', 'modalidade', 'poder', 'uf']) {
      if (linha[campo]) (opcoes[campo] ||= new Set()).add(linha[campo]);
    }
  }
  return {
    contratos_por_mes: contratos,
    atas_por_mes: atas,
    opcoes: Object.fromEntries(Object.entries(opcoes).map(([k, v]) => [k, [...v].sort()])),
    dias_aviso_fim: regras.DIAS_AVISO_FIM,
  };
}

// GET /api/mercado/resumo — contagem por mês e UF, estado de cada coleta, listas dos filtros.
mercado.get('/resumo', async (_req, res) => {
  try {
    const dados = await resumoEmCache();
    // O estado da coleta é uma tabela de poucas linhas: sempre fresco.
    // `ate` sai como instante (UTC com Z), para o navegador mostrar no fuso de quem olha.
    const [coletas] = await pool.query(
      'SELECT tipo, uf, ate, ultima_execucao, ultimo_status, gravados, ultimo_erro FROM mercado_coletas ORDER BY uf, tipo'
    );
    res.json({ ...dados, coletas });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar o resumo do mercado.', erro);
  }
});

// ------------------------------------------- Seção 13: análise e concorrentes
// O catálogo é público; segmento, filtro salvo e "próprio CNPJ" são da
// organização que pergunta (servicos/analise-mercado.js filtra por ela).

mercado.get('/analise/opcoes', async (req, res) => {
  try {
    res.json(await analise.opcoes(req.organizacaoId));
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar os segmentos.', erro);
  }
});

// GET /api/mercado/analise — compras por mês, região, modalidade, órgão, fornecedor e produto.
mercado.get('/analise', async (req, res) => {
  try {
    res.json(await analise.analisar(req.organizacaoId, req.query));
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível montar a análise de mercado.', erro);
  }
});

// GET /api/mercado/analise/pdf?mes=AAAA-MM&segmento=... — o relatório mensal por segmento.
mercado.get('/analise/pdf', async (req, res) => {
  try {
    const { buffer, analise: r } = await analise.relatorioEmPdf(req.organizacaoId, req.query);
    const nome = `relatorio-mercado-${(r.segmento.nome || 'mercado').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '-').toLowerCase()}-${r.periodo.de.slice(0, 7)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    res.send(buffer);
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível gerar o relatório em PDF.', erro);
  }
});

// GET /api/mercado/recorrentes — quem mais assina contrato nos meus segmentos.
mercado.get('/recorrentes', async (req, res) => {
  try {
    res.json(await analise.recorrentes(req.organizacaoId, req.query));
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível listar os concorrentes recorrentes.', erro);
  }
});

// GET /api/mercado/fornecedores/:cnpj — perfil por CNPJ no mercado.
mercado.get('/fornecedores/:cnpj', async (req, res) => {
  try {
    const perfil = await analise.perfilNoMercado(req.params.cnpj);
    if (!perfil) return res.status(400).json({ erro: 'Informe um CNPJ com 14 dígitos.' });
    res.json(perfil);
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível abrir o perfil do fornecedor.', erro);
  }
});

// ---------------------------------------------------- /api/acompanhamentos
const acompanhamentos = express.Router();

acompanhamentos.get('/', rotaDeLista('acompanhamentos', 'Não foi possível carregar os acompanhamentos.'));
acompanhamentos.get('/tipos', (_req, res) => {
  res.json({ dados: Object.entries(regras.ROTULOS_PUBLICACAO).map(([chave, rotulo]) => ({ chave, rotulo })) });
});

module.exports = { mercado, acompanhamentos };
