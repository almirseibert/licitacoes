// Job `limpar_temporarios` (seção 14) — higiene do volume, uma vez por dia.
//
// Duas coisas sujam o disco com o tempo:
//
//   1. `.tmp` órfão. O download grava em `.tmp` e só renomeia depois de
//      conferir tamanho e SHA-256 (seção 7.2). Container reiniciado no meio
//      deixa o `.tmp` para trás. Passadas 24 h ninguém mais vai retomá-lo — o
//      job seguinte baixa de novo do zero — então ele é lixo.
//
//   2. Documentação de licitação descartada. Edital de 40 MB de algo que se
//      decidiu não disputar há meio ano não serve para nada.
//
// **Divergência registrada da seção 14** (CLAUDE.md, regra da spec): a seção
// manda "remover licitações descartadas com mais de 180 dias", e aqui se
// removem os ARQUIVOS, não a ficha. Apagar a linha levaria embora o motivo do
// descarte, e é dele que a tela de diagnóstico (seção 20) vive — o ranking de
// bloqueios compara períodos longos, e uma base que se apaga a cada 180 dias
// nunca responderia "quanto esse bloqueio me custou no ano". Disco é o que
// aperta; a ficha é barata e é o aprendizado. O que foi apagado fica anotado em
// `licitacao_arquivos.status = 'limpo'`, de modo que a tela diz "arquivos
// removidos na limpeza" em vez de deixar o botão de download apontando para o
// vazio.
const fsp = require('fs/promises');
const path = require('path');

const pool = require('../config/db');
const fila = require('../servicos/fila');
const { dirDados } = require('../config/ambiente');

const HORAS_DO_TMP = 24;
const DIAS_DO_DESCARTE = 180;

/** Varre o volume e apaga `.tmp` mais velho que 24 h. */
async function limparTemporarios({ horas = HORAS_DO_TMP } = {}) {
  const corte = Date.now() - horas * 60 * 60 * 1000;
  const resumo = { apagados: 0, bytes: 0, erros: [] };

  async function varrer(pasta) {
    let itens;
    try {
      itens = await fsp.readdir(pasta, { withFileTypes: true });
    } catch (erro) {
      // Volume ainda não montado, ou pasta removida no meio da varredura:
      // não é motivo para derrubar o job.
      if (erro.code !== 'ENOENT') resumo.erros.push(`${pasta}: ${erro.message}`);
      return;
    }

    for (const item of itens) {
      const completo = path.join(pasta, item.name);
      if (item.isDirectory()) {
        await varrer(completo);
        continue;
      }
      if (!item.name.endsWith('.tmp')) continue;
      try {
        const info = await fsp.stat(completo);
        if (info.mtimeMs > corte) continue;
        await fsp.unlink(completo);
        resumo.apagados += 1;
        resumo.bytes += info.size;
      } catch (erro) {
        if (erro.code !== 'ENOENT') resumo.erros.push(`${completo}: ${erro.message}`);
      }
    }
  }

  await varrer(dirDados);
  return resumo;
}

/**
 * Apaga a documentação das licitações descartadas há mais de 180 dias.
 * A ficha e o motivo do descarte ficam — ver a divergência no topo do arquivo.
 */
async function limparDescartadas({ dias = DIAS_DO_DESCARTE, limite = 200 } = {}) {
  const resumo = { licitacoes: 0, arquivos: 0, bytes: 0, erros: [] };

  const [linhas] = await pool.query(
    `SELECT a.id, a.licitacao_id, a.caminho, a.tamanho
       FROM licitacao_arquivos a
       JOIN licitacoes l ON l.id = a.licitacao_id
      WHERE l.etapa = 'Descartada'
        AND l.atualizado_em < DATE_SUB(NOW(), INTERVAL ? DAY)
        AND a.status <> 'limpo'
        AND a.caminho IS NOT NULL
      LIMIT ?`,
    [dias, limite]
  );

  const tocadas = new Set();
  for (const arquivo of linhas) {
    const completo = path.resolve(dirDados, arquivo.caminho);
    // Cinto de segurança: nada fora do volume é apagado, nem se o caminho
    // gravado no banco vier torto.
    const raiz = path.resolve(dirDados);
    if (completo !== raiz && !completo.startsWith(raiz + path.sep)) {
      resumo.erros.push(`${arquivo.caminho}: fora do volume, não apagado`);
      continue;
    }
    try {
      await fsp.unlink(completo);
      resumo.arquivos += 1;
      resumo.bytes += Number(arquivo.tamanho || 0);
    } catch (erro) {
      // Já não estava lá: segue e marca como limpo de todo modo.
      if (erro.code !== 'ENOENT') {
        resumo.erros.push(`${arquivo.caminho}: ${erro.message}`);
        continue;
      }
    }
    await pool.query("UPDATE licitacao_arquivos SET status = 'limpo' WHERE id = ?", [arquivo.id]);
    tocadas.add(arquivo.licitacao_id);
  }

  resumo.licitacoes = tocadas.size;
  return resumo;
}

/** As duas limpezas, na ordem. É o que o worker chama uma vez por dia. */
async function rodar(opcoes = {}) {
  const temporarios = await limparTemporarios(opcoes);
  const descartadas = await limparDescartadas(opcoes);
  return { temporarios, descartadas };
}

function registrarNaFila() {
  fila.registrar('limpar_temporarios', () => rodar());
}

module.exports = { rodar, limparTemporarios, limparDescartadas, registrarNaFila, HORAS_DO_TMP, DIAS_DO_DESCARTE };
