// Job `ler_edital` (seção 8) — extrai o texto dos documentos já baixados e
// monta o checklist de exigências.
//
// Roda depois do download. Nunca vai à internet: trabalha só com o que está no
// volume, então é barato repetir sempre que o edital mudar ou o catálogo crescer.
//
// O que o usuário corrigiu à mão (`confirmado_por_usuario`) nunca é
// sobrescrito: a máquina erra, e quem conferiu no PDF tem a palavra final.
const fs = require('fs');
const path = require('path');

const pool = require('../config/db');
const fila = require('../servicos/fila');
const arquivos = require('../servicos/arquivos');
const documento = require('../servicos/texto-documento');
const { detectar, CATALOGO } = require('../regras/exigencias');

// MEDIUMTEXT aguenta 16 MB, mas guardar o edital inteiro em todas as linhas não
// paga: o que interessa é a busca e o trecho, e 400 mil caracteres cobrem
// qualquer edital que já vimos.
const MAX_TEXTO_GUARDADO = 400000;

async function marcar(licitacaoId, status) {
  await pool.query(
    'UPDATE licitacoes SET exigencias_status = ?, exigencias_em = NOW() WHERE id = ?',
    [status, licitacaoId]
  );
}

/** Arquivos extraídos de um .zip, que não estão em `licitacao_arquivos`. */
function arquivosDoZip(pastaAbsoluta) {
  const achados = [];
  let entradas;
  try {
    entradas = fs.readdirSync(pastaAbsoluta, { withFileTypes: true });
  } catch {
    return achados;
  }

  for (const entrada of entradas) {
    if (!entrada.isDirectory() || !entrada.name.endsWith('_extraido')) continue;
    const dentro = path.join(pastaAbsoluta, entrada.name);
    const pilha = [dentro];

    while (pilha.length) {
      const atual = pilha.pop();
      for (const filho of fs.readdirSync(atual, { withFileTypes: true })) {
        const completo = path.join(atual, filho.name);
        if (filho.isDirectory()) pilha.push(completo);
        else if (['.pdf', '.docx', '.txt'].includes(path.extname(filho.name).toLowerCase())) {
          achados.push(completo);
        }
      }
    }
  }
  return achados;
}

