// POST /api/auth/login — reaproveita os usuários do painel atual (seção 13).
//
// A tabela `usuarios` continua morando no banco do CRM: este painel só a LÊ,
// pelo pool de AUTH_DB_DATABASE. O banco `licitacoes` permanece separado, como
// manda a seção 2.1. O token é assinado com o mesmo JWT_SECRET do painel atual,
// de modo que o mesmo token vale nos dois sistemas.
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const poolAuth = require('../config/db-auth');
const { jwt: cfgJwt } = require('../config/ambiente');
const { autenticar } = require('../middlewares/autenticar');
const { responderErro } = require('../middlewares/responder-erro');

const rotas = express.Router();

/**
 * Erro de banco que, na verdade, é configuração — e que por isso merece
 * resposta diferente de "não foi possível entrar agora".
 *
 * Isto existe porque a falha real foi exatamente esta: o painel estava com
 * AUTH_DB_DATABASE apontando para o banco certo, mas o usuário do MySQL não
 * tinha permissão de leitura nele. A mensagem genérica mandava quem instala
 * procurar defeito no código, quando o que faltava era um GRANT de uma linha.
 *
 * O `detalhe` devolvido aqui — nome do usuário do MySQL, nome do banco do CRM,
 * o GRANT exato — é ouro para quem está instalando e veneno para quem só está
 * tentando entrar: esta rota não exige token (é o login), então qualquer um
 * que chamá-la o receberia. Por isso `detalhe` nunca vai no corpo da resposta
 * (seção 13, CLAUDE.md) — só no log do serviço, via `responderErro`. Quem
 * instala lê o log; quem está na tela de login só precisa saber que o
 * administrador tem de liberar o acesso.
 */
function erroDeConfiguracao(erro) {
  const usuario = process.env.DB_USER || '(DB_USER vazio)';
  const base = process.env.AUTH_DB_DATABASE || '(AUTH_DB_DATABASE vazio)';

  if (erro.code === 'ER_DBACCESS_DENIED_ERROR' || erro.code === 'ER_ACCESS_DENIED_ERROR') {
    return {
      erro:
        'Login indisponível: este painel não tem permissão de leitura na base de usuários. ' +
        'Peça ao administrador do banco para liberar o acesso.',
      detalhe:
        `o usuário ${usuario} não alcança o banco ${base}. ` +
        `Libere SOMENTE LEITURA: GRANT SELECT ON ${base}.usuarios TO '${usuario}'@'%'; ` +
        'depois FLUSH PRIVILEGES. O painel nunca escreve nessa base.',
    };
  }

  if (erro.code === 'ER_NO_SUCH_TABLE') {
    return {
      erro: 'Login indisponível: a base de usuários configurada não tem a tabela esperada.',
      detalhe: `${base} não tem a tabela usuarios. Confira AUTH_DB_DATABASE no .env.`,
    };
  }

  if (erro.code === 'ER_BAD_DB_ERROR') {
    return {
      erro: 'Login indisponível: a base de usuários configurada não existe.',
      detalhe: `não existe o banco ${base}. Confira AUTH_DB_DATABASE no .env.`,
    };
  }

  return null;
}

rotas.post('/login', async (req, res) => {
  const { email, senha, password } = req.body || {};
  const palavraPasse = senha || password;

  if (!email || !palavraPasse) {
    return res.status(400).json({ erro: 'Informe e-mail e senha.' });
  }

  if (!poolAuth) {
    return responderErro(
      res,
      503,
      'Login indisponível: a base de usuários do painel não está configurada.',
      null,
      'Defina AUTH_DB_DATABASE no .env.'
    );
  }

  try {
    const [linhas] = await poolAuth.query(
      'SELECT id, nome, email, senha, papel, ativo FROM usuarios WHERE email = ? LIMIT 1',
      [email]
    );
    if (!linhas.length) {
      return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    }

    const usuario = linhas[0];
    if (usuario.ativo === 0) {
      return res.status(403).json({ erro: 'Usuário inativo. Fale com o administrador.' });
    }

    const senhaValida = await bcrypt.compare(palavraPasse, usuario.senha || '');
    if (!senhaValida) {
      return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    }

    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, nome: usuario.nome, papel: usuario.papel },
      cfgJwt.segredo,
      { expiresIn: cfgJwt.expira }
    );

    return res.json({
      token,
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, papel: usuario.papel },
    });
  } catch (erro) {
    const configuracao = erroDeConfiguracao(erro);
    if (configuracao) {
      return responderErro(res, 503, configuracao.erro, erro, configuracao.detalhe);
    }

    return responderErro(res, 500, 'Não foi possível entrar agora.', erro);
  }
});

rotas.get('/eu', autenticar, (req, res) => {
  res.json({ usuario: req.usuario });
});

module.exports = rotas;
