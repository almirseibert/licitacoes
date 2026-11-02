// Job `verificar_prazos` (seções 10 e 14) — o aviso de 48 h e 2 h.
//
// Só vigia o que você decidiu disputar: licitação parada em Triagem não gera
// alerta nenhum, senão a tela vira ruído e você para de olhar.
const pool = require('../config/db');
const fila = require('../servicos/fila');
const alertas = require('../servicos/alertas');
const email = require('../servicos/email');

// Marcos em horas, na ordem em que são avisados.
const MARCOS = [
  { horas: 48, tipo: 'prazo_48h', rotulo: '48 horas' },
  { horas: 2, tipo: 'prazo_2h', rotulo: '2 horas' },
];

const ETAPAS_VIGIADAS = ['Vou disputar', 'Proposta enviada', 'Em disputa'];

function resumir(texto, tamanho = 90) {
  if (!texto) return 'licitação sem objeto';
  const limpo = String(texto).replace(/\s+/g, ' ').trim();
  return limpo.length > tamanho ? `${limpo.slice(0, tamanho)}…` : limpo;
}

function emHoras(fim, agora) {
  return (new Date(fim).getTime() - agora.getTime()) / 3600000;
}

/**
 * Cria os alertas de prazo das licitações vigiadas.
 * Idempotente pela chave: rodar de novo não repete aviso.
 */
async function verificarPrazos() {
  const agora = new Date();
  const [linhas] = await pool.query(
    `SELECT id, objeto, orgao_nome, fim_propostas, etapa, link_disputa, plataforma_disputa
       FROM licitacoes
      WHERE etapa IN (?, ?, ?)
        AND descartada = 0
        AND fim_propostas IS NOT NULL
        AND fim_propostas > NOW()
        AND fim_propostas <= DATE_ADD(NOW(), INTERVAL 48 HOUR)`,
    ETAPAS_VIGIADAS
  );

  const resumo = { vigiadas: linhas.length, criados: 0, email: null };
  const novos = [];

  for (const licitacao of linhas) {
    const horas = emHoras(licitacao.fim_propostas, agora);
    for (const marco of MARCOS) {
      if (horas > marco.horas) continue;

      const onde = licitacao.plataforma_disputa ? ` · disputa em ${licitacao.plataforma_disputa}` : '';
      const criado = await alertas.criar({
        tipo: marco.tipo,
        chave: `${marco.tipo}:${licitacao.id}`,
        licitacaoId: licitacao.id,
        quando: licitacao.fim_propostas,
        mensagem:
          `Faltam menos de ${marco.rotulo} para o fim das propostas: ` +
          `${resumir(licitacao.objeto)} — ${licitacao.orgao_nome || 'órgão não informado'}${onde}`,
      });
      if (criado) {
        resumo.criados += 1;
        novos.push({ mensagem: `Faltam menos de ${marco.rotulo}: ${resumir(licitacao.objeto, 140)}`, quando: licitacao.fim_propostas });
      }
    }
  }

  // O e-mail sai uma vez, com tudo o que nasceu nesta rodada.
  if (novos.length) resumo.email = await email.enviarAvisos(novos);

  return resumo;
}

/**
 * Chamado quando o card entra em "Vou disputar": se o prazo já está dentro da
 * janela, o aviso sai na hora, sem esperar a próxima rodada do job.
 */
async function alertarAoDecidir(licitacaoId) {
  const [[licitacao]] = await pool.query(
    'SELECT id, objeto, orgao_nome, fim_propostas, plataforma_disputa FROM licitacoes WHERE id = ?',
    [licitacaoId]
  );
  if (!licitacao || !licitacao.fim_propostas) return { criados: 0 };

  const horas = emHoras(licitacao.fim_propostas, new Date());
  if (horas <= 0) return { criados: 0 };

  let criados = 0;
  for (const marco of MARCOS) {
    if (horas > marco.horas) continue;
    const criado = await alertas.criar({
      tipo: marco.tipo,
      chave: `${marco.tipo}:${licitacao.id}`,
      licitacaoId: licitacao.id,
      quando: licitacao.fim_propostas,
      mensagem:
        `Faltam menos de ${marco.rotulo} para o fim das propostas: ` +
        `${resumir(licitacao.objeto)} — ${licitacao.orgao_nome || 'órgão não informado'}`,
    });
    if (criado) criados += 1;
  }

  // Fora da janela não há o que avisar agora: o job pega quando chegar a hora.
  return { criados, horas: Math.round(horas) };
}

/** Licitação nova com pontuação alta merece aviso mesmo sem você abrir o Radar. */
async function avisarPrioridadeAlta({ minimo = 80, limite = 20 } = {}) {
  const [linhas] = await pool.query(
    `SELECT id, objeto, orgao_nome, pontuacao FROM licitacoes
      WHERE pontuacao >= ? AND descartada = 0 AND etapa = 'Triagem'
        AND criado_em >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      ORDER BY pontuacao DESC LIMIT ?`,
    [minimo, limite]
  );

  let criados = 0;
  for (const licitacao of linhas) {
    const criado = await alertas.criar({
      tipo: 'nova_licitacao_alta',
      chave: `nova_alta:${licitacao.id}`,
      licitacaoId: licitacao.id,
      mensagem: `Nova licitação com ${licitacao.pontuacao} pontos: ${resumir(licitacao.objeto)} — ${licitacao.orgao_nome || ''}`,
    });
    if (criado) criados += 1;
  }
  return { criados };
}

function registrarNaFila() {
  fila.registrar('verificar_prazos', () => verificarPrazos());
  fila.registrar('avisar_prioridade_alta', (payload) => avisarPrioridadeAlta(payload || {}));
}

module.exports = { verificarPrazos, alertarAoDecidir, avisarPrioridadeAlta, registrarNaFila, MARCOS };
