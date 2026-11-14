// Assistente de primeiro acesso, termos e NPS (Seção 17). A validação e as contas
// estão em regras/onboarding.js; aqui ficam o banco e a ordem das coisas.
const pool = require('../config/db');
const fila = require('./fila');
const limites = require('./limites');
const boletim = require('../jobs/boletim');
const regrasBoletim = require('../regras/boletim');
const regras = require('../regras/onboarding');
const { VERSAO_TERMOS } = require('../config/dados/legal');

// A primeira janela é larga de propósito: quem acabou de chegar não tem "o que é
// novo desde ontem", e um boletim vazio no primeiro minuto é o pior começo.
const DIAS_PRIMEIRO_BOLETIM = 15;
const GRUPO_ASSISTENTE = 'Geral';
const NOME_DO_FILTRO = 'Filtro principal';

async function termosDoUsuario(usuarioId) {
  const [[linha]] = await pool.query(
    'SELECT versao, aceito_em FROM termos_aceites WHERE usuario_id = ? AND versao = ?',
    [usuarioId, VERSAO_TERMOS]
  );
  return { versao_vigente: VERSAO_TERMOS, aceita: Boolean(linha), aceito_em: linha ? linha.aceito_em : null };
}

async function aceitarTermos({ usuarioId, organizacaoId, ip }, conexao = pool) {
  await conexao.query(
    'INSERT IGNORE INTO termos_aceites (usuario_id, organizacao_id, versao, ip) VALUES (?, ?, ?, ?)',
    [usuarioId, organizacaoId || null, VERSAO_TERMOS, ip ? String(ip).slice(0, 45) : null]
  );
}

async function npsDoUsuario(organizacaoId, usuarioId, agora = new Date()) {
  const [[[membro]], [[ultima]]] = await Promise.all([
    pool.query('SELECT criado_em FROM organizacao_membros WHERE organizacao_id = ? AND usuario_id = ?', [organizacaoId, usuarioId]),
    pool.query('SELECT nota, criada_em FROM nps_respostas WHERE usuario_id = ? ORDER BY criada_em DESC, id DESC LIMIT 1', [usuarioId]),
  ]);
  if (!membro) return { devido: false };
  return { devido: regras.npsDevido({ membroDesde: membro.criado_em, ultima: ultima || null, agora }) };
}

async function registrarNps({ organizacaoId, usuarioId, nota, comentario }) {
  await pool.query('INSERT INTO nps_respostas (organizacao_id, usuario_id, nota, comentario) VALUES (?, ?, ?, ?)', [
    organizacaoId, usuarioId, nota, comentario,
  ]);
}

/** O que a tela do assistente precisa saber, tudo da organização do token. */
async function estado({ organizacaoId, usuarioId, agora = new Date() }) {
  const [[[org]], [[perfil]], [[contagens]], [[ultimoBoletim]], termos, nps] = await Promise.all([
    pool.query('SELECT nome, onboarding_concluido_em FROM organizacoes WHERE id = ?', [organizacaoId]),
    pool.query(
      'SELECT razao_social, cnpj, cnaes FROM empresa_perfis WHERE organizacao_id = ? ORDER BY padrao DESC, id ASC LIMIT 1',
      [organizacaoId]
    ),
    pool.query(
      `SELECT (SELECT COUNT(*) FROM palavras_chave WHERE organizacao_id = ? AND ativa = 1) AS palavras,
              (SELECT COUNT(*) FROM perfis_busca WHERE organizacao_id = ? AND origem = 'boletim' AND ativo = 1) AS filtros`,
      [organizacaoId, organizacaoId]
    ),
    pool.query(
      'SELECT id, data, total_itens, email_status, criado_em FROM boletins WHERE organizacao_id = ? ORDER BY id DESC LIMIT 1',
      [organizacaoId]
    ),
    termosDoUsuario(usuarioId),
    npsDoUsuario(organizacaoId, usuarioId, agora),
  ]);
  if (!org) return null;
  const { palavras, filtros } = contagens;
  const cnaes = perfil && perfil.cnaes ? limites.lerJson(perfil.cnaes, []) : [];

  const lista = regras.passos({
    empresa: perfil && (perfil.razao_social || perfil.cnpj),
    cnaes: cnaes.length,
    palavras,
    filtro: filtros,
    boletim: Boolean(ultimoBoletim),
  });

  return {
    organizacao: org.nome,
    concluido: Boolean(org.onboarding_concluido_em),
    concluido_em: org.onboarding_concluido_em,
    passos: lista,
    empresa: { razao_social: perfil ? perfil.razao_social : null, cnpj: perfil ? perfil.cnpj : null, cnaes },
    palavras_ativas: Number(palavras),
    ultimo_boletim: ultimoBoletim || null,
    termos,
    nps,
  };
}

