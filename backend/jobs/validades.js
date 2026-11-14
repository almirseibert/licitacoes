// Job diário `verificar_validades` (seção 9.2) — alerta o que está vencendo.
//
// Cria alerta em 30, 15 e 3 dias antes do vencimento, e um no dia em que
// vence. Um alerta por documento e por marco: rodar o job de novo no mesmo dia
// não enche a tela de repetição.
const pool = require('../config/db');
const fila = require('../servicos/fila');
const alertas = require('../servicos/alertas');
const { AVISOS_DIAS, semaforo } = require('../regras/validades');
const documentos = require('../regras/documentos');
const portais = require('../regras/portais');
const { diaNoFuso } = require('../regras/gestao');

const rotuloDe = (documento) => `${documento.titulo}${documento.perfil_nome ? ` (${documento.perfil_nome})` : ''}`;

function mensagemDe(documento, dias) {
  const quem = rotuloDe(documento);
  if (dias < 0) return `${quem} está vencida há ${Math.abs(dias)} dias.`;
  if (dias === 0) return `${quem} vence hoje.`;
  return `${quem} vence em ${dias} dias.${documento.renovavel_em ? ` Renove em: ${documento.renovavel_em}` : ''}`;
}

async function verificarValidades() {
  const [documentos] = await pool.query(
    `SELECT d.id, d.organizacao_id, d.titulo, d.valido_ate, d.renovavel_em, p.nome AS perfil_nome
       FROM empresa_documentos d
       JOIN empresa_perfis p ON p.id = d.perfil_id
      WHERE d.ativo = 1 AND d.valido_ate IS NOT NULL`
  );

  const agora = new Date();
  const resumo = { verificados: documentos.length, alertas: 0, vencidos: 0 };

  for (const documento of documentos) {
    const luz = semaforo(documento.valido_ate, agora);
    if (luz.dias === null) continue;

    // Marcos: os três avisos da seção 9.2, o dia do vencimento e o vencido.
    const marco = luz.dias < 0 ? 'vencido' : AVISOS_DIAS.includes(luz.dias) || luz.dias === 0 ? String(luz.dias) : null;
    if (!marco) continue;
    if (luz.dias < 0) resumo.vencidos += 1;

    const tipo = `validade_${marco}`;
    // Um por documento, por marco, por dia.
    const [[existe]] = await pool.query(
      `SELECT id FROM alertas
        WHERE organizacao_id = ? AND tipo = ? AND documento_id = ? AND DATE(criado_em) = CURDATE() LIMIT 1`,
      [documento.organizacao_id, tipo, documento.id]
    );
    if (existe) continue;

    await pool.query(
      'INSERT INTO alertas (organizacao_id, tipo, documento_id, mensagem) VALUES (?, ?, ?, ?)',
      [documento.organizacao_id, tipo, documento.id, mensagemDe(documento, luz.dias).slice(0, 500)]
    );
    resumo.alertas += 1;
  }

  const hoje = diaNoFuso(agora);
  [resumo.revisao, resumo.portais] = await Promise.all([avisarRevisoes(hoje), avisarPortais(hoje)]);
  return resumo;
}

/** Seção 10: documento sem validade formal volta para revisão a cada 90 dias. */
async function avisarRevisoes(hoje) {
  const [linhas] = await pool.query(
    `SELECT d.id, d.organizacao_id, d.titulo, d.revisado_em, d.criado_em, d.valido_ate, p.nome AS perfil_nome
       FROM empresa_documentos d JOIN empresa_perfis p ON p.id = d.perfil_id
      WHERE d.ativo = 1 AND d.valido_ate IS NULL
        AND d.revisado_em <= DATE_SUB(?, INTERVAL ? DAY)`,
    [hoje, documentos.REVISAO_DIAS]
  );
  let criados = 0;
  for (const d of linhas) {
    const r = documentos.revisao(d, hoje);
    if (!r || !r.devida) continue;
    // `chave` única por organização: um aviso por ciclo (a base muda quando alguém confere).
    criados += Number(await alertas.criar({
      organizacaoId: d.organizacao_id,
      tipo: 'validade_revisao',
      nivel: 'atencao',
      documentoId: d.id,
      chave: `revisao:${d.id}:${r.base}`,
      mensagem: `${rotuloDe(d)} não tem validade formal e foi conferido há ${r.dias_desde} dias. Confira se continua atual.`,
    }));
  }
  return { avaliados: linhas.length, alertas: criados };
}

/**
 * Seção 10: cadastro em portal perto de vencer — mesmos marcos dos documentos,
 * mas pelo marco já cruzado (não só no dia exato): portal cadastrado a 20 dias
 * do vencimento, ou worker parado num dia, ainda gera o aviso. A `chave` faz
 * cada marco sair uma vez; o vencido há mais de 7 dias já avisou e sai da consulta.
 */
async function avisarPortais(hoje) {
  const [linhas] = await pool.query(
    `SELECT id, organizacao_id, nome, url, login_vence_em FROM org_portais
      WHERE login_vence_em BETWEEN DATE_SUB(?, INTERVAL 7 DAY) AND DATE_ADD(?, INTERVAL ? DAY)`,
    [hoje, hoje, portais.AVISO_DIAS]
  );
  let criados = 0;
  for (const p of linhas) {
    const s = portais.situacao(p.login_vence_em, hoje);
    const marco = portais.marco(s.dias);
    if (!marco) continue;
    criados += Number(await alertas.criar({
      organizacaoId: p.organizacao_id,
      tipo: 'validade_portal',
      nivel: s.dias <= 3 ? 'vermelho' : 'atencao',
      chave: `portal:${p.id}:${p.login_vence_em}:${marco}`,
      mensagem: `Portal ${p.nome}: ${s.texto}.${p.url ? ` Renove em ${p.url}` : ''}`,
    }));
  }
  return { avaliados: linhas.length, alertas: criados };
}

function registrarNaFila() {
  fila.registrar('verificar_validades', () => verificarValidades());
}

module.exports = { verificarValidades, registrarNaFila };
