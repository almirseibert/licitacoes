// Rotas sem login (Seção 7 do plano SaaS): a lista do Radar aberta por link de
// leitura com validade. Mostra só o fato público da licitação — nada da decisão
// da organização (etapa, preço, proposta, anotação) sai por aqui.
const express = require('express');
const pool = require('../config/db');
const { responderErro } = require('../middlewares/responder-erro');
const escopo = require('../servicos/escopo');
const linkPublico = require('../servicos/link-publico');
const limites = require('../servicos/limites');
const filtrosRadar = require('../regras/filtros-radar');
const radar = require('../servicos/radar');

const rotas = express.Router();
const POR_PAGINA = 50;

// O que o link mostra: o fato público, igual para qualquer cliente.
const CAMPOS_PUBLICOS = [
  'id', 'orgao_nome', 'unidade', 'uf', 'municipio', 'esfera', 'modalidade', 'objeto', 'valor_estimado',
  'orcamento_sigiloso', 'srp', 'numero_compra', 'processo', 'abertura_propostas', 'fim_propostas',
  'situacao', 'plataforma_disputa', 'link_portal', 'link_disputa', 'beneficio_me', 'total_itens',
  'exige_garantia', 'etiquetas',
];

// GET /api/publico/radar/:token?pagina=1
rotas.get('/radar/:token', async (req, res) => {
  const naoAchado = () => res.status(404).json({ erro: 'Este link não existe ou já expirou. Peça um novo a quem enviou.' });
  if (!linkPublico.formatoValido(req.params.token)) return naoAchado();
  try {
    const [[link]] = await pool.query(
      'SELECT id, organizacao_id, nome, filtros, expira_em FROM links_publicos WHERE token_hash = ? AND expira_em > NOW()',
      [linkPublico.hash(req.params.token)]
    );
    if (!link) return naoAchado();
    // Organização suspensa (ou que nem lê mais o próprio painel) não publica nada.
    const plano = await limites.daOrganizacao(link.organizacao_id);
    if (plano && !plano.isenta && !plano.situacao.pode_ler) return naoAchado();

    // Reaplicado na leitura: link criado antes da regra também não mostra decisão.
    const filtros = filtrosRadar.filtrosPublicos(limites.lerJson(link.filtros, {}));
    const { onde, valores } = await radar.filtrosDe(filtros, link.organizacao_id);
    const pagina = Math.max(Number(req.query.pagina) || 1, 1);
    const daOrg = escopo.daOrganizacao(link.organizacao_id);

    const [[linhas], [[{ total }]]] = await Promise.all([
      pool.query(
        `SELECT ${radar.COLUNAS_LISTA} FROM ${daOrg} l JOIN fontes f ON f.id = l.fonte_id ${onde}
          ORDER BY (l.fim_propostas IS NULL) ASC, l.fim_propostas ASC, l.id ASC LIMIT ? OFFSET ?`,
        [...valores, POR_PAGINA, (pagina - 1) * POR_PAGINA]
      ),
      pool.query(`SELECT COUNT(*) AS total FROM ${daOrg} l JOIN fontes f ON f.id = l.fonte_id ${onde}`, valores),
    ]);
    // O contador de acessos não segura a resposta.
    pool.query('UPDATE links_publicos SET acessos = acessos + 1 WHERE id = ?', [link.id])
      .catch((erro) => console.warn('Contador do link público:', erro.message));

    const dados = radar.comEtiquetas(linhas).map((l) => Object.fromEntries(CAMPOS_PUBLICOS.map((c) => [c, l[c]])));
    res.json({ nome: link.nome, expira_em: link.expira_em, dados, total: Number(total), pagina, por_pagina: POR_PAGINA });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível abrir a lista compartilhada.', erro);
  }
});

module.exports = rotas;
