// Dossiês de concorrente e de órgão (seções 26 e 27), e a consulta de sanções.
const express = require('express');
const { responderErro } = require('../middlewares/responder-erro');
const pool = require('../config/db');
const escopo = require('../servicos/escopo');
const sancoes = require('../servicos/sancoes');
const dossies = require('../jobs/dossies');
const exigencias = require('../regras/exigencias');

const rotas = express.Router();

function lerJson(valor, padrao) {
  if (valor === null || valor === undefined) return padrao;
  if (typeof valor !== 'string') return valor;
  try {
    return JSON.parse(valor);
  } catch {
    return padrao;
  }
}

// POST /api/dossies/agregar — recalcula tudo na hora (mensal no worker).
rotas.post('/agregar', async (_req, res) => {
  try {
    const r = await dossies.agregarDossies();
    res.json({ ...r, mensagem: `${r.concorrentes} concorrente(s) e ${r.orgaos} órgão(s) recalculados.` });
  } catch (erro) {
    console.error('Erro ao agregar dossiês:', erro.message);
    responderErro(res, 500, 'Não foi possível recalcular os dossiês.', erro);
  }
});

// GET /api/dossies/orgaos — a lista, com o filtro de proximidade da seção 27.2.
rotas.get('/orgaos', async (req, res) => {
  const uf = req.query.uf || null;
  const busca = req.query.busca || null;

  try {
    const condicoes = [];
    const valores = [];
    if (uf) {
      condicoes.push('uf = ?');
      valores.push(uf);
    }
    if (busca) {
      condicoes.push('(nome LIKE ? OR municipio LIKE ?)');
      valores.push(`%${busca}%`, `%${busca}%`);
    }

    const [dados] = await pool.query(
      `SELECT * FROM orgaos
       ${condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : ''}
       ORDER BY contratacoes DESC, valor_total DESC
       LIMIT 200`,
      valores
    );

    res.json({
      dados: dados.map((o) => ({
        ...o,
        exigencias_json: lerJson(o.exigencias_json, []),
        fornecedores_json: lerJson(o.fornecedores_json, []),
      })),
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível listar os órgãos.', erro);
  }
});

// GET /api/dossies/orgaos/:cnpj — a ficha da seção 27.1.
rotas.get('/orgaos/:cnpj', async (req, res) => {
  const cnpj = String(req.params.cnpj).replace(/\D/g, '');
  try {
    const [[orgao]] = await pool.query('SELECT * FROM orgaos WHERE cnpj = ?', [cnpj]);
    if (!orgao) {
      return res.status(404).json({ erro: 'Este órgão ainda não aparece na base do painel.' });
    }

    const [licitacoes] = await pool.query(
      `SELECT id, objeto, modalidade, valor_estimado, valor_homologado, situacao, etapa, fim_propostas
         FROM ${escopo.daOrganizacao(req.organizacaoId, { todas: true })} l
        WHERE orgao_cnpj = ? ORDER BY fim_propostas DESC LIMIT 30`,
      [cnpj]
    );
    const [recorrencias] = await pool.query(
      'SELECT * FROM recorrencias WHERE orgao_cnpj = ? ORDER BY proxima_prevista',
      [cnpj]
    );

    // O código do catálogo vira o rótulo que a pessoa lê.
    const perfilExigencias = lerJson(orgao.exigencias_json, []).map((e) => ({
      ...e,
      rotulo: (exigencias.PORCODIGO.get(e.codigo) || {}).rotulo || e.codigo,
    }));

    res.json({
      orgao: { ...orgao, exigencias_json: perfilExigencias, fornecedores_json: lerJson(orgao.fornecedores_json, []) },
      licitacoes,
      recorrencias,
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível abrir a ficha do órgão.', erro);
  }
});

// GET /api/dossies/concorrentes/:cnpj — a ficha da seção 26.1.
rotas.get('/concorrentes/:cnpj', async (req, res) => {
  const cnpj = String(req.params.cnpj).replace(/\D/g, '');
  try {
    const [[c]] = await pool.query('SELECT * FROM concorrentes WHERE cnpj = ?', [cnpj]);
    if (!c) {
      return res.status(404).json({
        erro: 'Este CNPJ ainda não apareceu em nenhuma licitação que o painel acompanha.',
      });
    }

    const [licitacoes] = await pool.query(
      `SELECT l.id, l.objeto, l.orgao_nome, l.uf, l.grupo, l.valor_estimado, l.fim_propostas,
              COUNT(p.id) AS itens
         FROM propostas_concorrentes p
         JOIN ${escopo.daOrganizacao(req.organizacaoId, { todas: true })} l ON l.id = p.licitacao_id
        WHERE p.cnpj = ?
        GROUP BY l.id
        ORDER BY l.fim_propostas DESC LIMIT 30`,
      [cnpj]
    );

    // "Encontrou você" é da organização que pergunta (Seção 1b): calculado
    // agora, contra as licitações que ELA levou até Ganhamos/Perdemos — o
    // número gravado em `concorrentes` é do catálogo e não diz nada sobre ela.
    const [[encontro]] = await pool.query(
      `SELECT COUNT(DISTINCT l.id) AS encontros, COALESCE(SUM(l.cnpj_vencedor = ?), 0) AS perdidos
         FROM ${escopo.daOrganizacao(req.organizacaoId)} l
         JOIN propostas_concorrentes p ON p.licitacao_id = l.id AND p.cnpj = ?
        WHERE l.etapa IN ('Ganhamos','Perdemos')`,
      [cnpj, cnpj]
    );
    c.encontros = Number(encontro.encontros || 0);
    c.encontros_perdidos = Number(encontro.perdidos || 0);

    res.json({
      concorrente: {
        ...c,
        menor_preco_json: lerJson(c.menor_preco_json, {}),
        ufs: lerJson(c.ufs, []),
        grupos: lerJson(c.grupos, []),
        sancoes: lerJson(c.sancoes, []),
      },
      licitacoes,
      // Sem isto a tela não tem como dizer "nenhuma sanção" com honestidade.
      sancoes_disponivel: sancoes.disponivel(),
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível abrir a ficha.', erro);
  }
});

// POST /api/dossies/concorrentes/:cnpj/sancoes — CEIS e CNEP (seção 26.3).
rotas.post('/concorrentes/:cnpj/sancoes', async (req, res) => {
  try {
    const r = await sancoes.consultar(req.params.cnpj, { forcar: Boolean(req.body && req.body.forcar) });
    if (!r.disponivel) return res.status(409).json({ erro: r.motivo });
    res.json(r);
  } catch (erro) {
    console.error('Erro ao consultar sanções:', erro.message);
    responderErro(res, 500, 'Não foi possível consultar as sanções.', erro);
  }
});

// POST /api/dossies/minhas-sancoes — o próprio CNPJ (seção 26.3, uso 1).
rotas.post('/minhas-sancoes', async (req, res) => {
  try {
    const r = await sancoes.checarPropriaEmpresa(req.organizacaoId);
    if (r.ok === false) return res.status(400).json({ erro: r.motivo });
    if (!r.disponivel) return res.status(409).json({ erro: r.motivo });
    res.json(r);
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível consultar as sanções da empresa.', erro);
  }
});

module.exports = rotas;
