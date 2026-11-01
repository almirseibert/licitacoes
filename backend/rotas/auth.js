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

const rotas = express.Router();

rotas.post('/login', async (req, res) => {
  const { email, senha, password } = req.body || {};
  const palavraPasse = senha || password;

  if (!email || !palavraPasse) {
    return res.status(400).json({ erro: 'Informe e-mail e senha.' });
  }

  if (!poolAuth) {
    return res.status(503).json({
      erro: 'Login indisponível: a base de usuários do painel não está configurada.',
      detalhe: 'Defina AUTH_DB_DATABASE no .env.',
    });
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
    console.error('Erro no login:', erro.message);
    return res.status(500).json({ erro: 'Não foi possível entrar agora.', detalhe: erro.message });
  }
});

rotas.get('/eu', autenticar, (req, res) => {
  res.json({ usuario: req.usuario });
});

module.exports = rotas;
