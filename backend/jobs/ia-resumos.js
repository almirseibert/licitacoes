// Job `ia_resumos` (seções 14 e 23.3) — leitura assistida das licitações que
// valem o token.
//
// Contínuo, pela fila. O corte é pontuação ≥ 55 ou favorita: ler edital de
// licitação que não interessa é gastar dinheiro para produzir texto que
// ninguém abre.
const pool = require('../config/db');
const fila = require('../servicos/fila');
const ia = require('../servicos/ia');
const { ia: cfg } = require('../config/ambiente');

/** O texto já extraído dos arquivos da licitação (Fase 4), na ordem do edital. */
async function textoDaLicitacao(licitacaoId) {
  // Só a versão mais recente de cada arquivo, pelo mesmo motivo da Fase 10:
  // edital substituído não pode entrar junto com o que ele substituiu.
  const [linhas] = await pool.query(
    `SELECT a.texto_extraido
       FROM licitacao_arquivos a
       JOIN (SELECT sequencial, MAX(versao) AS versao
               FROM licitacao_arquivos WHERE licitacao_id = ? AND status = 'ok'
              GROUP BY sequencial) u
         ON u.sequencial = a.sequencial AND u.versao = a.versao
      WHERE a.licitacao_id = ? AND a.status = 'ok' AND a.texto_extraido IS NOT NULL
      ORDER BY a.sequencial`,
    [licitacaoId, licitacaoId]
  );
  return linhas.map((l) => l.texto_extraido).join('\n\n');
}

/**
 * Lê uma licitação e guarda a sugestão.
 * A sugestão nunca encosta em pontuação, etapa ou `pode_participar` do painel:
 * vai para `ia_resumo` e aparece na tela com o rótulo da IA (seção 23.4).
 */
async function resumirLicitacao({ licitacaoId, forcar = false }) {
  const [[licitacao]] = await pool.query(
    'SELECT id, objeto, pontuacao, favorito, ia_situacao FROM licitacoes WHERE id = ?',
    [licitacaoId]
  );
  if (!licitacao) throw new Error('Licitação não encontrada.');

  // O que você já confirmou ou recusou não é relido sem pedido explícito: a
  // decisão é sua, e refazer a leitura a apagaria.
  if (licitacao.ia_situacao && licitacao.ia_situacao !== 'sugerido' && !forcar) {
    return { ok: false, motivo: 'Esta leitura já foi revisada por você. Use "ler de novo" para refazer.' };
  }

  const texto = await textoDaLicitacao(licitacaoId);
  const r = await ia.lerEdital({ licitacaoId, texto, forcar });
  if (!r.ok) return r;

  await pool.query(
    "UPDATE licitacoes SET ia_resumo = ?, ia_em = NOW(), ia_situacao = 'sugerido' WHERE id = ?",
    [JSON.stringify(r.dados), licitacaoId]
  );
  return r;
}

/**
 * Enfileira a leitura do que vale a pena e ainda não foi lido.
 * Só mexe em licitação com texto extraído: ir à IA antes da Fase 4 ter lido o
 * PDF seria pagar para o modelo dizer que não recebeu nada.
 */
async function enfileirarResumos({ limite = 10, pontuacaoMinima = cfg.pontuacaoMinima } = {}) {
  if (!ia.disponivel()) return { enfileiradas: 0, desligada: true };

  const [candidatas] = await pool.query(
    // GROUP BY, não DISTINCT: com DISTINCT o MySQL recusa ordenar por coluna
    // fora do SELECT, e a ordem é o que garante que o token vá primeiro para a
    // licitação favorita e de maior pontuação.
    `SELECT l.id
       FROM licitacoes l
       JOIN licitacao_arquivos a ON a.licitacao_id = l.id AND a.status = 'ok' AND a.texto_extraido IS NOT NULL
      WHERE l.ia_resumo IS NULL
        AND l.descartada = 0
        AND (l.pontuacao >= ? OR l.favorito = 1)
        AND (l.fim_propostas IS NULL OR l.fim_propostas >= NOW())
      GROUP BY l.id, l.favorito, l.pontuacao
      ORDER BY l.favorito DESC, l.pontuacao DESC
      LIMIT ?`,
    [pontuacaoMinima, limite]
  );

  for (const l of candidatas) {
    await fila.enfileirar('ia_resumo', { licitacaoId: l.id }, { prioridade: 30, chaveUnica: `ia:${l.id}` });
  }
  return { enfileiradas: candidatas.length };
}

/**
 * Sugestão mensal de palavras-chave (seção 23.5): lê os objetos do que você
 * favoritou ou disputou e propõe termos que ainda não estão cadastrados.
 */
async function sugerirPalavras({ limite = 40, forcar = false } = {}) {
  if (!ia.disponivel()) return { ok: false, desligada: true, motivo: 'Leitura assistida desligada.' };

  const [interessantes] = await pool.query(
    `SELECT objeto FROM licitacoes
      WHERE objeto IS NOT NULL
        AND (favorito = 1 OR etapa IN ('Vou disputar','Proposta enviada','Em disputa','Ganhamos','Perdemos'))
      ORDER BY etapa_em DESC, pontuacao DESC
      LIMIT ?`,
    [limite]
  );
  const [cadastradas] = await pool.query('SELECT termo FROM palavras_chave');

  const r = await ia.sugerirPalavras({
    objetos: interessantes.map((l) => l.objeto),
    jaCadastrados: cadastradas.map((p) => p.termo),
    forcar,
  });
  if (!r.ok) return r;

  // Termo que já existe (ou que já foi recusado) não volta à tela.
  const existentes = new Set(cadastradas.map((p) => String(p.termo).toLowerCase()));
  let gravadas = 0;
  for (const t of r.dados.termos) {
    if (existentes.has(t.termo.toLowerCase())) continue;
    const [res] = await pool.query(
      `INSERT INTO palavras_sugeridas (termo, grupo, porque, exemplos, origem)
       VALUES (?, ?, ?, ?, 'ia')
       ON DUPLICATE KEY UPDATE porque = VALUES(porque), grupo = VALUES(grupo)`,
      [t.termo.slice(0, 160), t.grupo, t.porque, interessantes.length]
    );
    if (res.insertId) gravadas += 1;
  }
  return { ...r, gravadas };
}

function registrarNaFila() {
  fila.registrar('ia_resumo', (payload) => resumirLicitacao(payload || {}));
  fila.registrar('sugerir_palavras', (payload) => sugerirPalavras(payload || {}));
}

module.exports = { resumirLicitacao, enfileirarResumos, sugerirPalavras, textoDaLicitacao, registrarNaFila };
