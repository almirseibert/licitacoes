// Job `checar_sancoes` (seção 14, mensal) — CEIS e CNEP do próprio CNPJ e dos
// concorrentes que mais aparecem.
//
// Por que mensal e por que poucos por rodada: a API do Portal da Transparência
// limita requisições por minuto, e sanção não muda de um dia para o outro. O
// cache de 30 dias da seção 26.3 já segura a consulta sob demanda; isto aqui
// existe para a pergunta que ninguém faz a tempo — "eu estou sancionado?" —, e
// para que a ficha dos concorrentes recorrentes não envelheça calada.
//
// Sem PORTAL_TRANSPARENCIA_CHAVE o job é um no-op barato e diz por quê.
const pool = require('../config/db');
const escopo = require('../servicos/escopo');
const fila = require('../servicos/fila');
const sancoes = require('../servicos/sancoes');

// Quantos concorrentes por rodada. Os mais encontrados primeiro: é com eles que
// a disputa acontece de novo no mês que vem.
const QUANTOS_CONCORRENTES = 10;

async function rodar({ quantos = QUANTOS_CONCORRENTES } = {}) {
  if (!sancoes.disponivel()) {
    return { ligado: false, motivo: 'PORTAL_TRANSPARENCIA_CHAVE não configurada', consultados: 0 };
  }

  const resumo = { ligado: true, consultados: 0, sancionados: [], erros: [] };

  // 1. O próprio CNPJ. É o que importa de verdade: empresa sancionada não
  // participa, e descobrir isso no dia da sessão é tarde.
  // Seção 1b: uma consulta por organização ativa — cada uma tem seu CNPJ.
  for (const organizacaoId of await escopo.organizacoesAtivas(pool)) {
    try {
      const propria = await sancoes.checarPropriaEmpresa(organizacaoId);
      if (escopo.ehOperadora(organizacaoId)) resumo.propria = propria;
      if (propria && propria.ok !== false) resumo.consultados += 1;
      if (propria && propria.sancionado) resumo.sancionados.push(`a empresa da organização ${organizacaoId}`);
    } catch (erro) {
      resumo.erros.push(`organização ${organizacaoId}: ${erro.message}`);
    }
  }

  // 2. Os concorrentes mais frequentes.
  const [linhas] = await pool.query(
    `SELECT cnpj, razao_social
       FROM concorrentes
      WHERE cnpj IS NOT NULL AND cnpj <> ''
      ORDER BY disputas DESC, itens DESC
      LIMIT ?`,
    [quantos]
  );

  for (const concorrente of linhas) {
    try {
      const r = await sancoes.consultar(concorrente.cnpj);
      resumo.consultados += 1;
      if (r && r.sancionado) {
        resumo.sancionados.push(concorrente.razao_social || concorrente.cnpj);
      }
    } catch (erro) {
      resumo.erros.push(`${concorrente.cnpj}: ${erro.message}`);
    }
  }

  return resumo;
}

function registrarNaFila() {
  fila.registrar('checar_sancoes', (payload) => rodar(payload || {}));
}

module.exports = { rodar, registrarNaFila, QUANTOS_CONCORRENTES };
