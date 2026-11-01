// GET/PATCH /api/licitacoes — alimenta a tela Radar (seções 11.1 e 13).
const express = require('express');
const pool = require('../config/db');
const fila = require('../servicos/fila');

const rotas = express.Router();

const ORDENACOES = {
  // Ordenação padrão do Radar: pontuação desc, depois prazo asc (seção 11.1)
  relevancia: 'l.pontuacao DESC, (l.fim_propostas IS NULL) ASC, l.fim_propostas ASC',
  prazo: '(l.fim_propostas IS NULL) ASC, l.fim_propostas ASC',
  valor: 'l.valor_estimado DESC',
  recentes: 'l.criado_em DESC',
};

const ETAPAS = [
  'Triagem',
  'Analisando',
  'Vou disputar',
  'Documentação',
  'Proposta enviada',
  'Em disputa',
  'Resultado',
  'Descartada',
];

function montarFiltros(q) {
  const onde = [];
  const valores = [];

  if (q.incluir_descartadas !== '1') onde.push('l.descartada = 0');

  if (q.grupo) {
    onde.push('l.grupo = ?');
    valores.push(q.grupo);
  }
  if (q.uf) {
    const ufs = String(q.uf).split(',').map((u) => u.trim().toUpperCase()).filter(Boolean);
    onde.push(`l.uf IN (${ufs.map(() => '?').join(',')})`);
    valores.push(...ufs);
  }
  if (q.modalidade) {
    onde.push('l.modalidade LIKE ?');
    valores.push(`%${q.modalidade}%`);
  }
  if (q.fonte_id) {
    onde.push('l.fonte_id = ?');
    valores.push(Number(q.fonte_id));
  }
  if (q.valor_min) {
    onde.push('l.valor_estimado >= ?');
    valores.push(Number(q.valor_min));
  }
  if (q.valor_max) {
    onde.push('l.valor_estimado <= ?');
    valores.push(Number(q.valor_max));
  }
  // Por padrão o Radar esconde a faixa "Baixa" (<30), conforme a seção 6.
  const pontuacaoMinima = q.pontuacao_min === undefined || q.pontuacao_min === '' ? 30 : Number(q.pontuacao_min);
  if (pontuacaoMinima > 0) {
    onde.push('l.pontuacao >= ?');
    valores.push(pontuacaoMinima);
  }
  if (q.prazo_dias) {
    onde.push('l.fim_propostas IS NOT NULL AND l.fim_propostas <= DATE_ADD(NOW(), INTERVAL ? DAY)');
    valores.push(Number(q.prazo_dias));
  }
  if (q.em_aberto === '1') {
    onde.push('(l.fim_propostas IS NULL OR l.fim_propostas >= NOW())');
  }
  if (q.pode_participar) {
    onde.push('l.pode_participar = ?');
    valores.push(q.pode_participar);
  }
  if (q.objeto_social) {
    onde.push('l.objeto_social = ?');
    valores.push(q.objeto_social);
  }
  if (q.exclusivo_me === '1') {
    onde.push("l.beneficio_me IN ('exclusivo','cota')");
  }
  if (q.etapa) {
    onde.push('l.etapa = ?');
    valores.push(q.etapa);
  }
  if (q.favorito === '1') onde.push('l.favorito = 1');
  if (q.novas_24h === '1') onde.push('l.criado_em >= DATE_SUB(NOW(), INTERVAL 24 HOUR)');
  if (q.busca) {
    onde.push('(l.objeto LIKE ? OR l.orgao_nome LIKE ? OR l.municipio LIKE ?)');
    const alvo = `%${q.busca}%`;
    valores.push(alvo, alvo, alvo);
  }

  return { onde: onde.length ? `WHERE ${onde.join(' AND ')}` : '', valores };
}

