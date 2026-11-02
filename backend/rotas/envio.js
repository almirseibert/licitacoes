// /api/licitacoes/:id/envio — montar e gerar o pacote (seções 9.3 e 17).
const fs = require('fs');
const express = require('express');
const pool = require('../config/db');
const arquivos = require('../servicos/arquivos');
const upload = require('../servicos/upload');
const envio = require('../servicos/envio');
const pacote = require('../servicos/pacote');
const declaracao = require('../servicos/declaracao');

const rotas = express.Router({ mergeParams: true });

// GET — a seleção pronta (kit × exigências × cofre), sem gravar nada.
rotas.get('/', async (req, res) => {
  try {
    const montagem = await envio.montar({
      licitacaoId: Number(req.params.id),
      kitId: req.query.kit_id || null,
      perfilId: req.query.perfil_id || null,
    });
    res.json(montagem);
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

// POST — gera o ZIP numerado ou o PDF único.
rotas.post('/', async (req, res) => {
  try {
    const corpo = req.body || {};
    const licitacaoId = Number(req.params.id);
    const formato = corpo.formato === 'zip' ? 'zip' : 'pdf';

    const preparado = await envio.gerar({
      licitacaoId,
      kitId: corpo.kit_id || null,
      perfilId: corpo.perfil_id || null,
      formato,
      documentos: Array.isArray(corpo.documentos) ? corpo.documentos : null,
      declaracoes: Array.isArray(corpo.declaracoes) ? corpo.declaracoes : null,
      anexos: Array.isArray(corpo.anexos) ? corpo.anexos : null,
      confirmaVencidos: Boolean(corpo.confirma_vencidos),
      observacao: corpo.observacao || null,
    });

    const { licitacao, perfil, pecas, montagem, vencidosIncluidos, lacunas } = preparado;
    const nome = pacote.nomeDoPacote({ licitacao, perfil, formato });
    const pasta = `pacotes/${licitacaoId}`;

    let gravado;
    let folhas = null;
    let fora = [];

    if (formato === 'pdf') {
      const montado = await pacote.montarPdfUnico({ licitacao, perfil, pecas });
      folhas = montado.folhas;
      fora = montado.fora;
      gravado = await pacote.gravar(pasta, nome, montado.bytes);

      // Peça que não é PDF não entra na mesclagem: vai junto, ao lado.
      for (const peca of fora) {
        const destino = `${String(peca.ordem).padStart(2, '0')}_${arquivos.limpar(peca.rotulo).replace(/\s+/g, '_')}${peca.extensao}`;
        await fs.promises.copyFile(
          peca.caminhoAbsoluto,
          arquivos.caminhoAbsoluto(`${pasta}/${destino}`)
        );
      }
    } else {
      const { ZipArchive } = require('archiver');
      const zip = new ZipArchive({ zlib: { level: 6 } });
      const partes = [];
      zip.on('data', (parte) => partes.push(parte));

      const checklist = await pacote.montarChecklist({
        licitacao, perfil, pecas, faltando: montagem.faltando,
      });
      zip.append(checklist, { name: '00_CHECKLIST.pdf' });

      if (montagem.faltando.length) {
        zip.append(
          montagem.faltando.map((f) => `- ${f.rotulo}: ${f.motivo}`).join('\n'),
          { name: '00_FALTANDO.txt' }
        );
      }

      for (const peca of pecas) {
        const nomeNoZip = `${String(peca.ordem).padStart(2, '0')}_${arquivos.limpar(peca.rotulo).replace(/\s+/g, '_')}${peca.extensao}`;
        zip.file(peca.caminhoAbsoluto, { name: nomeNoZip });
      }

      await zip.finalize();
      gravado = await pacote.gravar(pasta, nome, Buffer.concat(partes));
    }

    const itens = pecas.map((p) => ({
      codigo: p.codigo,
      documento_id: p.documento_id || null,
      nome_no_pacote: `${String(p.ordem).padStart(2, '0')}_${p.rotulo}`,
      validade: p.validade,
    }));

    const observacao = [
      corpo.observacao || null,
      vencidosIncluidos.length ? `Enviado com documento vencido, por confirmação: ${vencidosIncluidos.join(', ')}.` : null,
      fora.length ? `Fora do PDF por não serem PDF: ${fora.map((f) => f.rotulo).join(', ')}.` : null,
      lacunas.length ? `Declarações com lacuna: ${lacunas.map((l) => l.titulo).join(', ')}.` : null,
    ].filter(Boolean).join(' ');

    const [r] = await pool.query(
      `INSERT INTO pacotes
         (licitacao_id, perfil_id, kit_id, formato, arquivo_zip, nome_arquivo, tamanho_bytes, folhas, itens, faltando, observacao)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?)`,
      [
        licitacaoId, perfil.id, montagem.kit.id, formato, gravado.caminho, nome,
        gravado.tamanho, folhas,
        JSON.stringify(itens), JSON.stringify(montagem.faltando), observacao || null,
      ]
    );

    res.status(201).json({
      ok: true,
      id: r.insertId,
      nome_arquivo: nome,
      formato,
      folhas,
      pecas: pecas.length,
      faltando: montagem.faltando,
      fora_do_pdf: fora.map((f) => ({ rotulo: f.rotulo, motivo: f.erro || 'não é PDF' })),
      lacunas,
      mensagem: montagem.faltando.length
        ? `Pacote gerado com ${pecas.length} peças, mas ${montagem.faltando.length} pendência(s) — confira antes de enviar.`
        : `Pacote gerado com ${pecas.length} peças${folhas ? ` em ${folhas} folhas` : ''}.`,
    });
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

// POST /repetir/:pacoteId — mesma seleção, datas revalidadas (seção 17.6).
rotas.post('/repetir/:pacoteId', async (req, res) => {
  try {
    const [[anterior]] = await pool.query('SELECT * FROM pacotes WHERE id = ?', [req.params.pacoteId]);
    if (!anterior) return res.status(404).json({ erro: 'Envio anterior não encontrado.' });

    const itens = typeof anterior.itens === 'string' ? JSON.parse(anterior.itens || '[]') : anterior.itens || [];
    const codigos = [...new Set(itens.map((i) => i.codigo).filter((c) => c && c !== 'anexo'))];

    // A graça está aqui: pegamos a versão ATIVA de cada código, não o documento
    // antigo. O que venceu entra renovado sozinho.
    const [atuais] = codigos.length
      ? await pool.query(
          `SELECT id, codigo FROM empresa_documentos
            WHERE perfil_id = ? AND ativo = 1 AND codigo IN (${codigos.map(() => '?').join(',')})
            ORDER BY versao DESC`,
          [anterior.perfil_id, ...codigos]
        )
      : [[]];

    const porCodigo = new Map();
    for (const documento of atuais) {
      if (!porCodigo.has(documento.codigo)) porCodigo.set(documento.codigo, documento.id);
    }

    const documentos = codigos.map((c) => porCodigo.get(c)).filter(Boolean);
    const semEquivalente = codigos.filter((c) => !porCodigo.has(c));

    res.json({
      kit_id: anterior.kit_id,
      formato: anterior.formato,
      documentos,
      sem_equivalente: semEquivalente,
      mensagem: semEquivalente.length
        ? `Seleção recuperada. ${semEquivalente.length} código(s) não têm mais documento ativo no cofre.`
        : 'Seleção recuperada com as versões atuais do cofre.',
    });
  } catch (erro) {
    res.status(500).json({ erro: 'Não foi possível repetir o envio.', detalhe: erro.message });
  }
});

rotas.get('/pacotes/:pacoteId/arquivo', async (req, res) => {
  try {
    const [[registro]] = await pool.query(
      'SELECT * FROM pacotes WHERE id = ? AND licitacao_id = ?',
      [req.params.pacoteId, req.params.id]
    );
    if (!registro || !registro.arquivo_zip) return res.status(404).json({ erro: 'Pacote não encontrado.' });
    if (!arquivos.dentroDoVolume(registro.arquivo_zip)) {
      return res.status(400).json({ erro: 'Caminho de arquivo inválido.' });
    }

    const absoluto = arquivos.caminhoAbsoluto(registro.arquivo_zip);
    if (!fs.existsSync(absoluto)) {
      return res.status(410).json({ erro: 'O pacote não está mais no volume. Gere de novo.' });
    }

    res.setHeader('Content-Type', registro.formato === 'zip' ? 'application/zip' : 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(registro.nome_arquivo)}"`);
    fs.createReadStream(absoluto).pipe(res);
  } catch (erro) {
    res.status(500).json({ erro: 'Não foi possível entregar o pacote.', detalhe: erro.message });
  }
});

// Camada 3 (seção 17.2): o que é específico desta licitação.
rotas.post('/anexos', (req, res) => {
  upload.um(req, res, async (erroUpload) => {
    if (erroUpload) return res.status(400).json({ erro: upload.tratarErro(erroUpload) });
    try {
      if (!req.file) return res.status(400).json({ erro: 'Anexe o arquivo.' });
      const titulo = String((req.body && req.body.titulo) || req.file.originalname || 'Anexo').slice(0, 160);
      const gravado = upload.gravar(req.file, `anexos/${req.params.id}`);

      const [r] = await pool.query(
        'INSERT INTO licitacao_anexos (licitacao_id, titulo, nome_arquivo, arquivo_path, tamanho_bytes) VALUES (?, ?, ?, ?, ?)',
        [req.params.id, titulo, gravado.nome, gravado.caminho, gravado.tamanho]
      );
      res.status(201).json({ ok: true, id: r.insertId, mensagem: `"${titulo}" anexado a esta licitação.` });
    } catch (erro) {
      res.status(400).json({ erro: erro.message });
    }
  });
});

rotas.delete('/anexos/:anexoId', async (req, res) => {
  try {
    const [r] = await pool.query(
      'DELETE FROM licitacao_anexos WHERE id = ? AND licitacao_id = ?',
      [req.params.anexoId, req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ erro: 'Anexo não encontrado.' });
    res.json({ ok: true });
  } catch (erro) {
    res.status(500).json({ erro: 'Não foi possível remover o anexo.', detalhe: erro.message });
  }
});

module.exports = rotas;
