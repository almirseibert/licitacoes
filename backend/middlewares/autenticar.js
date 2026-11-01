// Verificação do JWT. É o mesmo token do painel atual: mesmo segredo
// (JWT_SECRET), mesmo formato de payload — por isso quem já está logado no CRM
// entra aqui sem novo login. A permissão vem SEMPRE do backend; o frontend
// nunca decide por e-mail fixo (regra da seção 2.3).
const jwt = require('jsonwebtoken');
const { jwt: cfgJwt } = require('../config/ambiente');

function autenticar(req, res, next) {
  const cabecalho = req.headers.authorization || '';
  const token = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7) : null;

  if (!token) {
    return res.status(401).json({ erro: 'Faça login para continuar.' });
  }

  try {
    req.usuario = jwt.verify(token, cfgJwt.segredo);
    return next();
  } catch {
    return res.status(401).json({ erro: 'Sessão expirada. Entre novamente.' });
  }
}

function apenasAdmin(req, res, next) {
  if (!req.usuario || req.usuario.papel !== 'admin') {
    return res.status(403).json({ erro: 'Esta ação é restrita ao administrador.' });
  }
  return next();
}

module.exports = { autenticar, apenasAdmin };
