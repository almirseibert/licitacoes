// /api/modelos-declaracao — modelos e pré-visualização (seções 18.1 e 18.3).
const express = require('express');
const { responderErro } = require('../middlewares/responder-erro');
const pool = require('../config/db');
const escopo = require('../servicos/escopo');
const declaracao = require('../servicos/declaracao');
const { PORCODIGO } = require('../regras/exigencias');

const rotas = express.Router();

const VARIAVEIS = [
  ['razao_social', 'Razão social da empresa'],
  ['cnpj', 'CNPJ da empresa'],
  ['endereco', 'Endereço da empresa'],
  ['representante', 'Nome do representante legal'],
  ['cpf_representante', 'CPF do representante'],
  ['orgao', 'Órgão que promove a licitação'],
  ['uf_orgao', 'UF do órgão'],
  ['municipio_orgao', 'Município do órgão'],
  ['modalidade', 'Modalidade (pregão, dispensa…)'],
  ['numero_licitacao', 'Número da licitação'],
  ['processo', 'Número do processo administrativo'],
  ['processo_frase', 'Frase do processo, ou nada quando não houver'],
  ['objeto', 'Objeto da licitação'],
  ['cidade_empresa', 'Cidade da empresa, para o fecho'],
  ['data_extenso', 'Data por extenso'],
  ['ano', 'Ano corrente'],
];

async function exemplo(organizacaoId, licitacaoId) {
  const [linhas] = licitacaoId
    ? await pool.query('SELECT * FROM licitacoes WHERE id = ?', [licitacaoId])
    : await pool.query(
        `SELECT * FROM ${escopo.daOrganizacao(organizacaoId)} l WHERE descartada = 0 ORDER BY pontuacao DESC LIMIT 1`
      );
  const [perfis] = await pool.query(
    'SELECT * FROM empresa_perfis WHERE organizacao_id = ? ORDER BY padrao DESC, id ASC LIMIT 1',
    [organizacaoId]
  );
  if (!linhas.length) throw new Error('Nenhuma licitação para usar de exemplo na pré-visualização.');
  if (!perfis.length) throw new Error('Cadastre o perfil da empresa antes.');
  return { licitacao: linhas[0], perfil: perfis[0] };
}