// GET /api/licitacoes
rotas.get('/', async (req, res) => {
  try {
    const { onde, valores } = montarFiltros(req.query);
    const ordem = ORDENACOES[req.query.ordem] || ORDENACOES.relevancia;
    const porPagina = Math.min(Number(req.query.por_pagina || 50), 200);
    const pagina = Math.max(Number(req.query.pagina || 1), 1);
    const deslocamento = (pagina - 1) * porPagina;

    const [linhas] = await pool.query(
      `SELECT l.id, l.chave_externa, l.orgao_nome, l.unidade, l.uf, l.municipio, l.esfera,
              l.modalidade, l.modo_disputa, l.objeto, l.valor_estimado, l.orcamento_sigiloso,
              l.abertura_propostas, l.fim_propostas, l.situacao, l.plataforma_disputa,
              l.link_portal, l.link_disputa, l.grupo, l.palavra_casada, l.pontuacao,
              l.pode_participar, l.motivo_participacao, l.objeto_social, l.beneficio_me,
              l.etapa, l.favorito, l.criado_em,
              f.nome AS fonte_nome,
              (SELECT COUNT(*) FROM licitacao_itens i WHERE i.licitacao_id = l.id) AS total_itens
         FROM licitacoes l
         JOIN fontes f ON f.id = l.fonte_id
         ${onde}
         ORDER BY ${ordem}
         LIMIT ? OFFSET ?`,
      [...valores, porPagina, deslocamento]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM licitacoes l JOIN fontes f ON f.id = l.fonte_id ${onde}`,
      valores
    );

    res.json({ dados: linhas, total: Number(total), pagina, por_pagina: porPagina });
  } catch (erro) {
    console.error('Erro ao listar licitações:', erro.message);
    res.status(500).json({ erro: 'Não foi possível carregar as licitações.', detalhe: erro.message });
  }
});

// GET /api/licitacoes/filtros — opções para os seletores do Radar
rotas.get('/filtros', async (_req, res) => {
  try {
    const [grupos] = await pool.query(
      'SELECT DISTINCT grupo FROM licitacoes WHERE grupo IS NOT NULL ORDER BY grupo'
    );
    const [ufs] = await pool.query(
      'SELECT uf, COUNT(*) AS total FROM licitacoes WHERE uf IS NOT NULL AND descartada = 0 GROUP BY uf ORDER BY total DESC'
    );
    const [modalidades] = await pool.query(
      'SELECT DISTINCT modalidade FROM licitacoes WHERE modalidade IS NOT NULL ORDER BY modalidade'
    );
    const [fontes] = await pool.query('SELECT id, nome FROM fontes ORDER BY nome');

    res.json({
      grupos: grupos.map((g) => g.grupo),
      ufs: ufs.map((u) => ({ uf: u.uf, total: Number(u.total) })),
      modalidades: modalidades.map((m) => m.modalidade),
      fontes,
      etapas: ETAPAS,
    });
  } catch (erro) {
    res.status(500).json({ erro: 'Não foi possível carregar os filtros.', detalhe: erro.message });
  }
});

// GET /api/licitacoes/:id
rotas.get('/:id', async (req, res) => {
  try {
    const [linhas] = await pool.query(
      `SELECT l.*, f.nome AS fonte_nome, f.adaptador
         FROM licitacoes l JOIN fontes f ON f.id = l.fonte_id
        WHERE l.id = ?`,
      [req.params.id]
    );
    if (!linhas.length) return res.status(404).json({ erro: 'Licitação não encontrada.' });

    const licitacao = linhas[0];
    delete licitacao.bruto; // a resposta crua fica no banco, não na tela

    const [itens] = await pool.query(
      'SELECT * FROM licitacao_itens WHERE licitacao_id = ? ORDER BY numero_item',
      [req.params.id]
    );

    res.json({ ...licitacao, itens });
  } catch (erro) {
    res.status(500).json({ erro: 'Não foi possível abrir a licitação.', detalhe: erro.message });
  }
});

// GET /api/licitacoes/:id/itens
rotas.get('/:id/itens', async (req, res) => {
  try {
    const [itens] = await pool.query(
      'SELECT * FROM licitacao_itens WHERE licitacao_id = ? ORDER BY numero_item',
      [req.params.id]
    );
    res.json({ dados: itens });
  } catch (erro) {
    res.status(500).json({ erro: 'Não foi possível carregar os itens.', detalhe: erro.message });
  }
});

// PATCH /api/licitacoes/:id — etapa do funil, favorito e descarte
rotas.patch('/:id', async (req, res) => {
  const permitidos = { etapa: 'etapa', favorito: 'favorito', descartada: 'descartada', motivo_descarte: 'motivo_descarte' };
  const partes = [];
  const valores = [];

  for (const [campo, coluna] of Object.entries(permitidos)) {
    if (req.body[campo] === undefined) continue;
    if (campo === 'etapa' && !ETAPAS.includes(req.body.etapa)) {
      return res.status(400).json({ erro: `Etapa inválida. Use uma de: ${ETAPAS.join(', ')}.` });
    }
    partes.push(`${coluna} = ?`);
    valores.push(campo === 'favorito' || campo === 'descartada' ? (req.body[campo] ? 1 : 0) : req.body[campo]);
  }

  if (!partes.length) return res.status(400).json({ erro: 'Nada para atualizar.' });

  try {
    const [r] = await pool.query(`UPDATE licitacoes SET ${partes.join(', ')} WHERE id = ?`, [...valores, req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ erro: 'Licitação não encontrada.' });
    res.json({ ok: true });
  } catch (erro) {
    res.status(500).json({ erro: 'Não foi possível salvar a alteração.', detalhe: erro.message });
  }
});

// POST /api/licitacoes/:id/detalhar — busca detalhe e itens no portal (fila)
rotas.post('/:id/detalhar', async (req, res) => {
  try {
    await fila.enfileirar(
      'detalhar_licitacao',
      { licitacaoId: Number(req.params.id) },
      { prioridade: 1, chaveUnica: `detalhar:${req.params.id}` }
    );
    res.status(202).json({ ok: true, mensagem: 'Detalhamento na fila.' });
  } catch (erro) {
    res.status(500).json({ erro: 'Não foi possível enfileirar o detalhamento.', detalhe: erro.message });
  }
});

module.exports = rotas;
module.exports.ETAPAS = ETAPAS;