/**
 * Grava o que o assistente coletou. Tudo numa transação: ou a empresa fica com
 * palavras e filtro, ou nada muda. Reentrante — rodar de novo atualiza o mesmo
 * perfil e o mesmo "Filtro principal", sem duplicar.
 * @returns {Promise<{ ok: true, palavras_novas: number } | { limite: object }>}
 */
async function concluir({ organizacaoId, dados }) {
  const conexao = await pool.getConnection();
  try {
    await conexao.beginTransaction();

    // Palavra que a organização já tem não conta de novo para o limite do plano.
    const [existentes] = await conexao.query('SELECT termo FROM palavras_chave WHERE organizacao_id = ?', [organizacaoId]);
    const jaTem = new Set(existentes.map((e) => String(e.termo).toLowerCase()));
    const novas = dados.palavras.filter((p) => !jaTem.has(p.toLowerCase()));
    if (novas.length) {
      const estouro = await limites.conferir(organizacaoId, 'palavras_chave', { acrescimo: novas.length });
      if (estouro) {
        await conexao.rollback();
        return { limite: estouro };
      }
      await conexao.query('INSERT IGNORE INTO palavras_chave (organizacao_id, termo, grupo) VALUES ?', [
        novas.map((termo) => [organizacaoId, termo, GRUPO_ASSISTENTE]),
      ]);
    }
    if (dados.exclusoes.length) {
      await conexao.query('INSERT IGNORE INTO palavras_excluidas (organizacao_id, termo) VALUES ?', [
        dados.exclusoes.map((termo) => [organizacaoId, termo]),
      ]);
    }

    // Empresa: atualiza o perfil padrão se já houver, senão cria. O que o assistente
    // não recebeu não apaga o que a pessoa já tinha preenchido.
    const { empresa } = dados;
    const [[perfil]] = await conexao.query(
      'SELECT id FROM empresa_perfis WHERE organizacao_id = ? ORDER BY padrao DESC, id ASC LIMIT 1',
      [organizacaoId]
    );
    const cnaesJson = empresa.cnaes.length ? JSON.stringify(empresa.cnaes) : null;
    if (perfil) {
      await conexao.query(
        `UPDATE empresa_perfis
            SET razao_social = COALESCE(?, razao_social), cnpj = COALESCE(?, cnpj), cnaes = COALESCE(?, cnaes)
          WHERE id = ? AND organizacao_id = ?`,
        [empresa.razao_social, empresa.cnpj, cnaesJson, perfil.id, organizacaoId]
      );
    } else {
      const [[org]] = await conexao.query('SELECT nome FROM organizacoes WHERE id = ?', [organizacaoId]);
      await conexao.query(
        'INSERT INTO empresa_perfis (organizacao_id, nome, razao_social, cnpj, cnaes, padrao) VALUES (?, ?, ?, ?, ?, 1)',
        [organizacaoId, String(empresa.razao_social || org.nome).slice(0, 120), empresa.razao_social, empresa.cnpj, cnaesJson || '[]']
      );
    }

    // Primeiro filtro do boletim, com o que a pessoa acabou de dizer (e só ele:
    // as palavras de antes continuam no Radar, mas o filtro nasce do assistente).
    const [[filtro]] = await conexao.query(
      "SELECT id FROM perfis_busca WHERE organizacao_id = ? AND origem = 'boletim' AND nome = ?",
      [organizacaoId, NOME_DO_FILTRO]
    );
    const valores = [JSON.stringify(dados.palavras), JSON.stringify(dados.exclusoes), JSON.stringify(dados.ufs)];
    if (filtro) {
      await conexao.query(
        'UPDATE perfis_busca SET palavras = ?, exclusoes = ?, ufs = ?, ativo = 1 WHERE id = ? AND organizacao_id = ?',
        [...valores, filtro.id, organizacaoId]
      );
    } else {
      await conexao.query(
        `INSERT INTO perfis_busca (organizacao_id, nome, palavras, exclusoes, ufs, municipios, modalidades, horarios)
         VALUES (?, ?, ?, ?, ?, '[]', '[]', ?)`,
        [organizacaoId, NOME_DO_FILTRO, ...valores, JSON.stringify(regrasBoletim.HORARIOS_PADRAO)]
      );
    }

    await conexao.query(
      'UPDATE organizacoes SET onboarding_concluido_em = COALESCE(onboarding_concluido_em, NOW()) WHERE id = ?',
      [organizacaoId]
    );
    await conexao.commit();

    // As palavras mudaram: o Radar se repontua em segundo plano (a falha não desfaz nada).
    await fila
      .enfileirar('repontuar', { organizacaoId }, { prioridade: 5, chaveUnica: `repontuar:${organizacaoId}` })
      .catch((erro) => console.error('Assistente: repontuação não entrou na fila:', erro.message));

    return { ok: true, palavras_novas: novas.length };
  } catch (erro) {
    await conexao.rollback().catch(() => {});
    throw erro;
  } finally {
    conexao.release();
  }
}

