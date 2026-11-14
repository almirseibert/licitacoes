// Exportação e exclusão de dados da organização (LGPD — Seção 17).
// As decisões (quem pede, o que confirma, carência, o que nunca sai) estão em
// regras/lgpd.js. Aqui: o banco e o volume de arquivos.
const fs = require('fs');
const pool = require('../config/db');
const arquivos = require('./arquivos');
const regras = require('../regras/lgpd');
const escopo = require('./escopo');

// Onde uma linha da organização aponta para um arquivo no volume (DIR_DADOS).
// `de` é a consulta que devolve os caminhos relativos da organização `?`.
const ARQUIVOS_DA_ORGANIZACAO = [
  'SELECT arquivo_path AS c FROM empresa_documentos WHERE organizacao_id = ?',
  'SELECT arquivo_path AS c FROM licitacao_anexos WHERE organizacao_id = ?',
  'SELECT arquivo_zip AS c FROM pacotes WHERE organizacao_id = ?',
  'SELECT arquivo_pdf AS c FROM propostas WHERE organizacao_id = ?',
  'SELECT arquivo_xlsx AS c FROM propostas WHERE organizacao_id = ?',
  'SELECT arquivo_resposta AS c FROM questionamentos WHERE organizacao_id = ?',
  'SELECT arquivo_contrato AS c FROM contratos WHERE organizacao_id = ?',
  `SELECT m.arquivo AS c FROM contrato_marcos m
     JOIN contratos k ON k.id = m.contrato_id WHERE k.organizacao_id = ?`,
];

/** Toda tabela do banco que tem `organizacao_id` (descoberta no schema, para não esquecer nenhuma nova). */
async function tabelasDaOrganizacao() {
  const [linhas] = await pool.query(
    `SELECT DISTINCT table_name AS t FROM information_schema.columns
      WHERE table_schema = DATABASE() AND column_name = 'organizacao_id' ORDER BY table_name`
  );
  return linhas.map((l) => l.t);
}

async function exportar(organizacaoId) {
  const [[org]] = await pool.query(
    'SELECT id, nome, cnpj, status, teste_ate, criado_em FROM organizacoes WHERE id = ?',
    [organizacaoId]
  );
  const [membros] = await pool.query(
    `SELECT u.nome, u.email, m.papel, m.criado_em AS entrou_em
       FROM organizacao_membros m JOIN usuarios u ON u.id = m.usuario_id WHERE m.organizacao_id = ?`,
    [organizacaoId]
  );

  const tabelas = {};
  const truncadas = [];
  const omitidas = new Set();
  for (const nome of await tabelasDaOrganizacao()) {
    if (regras.TABELAS_FORA_DA_EXPORTACAO.has(nome) || nome === 'organizacao_membros') continue;
    const [linhas] = await pool.query(`SELECT * FROM \`${nome}\` WHERE organizacao_id = ? LIMIT ?`, [
      organizacaoId, regras.LINHAS_POR_TABELA + 1,
    ]);
    if (linhas.length > regras.LINHAS_POR_TABELA) {
      linhas.pop();
      truncadas.push(nome);
    }
    if (linhas.length) tabelas[nome] = linhas.map((l) => regras.semSegredos(l, omitidas));
  }

  return {
    gerado_em: new Date().toISOString(),
    organizacao: org,
    equipe: membros,
    tabelas,
    avisos: [
      'Os arquivos do cofre (certidões, anexos, propostas em PDF) não vão neste JSON: baixe-os pelo painel ou peça ao suporte.',
      'Credenciais (senhas, tokens de API, segredos de webhook) nunca saem na exportação.',
      ...(omitidas.size ? [`Colunas omitidas por parecerem credenciais: ${[...omitidas].sort().join(', ')}.`] : []),
      ...(truncadas.length ? [`Tabelas cortadas em ${regras.LINHAS_POR_TABELA} linhas: ${truncadas.join(', ')}.`] : []),
    ],
  };
}

async function situacaoDaExclusao(organizacaoId) {
  const [[org]] = await pool.query(
    `SELECT o.nome, o.exclusao_agendada_em, o.exclusao_pedida_por, u.nome AS pedida_por_nome, a.provedor
       FROM organizacoes o
       LEFT JOIN usuarios u ON u.id = o.exclusao_pedida_por
       LEFT JOIN assinaturas a ON a.organizacao_id = o.id
      WHERE o.id = ?`,
    [organizacaoId]
  );
  return org || null;
}

/**
 * Existe cobrança recorrente num gateway? É o provedor da assinatura, não o status
 * da organização: uma conta suspensa por atraso continua com a cobrança viva no gateway.
 */
async function temCobrancaRecorrente(organizacaoId) {
  const [[linha]] = await pool.query('SELECT provedor FROM assinaturas WHERE organizacao_id = ?', [organizacaoId]);
  return Boolean(linha && linha.provedor && linha.provedor !== 'manual');
}

async function agendar(organizacaoId, usuarioId, agora = new Date()) {
  const quando = regras.dataDaExclusao(agora);
  await pool.query(
    'UPDATE organizacoes SET exclusao_agendada_em = ?, exclusao_pedida_por = ? WHERE id = ?',
    [quando, usuarioId, organizacaoId]
  );
  return quando;
}

