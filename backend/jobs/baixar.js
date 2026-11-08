// Job `baixar_edital` (seção 7.2) — traz os documentos da licitação para o volume.
//
// Regras que valem aqui:
//   - idempotente: arquivo já gravado com tamanho > 0 é pulado; rodar de novo
//     só baixa o que faltou;
//   - baixa para `.tmp`, confere tamanho, calcula SHA-256 e só então renomeia —
//     assim uma queda no meio nunca deixa arquivo truncado passando por bom;
//   - `.zip` é extraído ao lado; `.rar` tenta `tar -xf` e, se não der, registra
//     e segue, sem travar a fila;
//   - licitação sem arquivo no portal vira `sem_arquivo`, com um `_SEM_ARQUIVOS.txt`
//     apontando a plataforma de disputa;
//   - passando de LIMITE_MB_POR_LICITACAO (300 MB por padrão) o job para e
//     pede confirmação na tela.
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const { execFile } = require('child_process');
const { promisify } = require('util');

const pool = require('../config/db');
const fila = require('../servicos/fila');
const adaptadores = require('../adaptadores');
const arquivos = require('../servicos/arquivos');
const { download: cfgDownload } = require('../config/ambiente');
const configuracoes = require('../servicos/configuracoes');

const executar = promisify(execFile);

// Seção 7.2, item 6. Em variável de ambiente porque é limite de disco: o que
// cabe na VPS de hoje não é o que cabe na de amanhã — e a tela de Configurações
// (seção 11.13) pode apertar ou folgar sem deploy.
const LIMITE_MB = cfgDownload.limiteMbPorLicitacao;
const LIMITE_BYTES = LIMITE_MB * 1024 * 1024;

/** O teto em MB que vale agora: a tela manda, o ambiente é o padrão. */
async function limiteMb() {
  return configuracoes.numero('limite_mb_por_licitacao', LIMITE_MB);
}
// A extração ganha folga sobre o download: um ZIP de 300 MB abre em mais que
// isso, e barrar na extração depois de ter baixado tudo seria trabalho perdido.
const LIMITE_EXTRACAO_BYTES = Math.round(LIMITE_BYTES * 1.67);

function recortar(valor, tamanho) {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  return texto ? texto.slice(0, tamanho) : null;
}

async function marcarLicitacao(licitacaoId, status) {
  await pool.query(
    'UPDATE licitacoes SET arquivos_status = ?, arquivos_em = NOW() WHERE id = ?',
    [status, licitacaoId]
  );
}

