// Prepara o texto do edital quando o usuário pede um resumo ou uma leitura assistida.
//
// O resumo só falhava com "baixe e leia os arquivos antes" porque quem baixa e lê é o
// worker, e o texto lido fica no banco: com API e worker em volumes diferentes (ou o
// worker parado) nunca chegava texto. Agora, no clique, a própria API baixa o que
// falta, lê os PDFs (pdf-parse/mammoth — sem IA e sem custo) e só então chama o modelo.
//
// Nada daqui roda sozinho: quem chama é uma rota acionada por um clique.
const pool = require('../config/db');
const { arquivosComTexto } = require('./perguntas-edital');
const documento = require('./texto-documento');
const jobBaixar = require('../jobs/baixar');
const jobLer = require('../jobs/ler-edital');

async function caracteresDeTexto(licitacaoId) {
  const arquivos = await arquivosComTexto(licitacaoId);
  return arquivos.reduce((soma, a) => soma + String(a.texto || '').trim().length, 0);
}

/**
 * Garante texto lido para a licitação.
 * @returns {Promise<{ok:boolean, jaTinha?:boolean, motivo?:string}>}
 */
async function garantirTexto(licitacaoId) {
  if ((await caracteresDeTexto(licitacaoId)) >= documento.MINIMO_DE_TEXTO) return { ok: true, jaTinha: true };

  const [[licitacao]] = await pool.query('SELECT arquivos_status FROM licitacoes WHERE id = ?', [licitacaoId]);
  if (!licitacao) return { ok: false, motivo: 'Licitação não encontrada.' };

  try {
    if (['ok', 'parcial'].includes(licitacao.arquivos_status)) {
      const cura = await jobBaixar.curarTodos(licitacaoId);
      if (cura.falhas.length) {
        return { ok: false, motivo: `Os arquivos do edital não estão mais no volume e não foi possível baixá-los de novo: ${cura.falhas[0]}` };
      }
    } else {
      const baixado = await jobBaixar.baixarEdital({ licitacaoId });
      if (baixado && baixado.sem_arquivo) {
        return { ok: false, motivo: 'O portal não publicou arquivos para esta licitação; não há edital para ler.' };
      }
      if (baixado && baixado.parou_em === 'limite') {
        return { ok: false, motivo: baixado.mensagem };
      }
    }
    await jobLer.lerEdital({ licitacaoId });
  } catch (erro) {
    console.error(`Preparar o texto do edital ${licitacaoId}: ${erro.message}`);
    return { ok: false, motivo: `Não foi possível baixar e ler o edital agora: ${erro.message}` };
  }

  if ((await caracteresDeTexto(licitacaoId)) < documento.MINIMO_DE_TEXTO) {
    return { ok: false, motivo: 'O edital foi baixado, mas não tem texto para ler — pode ser um PDF escaneado.' };
  }
  return { ok: true, jaTinha: false };
}

module.exports = { garantirTexto, caracteresDeTexto };