/**
 * Gera já o primeiro boletim da organização (e manda por e-mail, se o servidor tem
 * SMTP). Sem isto o cliente esperaria o relógio das 7h, 12h ou 18h para ver o painel
 * funcionar. Refazer na mesma hora é permitido enquanto o boletim saiu vazio: é
 * quando a pessoa mais precisa ajustar as palavras e tentar de novo.
 */
async function primeiroBoletim({ organizacaoId, agora = new Date() }) {
  if (!(await boletim.podeReceber(organizacaoId))) {
    return { erro: 'O plano desta organização não inclui boletim, ou a assinatura não está em dia.', status: 402 };
  }
  // O boletim é do filtro que o assistente criou; os outros da organização seguem o próprio horário.
  const [[filtro]] = await pool.query(
    `SELECT id FROM perfis_busca WHERE organizacao_id = ? AND origem = 'boletim' AND nome = ?`,
    [organizacaoId, NOME_DO_FILTRO]
  );
  if (!filtro) return { erro: 'Faça os passos anteriores antes: o boletim precisa de um filtro com palavra-chave.', status: 400 };

  const { data, hora } = boletim.agoraNoFuso(agora);
  await pool.query('DELETE FROM boletins WHERE perfil_id = ? AND organizacao_id = ? AND data = ? AND horario = ? AND total_itens = 0', [
    filtro.id, organizacaoId, data, hora,
  ]);

  const rodada = await boletim.rodar({ agora, org: organizacaoId, perfilId: filtro.id, forcar: true, dias: DIAS_PRIMEIRO_BOLETIM });
  if (rodada.erros.length) throw new Error(rodada.erros[0]);

  const [[ultimo]] = await pool.query(
    `SELECT id, numero, data, horario, total_itens, email_status, email_detalhe
       FROM boletins WHERE perfil_id = ? AND organizacao_id = ? ORDER BY id DESC LIMIT 1`,
    [filtro.id, organizacaoId]
  );
  if (!ultimo) return { erro: 'O plano desta organização não inclui boletim, ou a assinatura não está em dia.', status: 402 };

  const [itens] = await pool.query(
    `SELECT l.id, l.objeto, l.orgao_nome, l.uf, l.municipio, l.modalidade, l.valor_estimado, l.fim_propostas, bi.palavra
       FROM boletim_itens bi JOIN licitacoes l ON l.id = bi.licitacao_id
      WHERE bi.boletim_id = ? AND bi.organizacao_id = ? ORDER BY l.fim_propostas IS NULL, l.fim_propostas LIMIT 8`,
    [ultimo.id, organizacaoId]
  );
  return { boletim: ultimo, itens, dias: DIAS_PRIMEIRO_BOLETIM };
}

module.exports = { estado, concluir, primeiroBoletim, aceitarTermos, termosDoUsuario, registrarNps };