/** Arquivo já baixado e íntegro? É isso que torna o job idempotente. */
function jaBaixado(registro) {
  if (!registro || registro.status !== 'ok' || !registro.caminho) return false;
  if (registro.caminho.endsWith('.tmp')) return false;
  if (!arquivos.dentroDoVolume(registro.caminho)) return false;
  try {
    const info = fs.statSync(arquivos.caminhoAbsoluto(registro.caminho));
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

async function extrair(absoluto, destino) {
  const extensao = path.extname(absoluto).toLowerCase();

  if (extensao === '.zip') {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(absoluto);
    let total = 0;
    for (const entrada of zip.getEntries()) {
      // Zip bomb e path traversal (`../`) não entram no volume.
      if (entrada.entryName.includes('..')) throw new Error('arquivo com caminho suspeito dentro do zip');
      total += entrada.header.size;
      if (total > LIMITE_EXTRACAO_BYTES) throw new Error('conteúdo extraído grande demais');
    }
    zip.extractAllTo(destino, true);
    return 'zip';
  }

  if (extensao === '.rar') {
    // O tar do Windows 10+ e do Linux abre alguns .rar; quando não abre, não é
    // erro do painel — o arquivo fica lá para ser aberto no 7-Zip.
    await fsp.mkdir(destino, { recursive: true });
    await executar('tar', ['-xf', absoluto, '-C', destino]);
    return 'rar';
  }

  return null;
}

/**
 * Baixa os documentos de uma licitação.
 * @param {object} payload
 *   - licitacaoId
 *   - confirmado: segue mesmo passando do teto em MB (o usuário confirmou na tela)
 */
async function baixarEdital({ licitacaoId, confirmado = false }) {
  const tetoMb = await limiteMb();
  const tetoBytes = tetoMb * 1024 * 1024;
  const [linhas] = await pool.query(
    `SELECT l.*, f.adaptador
       FROM licitacoes l JOIN fontes f ON f.id = l.fonte_id
      WHERE l.id = ?`,
    [licitacaoId]
  );
  if (!linhas.length) throw new Error(`Licitação ${licitacaoId} não encontrada.`);
  const licitacao = linhas[0];
  const adaptador = adaptadores.obter(licitacao.adaptador);

  await marcarLicitacao(licitacaoId, 'baixando');

  // Tudo mora em <volume>/editais/<pasta da licitação> (seção 7.1); os documentos
  // da empresa ficam em <volume>/empresa, separados, a partir da Fase 5.
  const pasta = licitacao.pasta || path.posix.join('editais', arquivos.nomeDaPasta(licitacao));
  const pastaAbsoluta = arquivos.garantirPasta(pasta);
  if (!licitacao.pasta) {
    await pool.query('UPDATE licitacoes SET pasta = ? WHERE id = ?', [recortar(pasta, 255), licitacaoId]);
  }

  // 1. Lista o que existe no portal.
  let lista;
  try {
    lista = await adaptador.listarArquivos({ chaveExterna: licitacao.chave_externa });
  } catch (erro) {
    await marcarLicitacao(licitacaoId, 'parcial');
    throw new Error(`O portal não respondeu a lista de arquivos: ${erro.message}`);
  }

  if (!lista.length) {
    await fsp.writeFile(
      path.join(pastaAbsoluta, '_SEM_ARQUIVOS.txt'),
      [
        'O portal não publicou arquivos para esta licitação.',
        `Objeto: ${licitacao.objeto || ''}`,
        `Edital no portal: ${licitacao.link_portal || '—'}`,
        `Plataforma de disputa: ${licitacao.link_disputa || licitacao.plataforma_disputa || '—'}`,
      ].join('\n'),
      'utf8'
    );
    await pool.query(
      `INSERT INTO licitacao_arquivos (licitacao_id, sequencial, titulo, status)
       VALUES (?, 0, 'sem arquivo no portal', 'sem_arquivo')
       ON DUPLICATE KEY UPDATE status = 'sem_arquivo'`,
      [licitacaoId]
    );
    await marcarLicitacao(licitacaoId, 'sem_arquivo');
    return { pasta, baixados: 0, pulados: 0, total: 0, sem_arquivo: true };
  }

  // 2. Registra tudo como pendente antes de baixar, para a tela mostrar "3 de 7".
  for (const arquivo of lista) {
    await pool.query(
      `INSERT INTO licitacao_arquivos (licitacao_id, sequencial, titulo, url_origem, status)
       VALUES (?, ?, ?, ?, 'pendente')
       ON DUPLICATE KEY UPDATE titulo = VALUES(titulo), url_origem = VALUES(url_origem)`,
      [licitacaoId, arquivo.sequencial, recortar(arquivo.titulo, 255), recortar(arquivo.url, 500)]
    );
  }

  const [registros] = await pool.query(
    'SELECT * FROM licitacao_arquivos WHERE licitacao_id = ? ORDER BY sequencial ASC',
    [licitacaoId]
  );

  const resumo = { pasta, total: registros.length, baixados: 0, pulados: 0, erros: [], bytes: 0 };

  for (const registro of registros) {
    if (jaBaixado(registro)) {
      resumo.pulados += 1;
      resumo.bytes += Number(registro.tamanho_bytes || 0);
      continue;
    }

    try {
      const baixado = await baixarUm({ registro, pastaAbsoluta, pasta, adaptador });
      resumo.baixados += 1;
      resumo.bytes += baixado.tamanho;

      if (!confirmado && resumo.bytes > tetoBytes) {
        await marcarLicitacao(licitacaoId, 'grande_demais');
        return {
          ...resumo,
          parou_em: 'limite',
          mensagem: `Já passou de ${tetoMb} MB nesta licitação. Confirme na tela para continuar baixando o restante.`,
        };
      }
    } catch (erro) {
      resumo.erros.push(`${registro.sequencial}: ${erro.message}`);
      await pool.query('UPDATE licitacao_arquivos SET status = ?, erro = ? WHERE id = ?', [
        'erro',
        recortar(erro.message, 255),
        registro.id,
      ]);
    }
  }

  await marcarLicitacao(licitacaoId, resumo.erros.length ? 'parcial' : 'ok');
  await escreverInfo(pastaAbsoluta, licitacao, licitacaoId);
  return resumo;
}

async function baixarUm({ registro, pastaAbsoluta, pasta, adaptador }) {
  await pool.query('UPDATE licitacao_arquivos SET status = ?, erro = NULL WHERE id = ?', ['baixando', registro.id]);

  const resposta = await adaptador.baixarArquivo({ url: registro.url_origem });
  const extensao = arquivos.extensaoDe(resposta.disposicao, resposta.tipo, registro.titulo);
  const nome = arquivos.nomeDoArquivo(registro.sequencial, registro.titulo, extensao);
  const destino = path.join(pastaAbsoluta, nome);
  const temporario = `${destino}.tmp`;

  const hash = crypto.createHash('sha256');
  let bytes = 0;
  const saida = fs.createWriteStream(temporario);

  await pipeline(resposta.corpo, async function* (origem) {
    for await (const pedaco of origem) {
      hash.update(pedaco);
      bytes += pedaco.length;
      yield pedaco;
    }
  }, saida);

  if (bytes === 0) {
    await fsp.unlink(temporario).catch(() => {});
    throw new Error('o portal devolveu um arquivo vazio');
  }

  await fsp.rename(temporario, destino);

  let extraido = null;
  try {
    const tipo = await extrair(destino, path.join(pastaAbsoluta, `${path.parse(nome).name}_extraido`));
    if (tipo) extraido = `${path.parse(nome).name}_extraido`;
  } catch (erro) {
    // Não é falha do download: o arquivo está lá, só não abriu aqui.
    await pool.query('UPDATE licitacao_arquivos SET erro = ? WHERE id = ?', [
      recortar(`baixado, mas não extraído: ${erro.message} — abra no 7-Zip`, 255),
      registro.id,
    ]);
  }

  await pool.query(
    `UPDATE licitacao_arquivos
        SET nome_arquivo = ?, extensao = ?, tamanho_bytes = ?, caminho = ?, hash_sha256 = ?, status = 'ok'
      WHERE id = ?`,
    [
      recortar(nome, 255),
      recortar(extensao, 10),
      bytes,
      recortar(path.join(pasta, nome).split(path.sep).join('/'), 500),
      hash.digest('hex'),
      registro.id,
    ]
  );

  return { nome, tamanho: bytes, extraido };
}

/** `_info.json` na pasta: de onde veio cada arquivo e com que hash (seção 7.1). */
async function escreverInfo(pastaAbsoluta, licitacao, licitacaoId) {
  const [registros] = await pool.query(
    `SELECT sequencial, titulo, nome_arquivo, tamanho_bytes, hash_sha256, url_origem, status, erro
       FROM licitacao_arquivos WHERE licitacao_id = ? ORDER BY sequencial`,
    [licitacaoId]
  );

  const info = {
    gerado_em: new Date().toISOString(),
    licitacao: {
      id: licitacaoId,
      chave_externa: licitacao.chave_externa,
      orgao: licitacao.orgao_nome,
      municipio: licitacao.municipio,
      uf: licitacao.uf,
      modalidade: licitacao.modalidade,
      objeto: licitacao.objeto,
      fim_propostas: licitacao.fim_propostas,
      link_portal: licitacao.link_portal,
      link_disputa: licitacao.link_disputa,
    },
    arquivos: registros,
  };

  await fsp.writeFile(path.join(pastaAbsoluta, '_info.json'), JSON.stringify(info, null, 2), 'utf8');
}

/**
 * Enfileira o download das licitações que interessam e ainda não têm arquivo.
 * Usado pelo job agendado e pelo aceite da Fase 3.
 */
async function baixarEditais({ limite = 20, pontuacaoMin = 55 } = {}) {
  const [linhas] = await pool.query(
    `SELECT id FROM licitacoes
      WHERE arquivos_status IN ('nao_baixado', 'parcial')
        AND descartada = 0
        AND pontuacao >= ?
        AND (fim_propostas IS NULL OR fim_propostas > NOW())
      ORDER BY pontuacao DESC, fim_propostas ASC
      LIMIT ?`,
    [pontuacaoMin, limite]
  );

  for (const linha of linhas) {
    await fila.enfileirar(
      'baixar_edital',
      { licitacaoId: linha.id },
      { prioridade: 30, chaveUnica: `baixar:${linha.id}` }
    );
    await marcarLicitacao(linha.id, 'na_fila');
  }

  return { enfileiradas: linhas.length };
}

function registrarNaFila() {
  fila.registrar('baixar_edital', (payload) => baixarEdital(payload));
  fila.registrar('baixar_editais', (payload) => baixarEditais(payload || {}));
}

module.exports = { baixarEdital, baixarEditais, registrarNaFila, limiteMb, LIMITE_BYTES };