async function lerEdital({ licitacaoId }) {
  const [linhas] = await pool.query('SELECT id, pasta FROM licitacoes WHERE id = ?', [licitacaoId]);
  if (!linhas.length) throw new Error(`Licitação ${licitacaoId} não encontrada.`);
  const licitacao = linhas[0];

  await marcar(licitacaoId, 'lendo');

  const [registros] = await pool.query(
    "SELECT id, nome_arquivo, extensao, caminho FROM licitacao_arquivos WHERE licitacao_id = ? AND status = 'ok' ORDER BY sequencial",
    [licitacaoId]
  );

  const paginas = [];
  const resumo = { arquivos: 0, lidos: 0, escaneados: 0, caracteres: 0, paginas: 0 };

  for (const registro of registros) {
    resumo.arquivos += 1;
    if (!registro.caminho || !arquivos.dentroDoVolume(registro.caminho)) continue;

    const absoluto = arquivos.caminhoAbsoluto(registro.caminho);
    if (!fs.existsSync(absoluto)) continue;

    let lido;
    try {
      lido = await documento.ler(absoluto);
    } catch (erro) {
      // Um PDF corrompido não pode derrubar a leitura dos outros.
      await pool.query('UPDATE licitacao_arquivos SET precisa_leitura_manual = 1 WHERE id = ?', [registro.id]);
      console.warn(`Não foi possível ler ${registro.nome_arquivo}: ${erro.message}`);
      continue;
    }

    if (!lido.suportado) continue;

    resumo.lidos += 1;
    resumo.caracteres += lido.caracteres;
    resumo.paginas += lido.total;
    if (lido.precisaLeituraManual) resumo.escaneados += 1;

    for (const pagina of lido.paginas) {
      paginas.push({ ...pagina, arquivoId: registro.id });
    }

    const inteiro = lido.paginas.map((p) => p.texto).join('\n');
    await pool.query(
      'UPDATE licitacao_arquivos SET texto_extraido = ?, paginas = ?, precisa_leitura_manual = ? WHERE id = ?',
      [inteiro.slice(0, MAX_TEXTO_GUARDADO), lido.total, lido.precisaLeituraManual ? 1 : 0, registro.id]
    );
  }

  // O edital de verdade costuma estar dentro do .zip de anexos.
  if (licitacao.pasta && arquivos.dentroDoVolume(licitacao.pasta)) {
    for (const extra of arquivosDoZip(arquivos.caminhoAbsoluto(licitacao.pasta))) {
      try {
        const lido = await documento.ler(extra);
        if (!lido.suportado) continue;
        resumo.caracteres += lido.caracteres;
        resumo.paginas += lido.total;
        for (const pagina of lido.paginas) paginas.push({ ...pagina, arquivoId: null });
      } catch {
        /* anexo ilegível dentro do zip: ignora e segue */
      }
    }
  }

  if (!paginas.length || resumo.caracteres < documento.MINIMO_DE_TEXTO) {
    await gravarIndefinido(licitacaoId);
    await marcar(licitacaoId, 'sem_texto');
    return { ...resumo, status: 'sem_texto', exigidas: 0 };
  }

  const detectadas = detectar(paginas);
  for (const achado of detectadas) {
    await pool.query(
      `INSERT INTO licitacao_exigencias (licitacao_id, codigo, detectado, trecho, pagina, arquivo_id)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         detectado  = IF(confirmado_por_usuario = 1, detectado, VALUES(detectado)),
         trecho     = IF(confirmado_por_usuario = 1, trecho, VALUES(trecho)),
         pagina     = IF(confirmado_por_usuario = 1, pagina, VALUES(pagina)),
         arquivo_id = IF(confirmado_por_usuario = 1, arquivo_id, VALUES(arquivo_id))`,
      [licitacaoId, achado.codigo, achado.detectado, achado.trecho, achado.pagina, achado.arquivo_id]
    );
  }

  await marcar(licitacaoId, 'ok');
  return {
    ...resumo,
    status: 'ok',
    exigidas: detectadas.filter((d) => d.detectado === 'sim').length,
    dispensadas: detectadas.filter((d) => d.detectado === 'negado').length,
  };
}

/** Sem texto para ler: o checklist existe, mas todo indefinido. */
async function gravarIndefinido(licitacaoId) {
  for (const exigencia of CATALOGO) {
    await pool.query(
      `INSERT INTO licitacao_exigencias (licitacao_id, codigo, detectado)
       VALUES (?, ?, 'indefinido')
       ON DUPLICATE KEY UPDATE detectado = IF(confirmado_por_usuario = 1, detectado, 'indefinido')`,
      [licitacaoId, exigencia.codigo]
    );
  }
}

/** Enfileira a leitura das licitações que já têm documento e ainda não foram lidas. */
async function lerEditais({ limite = 20 } = {}) {
  const [linhas] = await pool.query(
    `SELECT id FROM licitacoes
      WHERE arquivos_status IN ('ok','parcial')
        AND exigencias_status = 'nao_lido'
        AND descartada = 0
      ORDER BY pontuacao DESC
      LIMIT ?`,
    [limite]
  );

  for (const linha of linhas) {
    await fila.enfileirar('ler_edital', { licitacaoId: linha.id }, { prioridade: 40, chaveUnica: `ler:${linha.id}` });
    await marcar(linha.id, 'na_fila');
  }
  return { enfileiradas: linhas.length };
}

function registrarNaFila() {
  fila.registrar('ler_edital', (payload) => lerEdital(payload));
  fila.registrar('ler_editais', (payload) => lerEditais(payload || {}));
}

module.exports = { lerEdital, lerEditais, registrarNaFila, MAX_TEXTO_GUARDADO };
