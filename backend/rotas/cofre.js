// /api/empresa/documentos — o cofre (seções 9.1 e 17.2).
//
// Versão antiga nunca é apagada: subir um documento novo para o mesmo código
// desativa a anterior e incrementa a versão. É o que permite provar depois, se
// o pregoeiro questionar, qual certidão foi enviada em cada disputa.
const fs = require('fs');
const express = require('express');
const { responderErro } = require('../middlewares/responder-erro');
const pool = require('../config/db');
const arquivos = require('../servicos/arquivos');
const upload = require('../servicos/upload');
const limites = require('../servicos/limites');
const { PADROES, sugerirValidade, semaforo, tituloPadrao } = require('../regras/validades');
const { CATALOGO } = require('../regras/exigencias');

const rotas = express.Router();

async function perfilAlvo(organizacaoId, perfilId) {
  const [linhas] = perfilId
    ? await pool.query('SELECT id FROM empresa_perfis WHERE id = ? AND organizacao_id = ?', [perfilId, organizacaoId])
    : await pool.query('SELECT id FROM empresa_perfis WHERE organizacao_id = ? ORDER BY padrao DESC, id ASC LIMIT 1', [
        organizacaoId,
      ]);
  if (!linhas.length) throw new Error('Cadastre o perfil da empresa antes de usar o cofre.');
  return linhas[0].id;
}

function soData(valor) {
  if (!valor) return null;
  const texto = String(valor).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? texto : null;
}

