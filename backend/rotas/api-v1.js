// /api/v1 — a API pública por token (Seção 14 do PLANO_SAAS_CONLICITACAO.md).
// Só leitura, e só o que é da organização do token: a lista usa os mesmos
// filtros do Radar e a mesma tabela derivada `escopo.daOrganizacao`, então a
// pontuação, a etapa e o favorito que saem aqui são os DA organização.
// Documentada em docs/API.md. Montada em app.js depois de `pilhaApi`.
const express = require('express');
const pool = require('../config/db');
const { responderErro } = require('../middlewares/responder-erro');
const escopo = require('../servicos/escopo');
const limites = require('../servicos/limites');
const { POR_MINUTO } = require('../servicos/api');
const { filtrosDe, comEtiquetas, COLUNAS_LISTA } = require('../servicos/radar');

const rotas = express.Router();

const POR_PAGINA_MAXIMO = 100;
const ORDENACOES = {
  recentes: 'l.criado_em DESC, l.id DESC',
  prazo: 'l.fim_propostas IS NULL, l.fim_propostas ASC, l.id ASC',
  relevancia: 'l.pontuacao IS NULL, l.pontuacao DESC, l.id ASC',
};

// O Radar tem filtros que dependem de quem está logado ("por mim"). Token não é pessoa.
const FILTROS_DE_PESSOA = ['por_mim'];

function forma(l) {
  return {
    id: l.id,
    orgao: l.orgao_nome,
    unidade: l.unidade,
    uf: l.uf,
    municipio: l.municipio,
    esfera: l.esfera,
    modalidade: l.modalidade,
    modo_disputa: l.modo_disputa,
    numero_compra: l.numero_compra,
    processo: l.processo,
    objeto: l.objeto,
    valor_estimado: l.orcamento_sigiloso || l.valor_estimado == null ? null : Number(l.valor_estimado),
    orcamento_sigiloso: Boolean(l.orcamento_sigiloso),
    srp: l.srp == null ? null : Boolean(l.srp),
    abertura_propostas: l.abertura_propostas,
    fim_propostas: l.fim_propostas,
    situacao: l.situacao,
    plataforma_disputa: l.plataforma_disputa,
    link_portal: l.link_portal,
    link_disputa: l.link_disputa,
    criado_em: l.criado_em,
    // O que a organização decidiu e pontuou — nunca o de outra. Licitação que a
    // organização ainda não pontuou não tem decisão: sai null, não um zero inventado.
    pontuacao: l.pontuacao == null || l.da_organizacao === 0 ? null : Number(l.pontuacao),
    etapa: l.da_organizacao === 0 ? null : l.etapa || null,
    favorito: l.da_organizacao === 0 ? false : Boolean(l.favorito),
    etiquetas: l.etiquetas || [],
  };
}

// GET /api/v1/eu — quem é este token, o plano e quanto da cota do mês já foi.
rotas.get('/eu', async (req, res) => {
  try {
    const dados = await limites.daOrganizacao(req.organizacaoId);
    const [[gasto]] = await pool.query(
      "SELECT quantidade FROM uso_mensal WHERE organizacao_id = ? AND mes = ? AND recurso = 'api_chamadas_mes'",
      [req.organizacaoId, limites.mesDe()]
    );
    const limite = dados && dados.plano && dados.plano.limites ? dados.plano.limites.api_chamadas_mes : 0;
    res.json({
      organizacao: dados ? { id: dados.organizacao.id, nome: dados.organizacao.nome } : null,
      plano: dados && dados.plano ? { codigo: dados.plano.codigo, nome: dados.plano.nome } : null,
      token: req.tokenApi,
      ip_visto: req.ip,
      cota_mensal: { limite: limite === undefined ? 0 : limite, usado: gasto ? Number(gasto.quantidade) : 0 },
      limite_por_minuto: POR_MINUTO,
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar os dados do token.', erro);
  }
});

// GET /api/v1/licitacoes — os mesmos filtros do Radar (docs/API.md lista os principais).
rotas.get('/licitacoes', async (req, res) => {
  try {
    const q = { ...req.query };
    for (const campo of FILTROS_DE_PESSOA) delete q[campo];
    const { onde, valores, avisos } = await filtrosDe(q, req.organizacaoId, null);
    const ordem = ORDENACOES[req.query.ordem] || ORDENACOES.recentes;
    const porPagina = Math.min(Math.max(Number(req.query.por_pagina) || 20, 1), POR_PAGINA_MAXIMO);
    const pagina = Math.max(Number(req.query.pagina) || 1, 1);

    const origem = `${escopo.daOrganizacao(req.organizacaoId)} l JOIN fontes f ON f.id = l.fonte_id`;
    const [[linhas], [[{ total }]]] = await Promise.all([
      pool.query(
        `SELECT ${COLUNAS_LISTA}, l.pontuacao, l.etapa, l.favorito
           FROM ${origem} ${onde} ORDER BY ${ordem} LIMIT ? OFFSET ?`,
        [...valores, porPagina, (pagina - 1) * porPagina]
      ),
      pool.query(`SELECT COUNT(*) AS total FROM ${origem} ${onde}`, valores),
    ]);
    res.json({ dados: comEtiquetas(linhas).map(forma), total: Number(total), pagina, por_pagina: porPagina, avisos });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível listar as licitações.', erro);
  }
});

// GET /api/v1/licitacoes/:id — uma licitação com os itens.
rotas.get('/licitacoes/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ erro: 'Identificador de licitação inválido.' });
  try {
    const [[linha]] = await pool.query(
      // `todas`: como o detalhe do painel, abre a licitação mesmo que a coleta ainda
      // não a tenha pontuado para esta organização (a lista, como o Radar, só traz as pontuadas).
      `SELECT ${COLUNAS_LISTA}, l.pontuacao, l.etapa, l.favorito,
              EXISTS (SELECT 1 FROM org_licitacoes ol WHERE ol.organizacao_id = ? AND ol.licitacao_id = l.id) AS da_organizacao
         FROM ${escopo.daOrganizacao(req.organizacaoId, { todas: true })} l JOIN fontes f ON f.id = l.fonte_id
        WHERE l.id = ?`,
      [req.organizacaoId, id]
    );
    if (!linha) return res.status(404).json({ erro: 'Licitação não encontrada.' });
    const [itens] = await pool.query(
      `SELECT numero_item, descricao, quantidade, unidade, valor_unit_estimado, valor_total_estimado, beneficio, situacao_item
         FROM licitacao_itens WHERE licitacao_id = ? ORDER BY numero_item LIMIT 1000`,
      [id]
    );
    const [com] = comEtiquetas([{ ...linha, da_organizacao: Number(linha.da_organizacao) }]);
    const sigiloso = Boolean(linha.orcamento_sigiloso);
    res.json({
      ...forma(com),
      itens: itens.map((i) => ({
        numero: i.numero_item,
        descricao: i.descricao,
        quantidade: i.quantidade == null ? null : Number(i.quantidade),
        unidade: i.unidade,
        valor_unitario: sigiloso || i.valor_unit_estimado == null ? null : Number(i.valor_unit_estimado),
        valor_total: sigiloso || i.valor_total_estimado == null ? null : Number(i.valor_total_estimado),
        beneficio: i.beneficio,
        situacao: i.situacao_item,
      })),
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar a licitação.', erro);
  }
});

module.exports = rotas;
