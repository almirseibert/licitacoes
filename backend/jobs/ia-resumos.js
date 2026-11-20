// Leitura assistida (seção 23.3), só por clique de quem usa o painel
// (decisão de 20/11/2026): nada aqui entra na fila nem roda no worker. Ler edital
// de licitação que não interessa é gastar dinheiro para produzir texto que
// ninguém abre — por isso a decisão de ler é sempre humana.
const pool = require('../config/db');
const escopo = require('../servicos/escopo');
const ia = require('../servicos/ia');
const { garantirTexto } = require('../servicos/preparar-edital');
const { arquivosComTexto } = require('../servicos/perguntas-edital');

/** O texto já extraído dos arquivos da licitação (Fase 4), na ordem do edital. */
async function textoDaLicitacao(licitacaoId) {
  // A consulta (só a versão mais recente de cada arquivo) é uma só, com o Pergunte ao Edital.
  // \f separa páginas (Seção 5); para o resumo vira quebra de linha, como era —
  // assim o hash do recorte não muda e o cache das leituras antigas continua valendo.
  const arquivos = await arquivosComTexto(licitacaoId);
  return arquivos.map((a) => String(a.texto).replace(/\f/g, '\n')).join('\n\n');
}

/**
 * Lê uma licitação e guarda a sugestão.
 * A sugestão nunca encosta em pontuação, etapa ou `pode_participar` do painel:
 * vai para `ia_resumo` e aparece na tela com o rótulo da IA (seção 23.4).
 */
async function resumirLicitacao({ licitacaoId, forcar = false }) {
  const [[licitacao]] = await pool.query(
    'SELECT id, objeto, ia_situacao FROM licitacoes WHERE id = ?',
    [licitacaoId]
  );
  if (!licitacao) throw new Error('Licitação não encontrada.');

  // Seção 1b: confirmar/recusar a leitura agora é de cada organização
  // (`org_licitacoes.ia_situacao`) e o resumo do edital é um só. Ler de novo
  // não apaga a decisão de ninguém — só troca a sugestão que todos veem.

  let texto = await textoDaLicitacao(licitacaoId);
  if (texto.trim().length < 400) {
    // Sem texto lido: baixa o que falta e lê os PDFs agora (sem IA) — só chega aqui por clique.
    const preparado = await garantirTexto(licitacaoId);
    if (!preparado.ok) return { ok: false, motivo: preparado.motivo };
    texto = await textoDaLicitacao(licitacaoId);
  }
  const r = await ia.lerEdital({ licitacaoId, texto, forcar });
  if (!r.ok) return r;

  await pool.query(
    "UPDATE licitacoes SET ia_resumo = ?, ia_em = NOW(), ia_situacao = 'sugerido' WHERE id = ?",
    [JSON.stringify(r.dados), licitacaoId]
  );
  return r;
}

/**
 * Sugestão de palavras-chave (seção 23.5), só por clique (POST /api/ia/palavras-sugeridas): lê os objetos do que você
 * favoritou ou disputou e propõe termos que ainda não estão cadastrados.
 */
async function sugerirPalavras({ limite = 40, forcar = false, organizacaoId = null } = {}) {
  if (!ia.disponivel()) return { ok: false, desligada: true, motivo: 'Leitura assistida desligada.' };

  // Seção 1b: a sugestão é de cada organização — lê o que ELA favoritou ou
  // disputou e compara com as palavras DELA. Sem organização (worker), roda
  // para cada ativa e devolve a soma.
  if (!organizacaoId) {
    const total = { ok: true, gravadas: 0, organizacoes: 0 };
    for (const id of await escopo.organizacoesAtivas(pool)) {
      const r = await sugerirPalavras({ limite, forcar, organizacaoId: id });
      if (r.ok) {
        total.gravadas += r.gravadas || 0;
        total.organizacoes += 1;
      }
    }
    return total;
  }

  const [interessantes] = await pool.query(
    `SELECT objeto FROM ${escopo.daOrganizacao(organizacaoId)} l
      WHERE objeto IS NOT NULL
        AND (favorito = 1 OR etapa IN ('Vou disputar','Proposta enviada','Em disputa','Ganhamos','Perdemos'))
      ORDER BY etapa_em DESC, pontuacao DESC
      LIMIT ?`,
    [limite]
  );
  if (!interessantes.length) return { ok: true, gravadas: 0, motivo: 'nada favoritado ou disputado ainda' };
  const [cadastradas] = await pool.query('SELECT termo FROM palavras_chave WHERE organizacao_id = ?', [
    organizacaoId,
  ]);

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
      `INSERT INTO palavras_sugeridas (organizacao_id, termo, grupo, porque, exemplos, origem)
       VALUES (?, ?, ?, ?, ?, 'ia')
       ON DUPLICATE KEY UPDATE porque = VALUES(porque), grupo = VALUES(grupo)`,
      [organizacaoId, t.termo.slice(0, 160), t.grupo, t.porque, interessantes.length]
    );
    if (res.insertId) gravadas += 1;
  }
  return { ...r, gravadas };
}

module.exports = { resumirLicitacao, sugerirPalavras, textoDaLicitacao };