async function cancelar(organizacaoId) {
  const [r] = await pool.query(
    'UPDATE organizacoes SET exclusao_agendada_em = NULL, exclusao_pedida_por = NULL WHERE id = ? AND exclusao_agendada_em IS NOT NULL',
    [organizacaoId]
  );
  return r.affectedRows > 0;
}

/**
 * Apaga a organização, as pessoas que só existiam nela e os arquivos do volume.
 * Só executa com o pedido vencido (`vencida`), salvo `forcar` (teste manual). A
 * organização operadora nunca. O banco primeiro, os arquivos depois: se o apagar
 * de arquivo falhar, a organização já não existe e o resto fica no relatório —
 * o contrário deixaria uma conta viva sem os documentos.
 */
async function excluir(organizacaoId, { agora = new Date(), forcar = false } = {}) {
  if (escopo.ehOperadora(organizacaoId)) throw new Error('A organização da operadora não é excluída.');
  const [[org]] = await pool.query('SELECT id, nome, exclusao_agendada_em FROM organizacoes WHERE id = ?', [organizacaoId]);
  if (!org) throw new Error('Organização não encontrada.');
  if (!forcar && !regras.vencida(org.exclusao_agendada_em, agora)) throw new Error('O prazo de carência ainda não venceu.');

  const caminhos = new Set();
  for (const sql of ARQUIVOS_DA_ORGANIZACAO) {
    const [linhas] = await pool.query(sql, [organizacaoId]);
    for (const l of linhas) if (l.c) caminhos.add(l.c);
  }
  // Pessoa que também está em outra organização fica: a conta é dela, não desta organização.
  const [sozinhas] = await pool.query(
    `SELECT m.usuario_id AS id FROM organizacao_membros m
      WHERE m.organizacao_id = ?
        AND NOT EXISTS (SELECT 1 FROM organizacao_membros o WHERE o.usuario_id = m.usuario_id AND o.organizacao_id <> m.organizacao_id)`,
    [organizacaoId]
  );
  // Só para o comprovante. A exclusão é rara e roda no worker, então um COUNT por tabela é aceitável.
  let linhasApagadas = 0;
  for (const t of await tabelasDaOrganizacao()) {
    const [[{ n }]] = await pool.query(`SELECT COUNT(*) AS n FROM \`${t}\` WHERE organizacao_id = ?`, [organizacaoId]);
    linhasApagadas += Number(n);
  }

  const conexao = await pool.getConnection();
  try {
    await conexao.beginTransaction();
    await conexao.query('DELETE FROM organizacoes WHERE id = ?', [organizacaoId]);
    if (sozinhas.length) await conexao.query('DELETE FROM usuarios WHERE id IN (?)', [sozinhas.map((s) => s.id)]);
    await conexao.commit();
  } catch (erro) {
    await conexao.rollback().catch(() => {});
    throw erro;
  } finally {
    conexao.release();
  }

  let removidos = 0;
  const falhas = [];
  for (const bruto of caminhos) {
    const relativo = regras.arquivoDaOrganizacao(bruto, organizacaoId);
    if (!relativo || !arquivos.dentroDoVolume(relativo)) {
      falhas.push(`${bruto}: fora da pasta da organização, não apagado`);
      continue;
    }
    try {
      await fs.promises.unlink(arquivos.caminhoAbsoluto(relativo));
      removidos += 1;
    } catch (erro) {
      if (erro.code !== 'ENOENT') falhas.push(`${relativo}: ${erro.message}`);
    }
  }

  // O cofre grava em `org/<id>/…`: a pasta inteira sai, inclusive o que o banco não lista mais.
  try {
    await fs.promises.rm(arquivos.caminhoAbsoluto('org', String(Number(organizacaoId))), { recursive: true, force: true });
  } catch (erro) {
    falhas.push(`pasta org/${organizacaoId}: ${erro.message}`);
  }

  await pool.query(
    `INSERT INTO lgpd_exclusoes (organizacao_id, organizacao_nome, pedida_em, usuarios_removidos, arquivos_removidos, linhas_removidas)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [organizacaoId, org.nome, org.exclusao_agendada_em ? new Date(new Date(org.exclusao_agendada_em).getTime() - regras.DIAS_DE_CARENCIA * 86400000) : null,
      sozinhas.length, removidos, linhasApagadas]
  );
  return { organizacao: org.nome, usuarios: sozinhas.length, arquivos: removidos, linhas: linhasApagadas, falhas };
}

/** Rodada do worker: executa os pedidos cujo prazo venceu. */
async function excluirVencidas({ agora = new Date() } = {}) {
  const [orgs] = await pool.query(
    'SELECT id FROM organizacoes WHERE exclusao_agendada_em IS NOT NULL AND exclusao_agendada_em <= ? AND id <> ?',
    [agora, escopo.ORGANIZACAO_OPERADORA]
  );
  const resultado = { excluidas: [], erros: [] };
  for (const { id } of orgs) {
    try {
      resultado.excluidas.push({ id, ...(await excluir(id, { agora })) });
    } catch (erro) {
      resultado.erros.push(`organização ${id}: ${erro.sqlMessage || erro.message}`);
    }
  }
  return resultado;
}

module.exports = {
  exportar, situacaoDaExclusao, temCobrancaRecorrente, agendar, cancelar, excluir, excluirVencidas, tabelasDaOrganizacao,
};
