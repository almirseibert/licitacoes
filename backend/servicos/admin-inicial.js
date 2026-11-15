// Primeiro acesso da Studio Mythos (organização 1): cria — ou conserta — o usuário
// administrador a partir de ADMIN_EMAIL_PADRAO / ADMIN_SENHA_PADRAO.
//
// Usado pelo `npm run admin` (idempotente, funciona mesmo se já houver outros
// usuários) e pelo `npm run semear` (que só cria com a tabela vazia). Recebe o
// `pool` e o `bcrypt` por parâmetro para ser testável sem banco.
const bcryptReal = require('bcrypt');

const ORGANIZACAO_OPERADORA = 1;
const CUSTO_BCRYPT = 12;
const SENHA_MINIMA = 8;

/** E-mail como o login o compara: sem espaço nas pontas e em minúsculas. */
function normalizarEmail(texto) {
  return String(texto || '').trim().toLowerCase();
}

/**
 * Garante o administrador. Nunca devolve nem imprime a senha.
 * @returns {Promise<{acao: string, email: string, totalUsuarios: number, senhaConfere?: boolean, avisos: string[]}>}
 *   acao: 'sem_variaveis' | 'criado' | 'vinculado' | 'senha_redefinida' | 'ja_existia'
 */
async function garantirAdmin({ pool, bcrypt = bcryptReal, email, senha, redefinirSenha = false }) {
  const emailLimpo = normalizarEmail(email);
  const senhaLimpa = String(senha || '');
  const avisos = [];

  const [[contagem]] = await pool.query('SELECT COUNT(*) AS n FROM usuarios');
  const totalUsuarios = Number(contagem.n);

  if (!emailLimpo || !senhaLimpa) {
    return { acao: 'sem_variaveis', email: emailLimpo, totalUsuarios, avisos };
  }
  if (senhaLimpa.length < SENHA_MINIMA) {
    avisos.push(`a senha tem ${senhaLimpa.length} caracteres e o cadastro exige ${SENHA_MINIMA}: troque-a depois de entrar`);
  }

  const [existentes] = await pool.query('SELECT id, senha_hash FROM usuarios WHERE email = ? LIMIT 1', [emailLimpo]);

  let usuarioId;
  let acao;
  let senhaConfere;

  if (!existentes.length) {
    const hash = await bcrypt.hash(senhaLimpa, CUSTO_BCRYPT);
    const [novo] = await pool.query('INSERT INTO usuarios (nome, email, senha_hash) VALUES (?, ?, ?)', [
      'Administrador',
      emailLimpo,
      hash,
    ]);
    usuarioId = novo.insertId;
    acao = 'criado';
  } else {
    usuarioId = existentes[0].id;
    senhaConfere = await bcrypt.compare(senhaLimpa, existentes[0].senha_hash);
    if (redefinirSenha && !senhaConfere) {
      const hash = await bcrypt.hash(senhaLimpa, CUSTO_BCRYPT);
      await pool.query('UPDATE usuarios SET senha_hash = ?, ativo = 1 WHERE id = ?', [hash, usuarioId]);
      senhaConfere = true;
      acao = 'senha_redefinida';
    } else {
      acao = 'ja_existia';
      if (!senhaConfere) {
        avisos.push('o usuário já existe e a senha das variáveis NÃO confere com a gravada: rode `npm run admin -- --redefinir-senha` para trocá-la');
      }
    }
  }

  const [vinculos] = await pool.query(
    'SELECT papel FROM organizacao_membros WHERE organizacao_id = ? AND usuario_id = ?',
    [ORGANIZACAO_OPERADORA, usuarioId]
  );
  if (!vinculos.length) {
    await pool.query("INSERT INTO organizacao_membros (organizacao_id, usuario_id, papel) VALUES (?, ?, 'dono')", [
      ORGANIZACAO_OPERADORA,
      usuarioId,
    ]);
    if (acao === 'ja_existia') acao = 'vinculado';
  } else if (vinculos[0].papel !== 'dono') {
    await pool.query("UPDATE organizacao_membros SET papel = 'dono' WHERE organizacao_id = ? AND usuario_id = ?", [
      ORGANIZACAO_OPERADORA,
      usuarioId,
    ]);
    if (acao === 'ja_existia') acao = 'vinculado';
  }

  return { acao, email: emailLimpo, totalUsuarios, senhaConfere, avisos };
}

const TEXTOS = {
  sem_variaveis: 'nada feito: ADMIN_EMAIL_PADRAO e ADMIN_SENHA_PADRAO precisam estar preenchidas neste serviço',
  criado: 'usuário administrador CRIADO (organização Studio Mythos, papel dono)',
  vinculado: 'usuário já existia; agora é DONO da organização Studio Mythos',
  senha_redefinida: 'usuário já existia; a SENHA foi redefinida pelas variáveis (e o usuário foi reativado)',
  ja_existia: 'usuário já existia e já é dono da organização Studio Mythos; nada a mudar',
};

/** Linhas para o console, sem a senha. */
function descrever(resultado) {
  const linhas = [`${TEXTOS[resultado.acao]}${resultado.email ? `: ${resultado.email}` : ''}`];
  linhas.push(`usuários no banco: ${resultado.totalUsuarios}`);
  for (const aviso of resultado.avisos) linhas.push(`AVISO: ${aviso}`);
  return linhas;
}

module.exports = { garantirAdmin, normalizarEmail, descrever, ORGANIZACAO_OPERADORA, SENHA_MINIMA };