rotas.get('/', async (req, res) => {
  try {
    const perfilId = await perfilAlvo(req.organizacaoId, req.query.perfil_id);
    const historico = req.query.historico === '1';

    const [linhas] = await pool.query(
      `SELECT * FROM empresa_documentos
        WHERE organizacao_id = ? AND perfil_id = ? ${historico ? '' : 'AND ativo = 1'}
        ORDER BY codigo ASC, versao DESC`,
      [req.organizacaoId, perfilId]
    );

    const agora = new Date();
    const dados = linhas.map((d) => ({
      ...d,
      semaforo: semaforo(d.valido_ate, agora),
      tem_arquivo: Boolean(d.arquivo_path),
    }));

    const ativos = dados.filter((d) => d.ativo);
    res.json({
      perfil_id: perfilId,
      dados,
      resumo: {
        total: ativos.length,
        vencidos: ativos.filter((d) => d.semaforo.cor === 'vermelho').length,
        vencendo: ativos.filter((d) => d.semaforo.cor === 'amarelo').length,
      },
      // Para o seletor de "novo documento": catálogo de exigências + validade sugerida.
      codigos: CATALOGO.map((c) => ({
        codigo: c.codigo,
        rotulo: c.rotulo,
        grupo: c.grupo,
        validade_dias: (PADROES[c.codigo] && PADROES[c.codigo].dias) || null,
        renovar: (PADROES[c.codigo] && PADROES[c.codigo].renovar) || null,
      })),
    });
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

// POST /api/empresa/documentos — multipart com o campo `arquivo` (seção 13).
rotas.post('/', (req, res) => {
  upload.um(req, res, async (erroUpload) => {
    if (erroUpload) return res.status(400).json({ erro: upload.tratarErro(erroUpload) });

    try {
      const corpo = req.body || {};
      const codigo = String(corpo.codigo || '').trim();
      if (!codigo) return res.status(400).json({ erro: 'Escolha o tipo de documento.' });
      if (!req.file) return res.status(400).json({ erro: 'Anexe o arquivo do documento.' });
      const estouro = await limites.conferir(req.organizacaoId, 'cofre_gb', { acrescimo: req.file.size });
      if (estouro) return res.status(402).json(estouro);

      const perfilId = await perfilAlvo(req.organizacaoId, corpo.perfil_id);
      const titulo = String(corpo.titulo || tituloPadrao(codigo)).slice(0, 160);
      const emitidoEm = soData(corpo.emitido_em);
      const validoAte = soData(corpo.valido_ate) || sugerirValidade(codigo, emitidoEm);

      // Seção 1b: o arquivo físico também fica separado por organização. Os
      // já guardados antes continuam onde estão — o caminho está no banco.
      const gravado = upload.gravar(req.file, `org/${req.organizacaoId}/empresa/${perfilId}`, `${codigo}_`);

      // A versão anterior sai de cena, mas continua no banco e no volume.
      const [[anterior]] = await pool.query(
        'SELECT MAX(versao) AS versao FROM empresa_documentos WHERE organizacao_id = ? AND perfil_id = ? AND codigo = ?',
        [req.organizacaoId, perfilId, codigo]
      );
      await pool.query(
        'UPDATE empresa_documentos SET ativo = 0 WHERE organizacao_id = ? AND perfil_id = ? AND codigo = ? AND ativo = 1',
        [req.organizacaoId, perfilId, codigo]
      );

      const [r] = await pool.query(
        `INSERT INTO empresa_documentos
           (organizacao_id, perfil_id, codigo, titulo, arquivo_path, nome_arquivo, tamanho_bytes,
            emitido_em, valido_ate, renovavel_em, observacao, versao, ativo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          req.organizacaoId,
          perfilId, codigo, titulo, gravado.caminho, gravado.nome, gravado.tamanho,
          emitidoEm, validoAte,
          corpo.renovavel_em ? String(corpo.renovavel_em).slice(0, 255) : (PADROES[codigo] && PADROES[codigo].renovar) || null,
          corpo.observacao || null,
          Number(anterior.versao || 0) + 1,
        ]
      );

      res.status(201).json({
        ok: true,
        id: r.insertId,
        versao: Number(anterior.versao || 0) + 1,
        mensagem: anterior.versao
          ? `Versão ${Number(anterior.versao) + 1} guardada. A anterior continua no histórico.`
          : 'Documento guardado no cofre.',
      });
    } catch (erro) {
      res.status(400).json({ erro: erro.message });
    }
  });
});

rotas.patch('/:id', async (req, res) => {
  try {
    const campos = {};
    const corpo = req.body || {};
    if ('titulo' in corpo) campos.titulo = String(corpo.titulo).slice(0, 160);
    if ('emitido_em' in corpo) campos.emitido_em = soData(corpo.emitido_em);
    if ('valido_ate' in corpo) campos.valido_ate = soData(corpo.valido_ate);
    if ('renovavel_em' in corpo) campos.renovavel_em = String(corpo.renovavel_em || '').slice(0, 255) || null;
    if ('observacao' in corpo) campos.observacao = corpo.observacao || null;

    const colunas = Object.keys(campos);
    if (!colunas.length) return res.status(400).json({ erro: 'Nada para alterar.' });

    const [r] = await pool.query(
      `UPDATE empresa_documentos SET ${colunas.map((c) => `${c} = ?`).join(', ')} WHERE id = ? AND organizacao_id = ?`,
      [...colunas.map((c) => campos[c]), req.params.id, req.organizacaoId]
    );
    if (!r.affectedRows) return res.status(404).json({ erro: 'Documento não encontrado.' });
    res.json({ ok: true });
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

// Desativar, não apagar: o histórico é o que prova o que foi enviado.
rotas.delete('/:id', async (req, res) => {
  try {
    const [r] = await pool.query('UPDATE empresa_documentos SET ativo = 0 WHERE id = ? AND organizacao_id = ?', [
      req.params.id,
      req.organizacaoId,
    ]);
    if (!r.affectedRows) return res.status(404).json({ erro: 'Documento não encontrado.' });
    res.json({ ok: true, mensagem: 'Documento saiu do cofre, mas continua no histórico.' });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível remover o documento.', erro);
  }
});

rotas.get('/:id/arquivo', async (req, res) => {
  try {
    const [[documento]] = await pool.query('SELECT * FROM empresa_documentos WHERE id = ? AND organizacao_id = ?', [
      req.params.id,
      req.organizacaoId,
    ]);
    if (!documento || !documento.arquivo_path) return res.status(404).json({ erro: 'Documento não encontrado.' });
    if (!arquivos.dentroDoVolume(documento.arquivo_path)) {
      return res.status(400).json({ erro: 'Caminho de arquivo inválido.' });
    }

    const absoluto = arquivos.caminhoAbsoluto(documento.arquivo_path);
    if (!fs.existsSync(absoluto)) {
      return res.status(410).json({ erro: 'O arquivo não está mais no volume. Suba o documento de novo.' });
    }

    const ehPdf = documento.arquivo_path.toLowerCase().endsWith('.pdf');
    res.setHeader('Content-Type', ehPdf ? 'application/pdf' : 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `${ehPdf && req.query.baixar !== '1' ? 'inline' : 'attachment'}; filename="${encodeURIComponent(documento.nome_arquivo || 'documento')}"`
    );
    fs.createReadStream(absoluto).pipe(res);
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível entregar o documento.', erro);
  }
});

module.exports = rotas;
