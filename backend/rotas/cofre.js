// /api/empresa/documentos — o cofre (seções 9.1 e 17.2).
//
// Versão antiga nunca é apagada: subir um documento novo para o mesmo código
// desativa a anterior e incrementa a versão. É o que permite provar depois, se
// o pregoeiro questionar, qual certidão foi enviada em cada disputa.
const fs = require('fs');
const path = require('path');
const express = require('express');
const { responderErro } = require('../middlewares/responder-erro');
const pool = require('../config/db');
const arquivos = require('../servicos/arquivos');
const upload = require('../servicos/upload');
const limites = require('../servicos/limites');
const { PADROES, sugerirValidade, semaforo, tituloPadrao } = require('../regras/validades');
const { CATALOGO } = require('../regras/exigencias');
const regras = require('../regras/documentos');
const { diaNoFuso } = require('../regras/gestao');
const email = require('../servicos/email');

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
    const hoje = diaNoFuso(agora);
    const todos = linhas.map((d) => ({
      ...d,
      semaforo: semaforo(d.valido_ate, agora),
      grupo: regras.grupoDoCodigo(d.codigo),
      ...regras.situacao(d, agora, hoje),
      revisao: regras.revisao(d, hoje),
      emitir_em: regras.linkDeEmissao(d.renovavel_em),
      tem_arquivo: Boolean(d.arquivo_path),
    }));

    // Os filtros cortam a lista; o resumo conta o cofre inteiro (atual), para
    // os números do topo não mudarem a cada clique.
    const { grupo, situacao } = req.query;
    const dados = todos.filter((d) => (!grupo || d.grupo === grupo) && (!situacao || d.situacao === situacao));
    const ativos = todos.filter((d) => d.ativo);
    const contar = (campo, valor) => ativos.filter((d) => d[campo] === valor).length;
    res.json({
      perfil_id: perfilId,
      dados,
      resumo: {
        total: ativos.length,
        vencidos: ativos.filter((d) => d.semaforo.cor === 'vermelho').length,
        vencendo: ativos.filter((d) => d.semaforo.cor === 'amarelo').length,
        revisar: ativos.filter((d) => d.revisao && d.revisao.devida).length,
        por_situacao: Object.fromEntries(regras.SITUACOES.map((s) => [s, contar('situacao', s)])),
        por_grupo: Object.fromEntries(regras.GRUPOS.map((g) => [g.chave, contar('grupo', g.chave)])),
      },
      grupos: regras.GRUPOS,
      // Para o seletor de "novo documento": catálogo de exigências + validade sugerida.
      codigos: CATALOGO.map((c) => ({
        codigo: c.codigo,
        rotulo: c.rotulo,
        grupo: regras.grupoDoCodigo(c.codigo),
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

// ------------------------------------------------------------ lote (Seção 10)
const LOTE_MAX = 50;
// 15 MB de arquivo viram ~20 MB no e-mail (base64 soma um terço): cabe no
// limite de 25 MB dos provedores grandes, com folga para o corpo.
const LOTE_EMAIL_BYTES = 15 * 1024 * 1024;
// Teto de envios por organização por hora: o SMTP é do painel (boletim, convite)
// e não pode virar relé de quem tiver um token.
const LOTE_EMAIL_POR_HORA = 20;
const enviosRecentes = new Map(); // organizacao_id → instantes dos envios da última hora

function dentroDoTeto(organizacaoId, agora = Date.now()) {
  const ultimos = (enviosRecentes.get(organizacaoId) || []).filter((t) => agora - t < 3600000);
  enviosRecentes.set(organizacaoId, ultimos);
  return ultimos.length < LOTE_EMAIL_POR_HORA;
}
const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/** Os documentos pedidos, só da organização, com arquivo no volume. */
async function documentosDoLote(organizacaoId, ids) {
  const lista = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!lista.length) return { erro: 'Escolha ao menos um documento.' };
  if (lista.length > LOTE_MAX) return { erro: `No máximo ${LOTE_MAX} documentos por vez.` };
  const [linhas] = await pool.query(
    `SELECT id, codigo, titulo, arquivo_path, nome_arquivo, tamanho_bytes FROM empresa_documentos
      WHERE organizacao_id = ? AND id IN (?) AND arquivo_path IS NOT NULL ORDER BY codigo, versao DESC`,
    [organizacaoId, lista]
  );
  const pecas = linhas
    .filter((d) => arquivos.dentroDoVolume(d.arquivo_path) && fs.existsSync(arquivos.caminhoAbsoluto(d.arquivo_path)))
    .map((d, i) => ({
      ...d,
      absoluto: arquivos.caminhoAbsoluto(d.arquivo_path),
      nome: arquivos.nomeDoArquivo(i + 1, d.titulo, path.extname(d.nome_arquivo || d.arquivo_path).toLowerCase()),
    }));
  if (!pecas.length) return { erro: 'Nenhum dos documentos escolhidos tem arquivo no cofre.', status: 404 };
  return { pecas, fora: lista.length - pecas.length };
}

// GET /api/empresa/documentos/lote/baixar?ids=1,2,3 — um ZIP com os escolhidos.
// GET de propósito: é leitura, e quem só lê a organização também baixa.
rotas.get('/lote/baixar', async (req, res) => {
  try {
    const lote = await documentosDoLote(req.organizacaoId, String(req.query.ids || '').split(','));
    if (lote.erro) return res.status(lote.status || 400).json({ erro: lote.erro });

    const { ZipArchive } = require('archiver');
    const zip = new ZipArchive({ zlib: { level: 6 } });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="documentos_${diaNoFuso()}.zip"`);
    zip.on('error', (erro) => {
      console.error('Falha ao montar o ZIP do cofre:', erro.message);
      res.destroy(erro);
    });
    zip.pipe(res);
    for (const p of lote.pecas) zip.file(p.absoluto, { name: p.nome });
    await zip.finalize();
  } catch (erro) {
    if (!res.headersSent) responderErro(res, 500, 'Não foi possível montar o arquivo com os documentos.', erro);
  }
});

// POST /api/empresa/documentos/lote/email { ids, para, mensagem } — anexos num e-mail só.
rotas.post('/lote/email', async (req, res) => {
  try {
    const corpo = req.body || {};
    const para = [...new Set(String(corpo.para || '').split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
    if (!para.length) return res.status(400).json({ erro: 'Informe para quem enviar.' });
    if (para.length > 5) return res.status(400).json({ erro: 'No máximo 5 destinatários por envio.' });
    if (para.some((e) => !EMAIL.test(e) || e.length > 190)) return res.status(400).json({ erro: 'Há um e-mail inválido.' });
    if (!dentroDoTeto(req.organizacaoId)) {
      return res.status(429).json({ erro: `Limite de ${LOTE_EMAIL_POR_HORA} envios por hora atingido. Tente mais tarde ou baixe o ZIP.` });
    }
    if (!email.servicoLigado()) {
      return res.status(503).json({ erro: 'O envio de e-mail não está configurado neste servidor. Baixe o ZIP e anexe à mão.' });
    }

    const lote = await documentosDoLote(req.organizacaoId, corpo.ids);
    if (lote.erro) return res.status(lote.status || 400).json({ erro: lote.erro });
    const bytes = lote.pecas.reduce((s, p) => s + Number(p.tamanho_bytes || fs.statSync(p.absoluto).size), 0);
    if (bytes > LOTE_EMAIL_BYTES) {
      return res.status(413).json({ erro: 'Os anexos passam de 15 MB. Mande em duas partes ou baixe o ZIP.' });
    }

    const mensagem = String(corpo.mensagem || '').trim().slice(0, 2000);
    const r = await email.enviarTransacional({
      para: para.join(', '),
      responderPara: req.usuario.email,
      assunto: String(corpo.assunto || 'Documentos da empresa').trim().slice(0, 150) || 'Documentos da empresa',
      texto: [
        mensagem || 'Seguem em anexo os documentos solicitados.',
        '',
        ...lote.pecas.map((p) => `• ${p.titulo}`),
        '',
        '—',
        'Enviado pelo Painel de Licitações.',
      ].join('\n'),
      anexos: lote.pecas.map((p) => ({ filename: p.nome, path: p.absoluto })),
    });
    enviosRecentes.get(req.organizacaoId).push(Date.now());
    if (!r.enviado) return responderErro(res, 502, 'O servidor de e-mail não aceitou o envio. Tente de novo.', new Error(r.motivo));
    res.json({
      ok: true,
      mensagem: `${lote.pecas.length} documento(s) enviado(s) para ${para.join(', ')}.${lote.fora ? ` ${lote.fora} ficaram de fora por não ter arquivo.` : ''}`,
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível enviar os documentos.', erro);
  }
});

// POST /api/empresa/documentos/:id/revisado — "conferi, continua valendo" (revisão de 90 dias).
rotas.post('/:id/revisado', async (req, res) => {
  try {
    const [r] = await pool.query(
      'UPDATE empresa_documentos SET revisado_em = ? WHERE id = ? AND organizacao_id = ? AND ativo = 1',
      [diaNoFuso(), req.params.id, req.organizacaoId]
    );
    if (!r.affectedRows) return res.status(404).json({ erro: 'Documento não encontrado.' });
    res.json({ ok: true, mensagem: `Conferido. A próxima revisão é em ${regras.REVISAO_DIAS} dias.` });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível marcar a revisão.', erro);
  }
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
