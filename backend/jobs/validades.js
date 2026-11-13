// Job diário `verificar_validades` (seção 9.2) — alerta o que está vencendo.
//
// Cria alerta em 30, 15 e 3 dias antes do vencimento, e um no dia em que
// vence. Um alerta por documento e por marco: rodar o job de novo no mesmo dia
// não enche a tela de repetição.
const pool = require('../config/db');
const fila = require('../servicos/fila');
const { AVISOS_DIAS, semaforo } = require('../regras/validades');

function mensagemDe(documento, dias) {
  const quem = `${documento.titulo}${documento.perfil_nome ? ` (${documento.perfil_nome})` : ''}`;
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

  return resumo;
}

function registrarNaFila() {
  fila.registrar('verificar_validades', () => verificarValidades());
}

module.exports = { verificarValidades, registrarNaFila };