rotas.get('/', async (req, res) => {
  try {
    // Os do sistema (organizacao_id NULL) e as cópias desta organização.
    const [dados] = await pool.query(
      'SELECT * FROM modelos_declaracao WHERE (organizacao_id IS NULL OR organizacao_id = ?) ORDER BY padrao_sistema DESC, titulo ASC',
      [req.organizacaoId]
    );
    res.json({
      dados: dados.map((m) => ({
        ...m,
        rotulo_codigo: (PORCODIGO.get(m.codigo) && PORCODIGO.get(m.codigo).rotulo) || m.codigo,
      })),
      variaveis: VARIAVEIS.map(([nome, descricao]) => ({ nome, descricao })),
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar os modelos.', erro);
  }
});

rotas.post('/', async (req, res) => {
  try {
    const corpo = req.body || {};
    if (!corpo.titulo || !corpo.corpo) return res.status(400).json({ erro: 'Informe título e corpo.' });

    const [r] = await pool.query(
      'INSERT INTO modelos_declaracao (organizacao_id, codigo, titulo, corpo, padrao_sistema, ativo) VALUES (?, ?, ?, ?, 0, 1)',
      [req.organizacaoId, String(corpo.codigo || 'outros').slice(0, 40), String(corpo.titulo).slice(0, 160), String(corpo.corpo)]
    );
    res.status(201).json({ ok: true, id: r.insertId });
  } catch (erro) {
    if (erro.code === 'ER_DUP_ENTRY') return res.status(409).json({ erro: 'Já existe um modelo com esse título e código.' });
    res.status(400).json({ erro: erro.message });
  }
});

// Duplicar é o caminho de edição dos modelos do sistema (seção 18.3).
rotas.post('/:id/duplicar', async (req, res) => {
  try {
    const [[modelo]] = await pool.query('SELECT * FROM modelos_declaracao WHERE id = ? AND (organizacao_id IS NULL OR organizacao_id = ?)', [
      req.params.id,
      req.organizacaoId,
    ]);
    if (!modelo) return res.status(404).json({ erro: 'Modelo não encontrado.' });

    const [r] = await pool.query(
      'INSERT INTO modelos_declaracao (organizacao_id, codigo, titulo, corpo, padrao_sistema, ativo) VALUES (?, ?, ?, ?, 0, 1)',
      [req.organizacaoId, modelo.codigo, `${modelo.titulo} (minha versão)`.slice(0, 160), modelo.corpo]
    );
    res.status(201).json({ ok: true, id: r.insertId, mensagem: 'Cópia criada. O modelo do sistema continua intacto.' });
  } catch (erro) {
    if (erro.code === 'ER_DUP_ENTRY') return res.status(409).json({ erro: 'Você já tem uma cópia deste modelo.' });
    res.status(400).json({ erro: erro.message });
  }
});

rotas.patch('/:id', async (req, res) => {
  try {
    const [[modelo]] = await pool.query(
      'SELECT padrao_sistema FROM modelos_declaracao WHERE id = ? AND (organizacao_id IS NULL OR organizacao_id = ?)',
      [req.params.id, req.organizacaoId]
    );
    if (!modelo) return res.status(404).json({ erro: 'Modelo não encontrado.' });
    if (modelo.padrao_sistema) {
      return res.status(409).json({
        erro: 'Modelo do sistema não é editado direto. Duplique e edite a sua cópia.',
      });
    }

    const campos = {};
    const corpo = req.body || {};
    if ('titulo' in corpo) campos.titulo = String(corpo.titulo).slice(0, 160);
    if ('corpo' in corpo) campos.corpo = String(corpo.corpo);
    if ('codigo' in corpo) campos.codigo = String(corpo.codigo).slice(0, 40);
    if ('ativo' in corpo) campos.ativo = corpo.ativo ? 1 : 0;

    const colunas = Object.keys(campos);
    if (!colunas.length) return res.status(400).json({ erro: 'Nada para alterar.' });

    await pool.query(
      `UPDATE modelos_declaracao SET ${colunas.map((c) => `${c} = ?`).join(', ')} WHERE id = ? AND organizacao_id = ?`,
      [...colunas.map((c) => campos[c]), req.params.id, req.organizacaoId]
    );
    res.json({ ok: true });
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

rotas.delete('/:id', async (req, res) => {
  try {
    const [[modelo]] = await pool.query(
      'SELECT padrao_sistema FROM modelos_declaracao WHERE id = ? AND (organizacao_id IS NULL OR organizacao_id = ?)',
      [req.params.id, req.organizacaoId]
    );
    if (!modelo) return res.status(404).json({ erro: 'Modelo não encontrado.' });
    if (modelo.padrao_sistema) return res.status(409).json({ erro: 'Modelo do sistema não pode ser apagado — desative-o.' });

    await pool.query('DELETE FROM modelos_declaracao WHERE id = ? AND organizacao_id = ?', [
      req.params.id,
      req.organizacaoId,
    ]);
    res.json({ ok: true });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível apagar o modelo.', erro);
  }
});

// POST /previa — texto preenchido com uma licitação de exemplo (seção 18.3).
rotas.post('/previa', async (req, res) => {
  try {
    const corpo = req.body || {};
    const { licitacao, perfil } = await exemplo(req.organizacaoId, corpo.licitacao_id);
    const dados = declaracao.variaveis({ licitacao, perfil });
    const { texto, faltando } = declaracao.preencher(corpo.corpo || '', dados);

    res.json({
      texto,
      faltando,
      exemplo: {
        licitacao_id: licitacao.id,
        orgao: licitacao.orgao_nome,
        modalidade: licitacao.modalidade,
        numero: dados.numero_licitacao,
      },
    });
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

// GET /:id/previa.pdf — a mesma prévia, já em PDF.
rotas.get('/:id/previa.pdf', async (req, res) => {
  try {
    const [[modelo]] = await pool.query('SELECT * FROM modelos_declaracao WHERE id = ? AND (organizacao_id IS NULL OR organizacao_id = ?)', [
      req.params.id,
      req.organizacaoId,
    ]);
    if (!modelo) return res.status(404).json({ erro: 'Modelo não encontrado.' });

    const { licitacao, perfil } = await exemplo(req.organizacaoId, req.query.licitacao_id);
    const dados = declaracao.variaveis({ licitacao, perfil });
    const { texto } = declaracao.preencher(modelo.corpo, dados);
    const bytes = await declaracao.gerarPdf({ titulo: modelo.titulo, texto, dados });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(`${modelo.titulo}.pdf`)}"`);
    res.send(bytes);
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

module.exports = rotas;
module.exports.VARIAVEIS = VARIAVEIS;
