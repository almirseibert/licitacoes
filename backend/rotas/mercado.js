// Contratos do mercado, atas e acompanhamentos (Seção 12 do PLANO_SAAS_CONLICITACAO.md).
//
// As tabelas `mercado_*` são catálogo público (sem organizacao_id). O que é da
// organização aqui é só a leitura: "favorita" e "atividade" (palavra-chave)
// sempre filtram por req.organizacaoId.
const express = require('express');
const pool = require('../config/db');
const { responderErro } = require('../middlewares/responder-erro');
const regras = require('../regras/mercado');

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
const favoritaDa = (alias) =>
  `EXISTS (SELECT 1 FROM licitacoes lf JOIN org_licitacoes of_ ON of_.licitacao_id = lf.id
            WHERE lf.numero_controle = ${alias}.numero_controle_compra AND of_.organizacao_id = ? AND of_.favorito = 1)`;

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
    // Palavra de outra organização (ou apagada) não vira "sem filtro": vira lista vazia.
    condicoes.push(palavra ? 'a.objeto LIKE ?' : '1 = 0');
    if (palavra) valores.push(regras.like(palavra.termo));
  }
  if (q.favoritas === '1') {
    condicoes.push(favoritaDa('a'));
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
    extras.push(`${favoritaDa('a')} AS favorita`);
    valoresExtras.push(req.organizacaoId);
  } else {
    extras.push(`${regras.ESTIMADO} AS valor_estimado`);
  }

  const [[[{ total }]], [linhas]] = await Promise.all([
    pool.query(`SELECT COUNT(*) AS total FROM ${tabela} a ${onde}`, valores),
    pool.query(
      `SELECT a.*, ${extras.join(', ')} FROM ${tabela} a ${onde} ORDER BY ${ordem} LIMIT ? OFFSET ?`,
      [...valoresExtras, ...valores, porPagina, (pagina - 1) * porPagina]
    ),
  ]);

  const hoje = regras.hojeEmBrasilia();
  return {
    total,
    pagina,
    por_pagina: porPagina,
    dados: linhas.map((l) => {
      const { avisado_em: _a, coletado_em: _c, atualizado_em: _u, ...resto } = l;
      const item = { ...resto };
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

// GET /api/mercado/resumo — contagem por mês e UF, e o estado de cada coleta.
mercado.get('/resumo', async (_req, res) => {
  try {
    const porMes = (tabela) =>
      pool.query(
        // Mês de Brasília (o banco está em UTC).
        `SELECT uf, DATE_FORMAT(DATE_SUB(publicado_em, INTERVAL 3 HOUR), '%Y-%m') AS mes, COUNT(*) AS total
           FROM ${tabela} GROUP BY uf, mes ORDER BY mes DESC, uf LIMIT 120`
      );
    const [[contratos], [atas], [coletas], [opcoes]] = await Promise.all([
      porMes('mercado_contratos'),
      porMes('mercado_atas'),
      pool.query(
        // `ate` sai como instante (UTC com Z), para o navegador mostrar no fuso de quem olha.
        'SELECT tipo, uf, ate, ultima_execucao, ultimo_status, gravados, ultimo_erro FROM mercado_coletas ORDER BY uf, tipo'
      ),
      pool.query(
        `SELECT 'tipo' AS campo, tipo AS valor FROM mercado_contratos WHERE tipo IS NOT NULL GROUP BY tipo
         UNION ALL SELECT 'modalidade', modalidade FROM mercado_contratos WHERE modalidade IS NOT NULL GROUP BY modalidade
         UNION ALL SELECT 'modalidade', modalidade FROM mercado_atas WHERE modalidade IS NOT NULL GROUP BY modalidade
         UNION ALL SELECT 'poder', poder FROM mercado_contratos WHERE poder IS NOT NULL GROUP BY poder
         UNION ALL SELECT 'uf', uf FROM mercado_contratos WHERE uf IS NOT NULL GROUP BY uf`
      ),
    ]);
    const listas = {};
    for (const o of opcoes) (listas[o.campo] ||= new Set()).add(o.valor);
    res.json({
      contratos_por_mes: contratos,
      atas_por_mes: atas,
      coletas,
      opcoes: Object.fromEntries(Object.entries(listas).map(([k, v]) => [k, [...v].sort()])),
      dias_aviso_fim: regras.DIAS_AVISO_FIM,
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar o resumo do mercado.', erro);
  }
});

// ---------------------------------------------------- /api/acompanhamentos
const acompanhamentos = express.Router();

acompanhamentos.get('/', rotaDeLista('acompanhamentos', 'Não foi possível carregar os acompanhamentos.'));
acompanhamentos.get('/tipos', (_req, res) => {
  res.json({ dados: Object.entries(regras.ROTULOS_PUBLICACAO).map(([chave, rotulo]) => ({ chave, rotulo })) });
});

module.exports = { mercado, acompanhamentos };
