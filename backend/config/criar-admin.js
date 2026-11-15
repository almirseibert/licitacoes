// Cria (ou conserta) o administrador da Studio Mythos a partir das variáveis de
// ambiente, mesmo se o `semear` já passou e havia outros usuários no banco.
//   npm run admin                       cria / vincula, sem trocar senha
//   npm run admin -- --redefinir-senha  também troca a senha pela da variável
const pool = require('./db');
const { garantirAdmin, descrever } = require('../servicos/admin-inicial');

async function principal() {
  const resultado = await garantirAdmin({
    pool,
    email: process.env.ADMIN_EMAIL_PADRAO,
    senha: process.env.ADMIN_SENHA_PADRAO,
    redefinirSenha: process.argv.includes('--redefinir-senha'),
  });
  for (const linha of descrever(resultado)) console.log(linha);
  return resultado.acao === 'sem_variaveis' ? 1 : 0;
}

principal()
  .then((codigo) => pool.end().then(() => process.exit(codigo)))
  .catch((erro) => {
    console.error('Não foi possível preparar o administrador:', erro.message);
    process.exit(1);
  });
