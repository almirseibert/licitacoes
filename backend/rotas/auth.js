// /api/auth — login próprio e multiempresa (seção 1 do PLANO_SAAS_CONLICITACAO.md).
//
// Até a Fase 15 o login reaproveitava a tabela `usuarios` do banco do CRM
// (backend/config/db-auth.js, removido). Agora o painel tem seus próprios
// usuários (bcrypt) e organizações: cadastro cria a organização e o primeiro
// usuário como 'dono'; convite traz gente nova para dentro de uma
// organização já existente; e quem pertence a mais de uma troca de token sem
// digitar senha de novo.
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { jwt: cfgJwt } = require('../config/ambiente');
const { autenticar, exigirPapel } = require('../middlewares/autenticar');
const { responderErro } = require('../middlewares/responder-erro');
const email = require('../servicos/email');
const {
  papelValido,
  gerarTokenConvite,
  dataFimTeste,
  expiraConvite,
} = require('../config/organizacao');

const rotas = express.Router();
const CUSTO_BCRYPT = 12;

function assinar(usuarioId, nome, emailUsuario, organizacaoId, papel) {
  return jwt.sign(
    { id: usuarioId, nome, email: emailUsuario, organizacao_id: organizacaoId, papel },
    cfgJwt.segredo,
    { expiresIn: cfgJwt.expira }
  );
}

/** Organizações a que o usuário pertence, para o seletor de troca (seção 1). */
async function organizacoesDoUsuario(usuarioId) {
  const [linhas] = await pool.query(
    `SELECT o.id, o.nome, o.status, m.papel
       FROM organizacao_membros m
       JOIN organizacoes o ON o.id = m.organizacao_id
      WHERE m.usuario_id = ?
      ORDER BY o.nome ASC`,
    [usuarioId]
  );
  return linhas;
}

// ------------------------------------------------------------------ cadastro
/**
 * POST /api/auth/cadastro — cria a organização e o primeiro usuário, como
 * 'dono'. Rota pública: qualquer um pode assinar o painel (é o SaaS).
 */
rotas.post('/cadastro', async (req, res) => {
  const { nome, email: emailUsuario, senha, organizacao } = req.body || {};

  if (!nome || !String(nome).trim()) return res.status(400).json({ erro: 'Informe seu nome.' });
  if (!emailUsuario || !String(emailUsuario).trim()) {
    return res.status(400).json({ erro: 'Informe um e-mail.' });
  }
  if (!senha || String(senha).length < 8) {
    return res.status(400).json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' });
  }
  if (!organizacao || !String(organizacao).trim()) {
    return res.status(400).json({ erro: 'Informe o nome da sua empresa.' });
  }

  const emailLimpo = String(emailUsuario).trim().toLowerCase();
  const conexao = await pool.getConnection();
  try {
    await conexao.beginTransaction();

    const [existente] = await conexao.query('SELECT id FROM usuarios WHERE email = ?', [emailLimpo]);
    if (existente.length) {
      await conexao.rollback();
      return res.status(409).json({ erro: 'Já existe uma conta com este e-mail. Faça login.' });
    }

    const senhaHash = await bcrypt.hash(senha, CUSTO_BCRYPT);
    const [usuario] = await conexao.query(
      'INSERT INTO usuarios (nome, email, senha_hash) VALUES (?, ?, ?)',
      [String(nome).trim().slice(0, 160), emailLimpo, senhaHash]
    );

    const [org] = await conexao.query(
      'INSERT INTO organizacoes (nome, status, teste_ate) VALUES (?, ?, ?)',
      [String(organizacao).trim().slice(0, 160), 'teste', dataFimTeste()]
    );

    await conexao.query(
      'INSERT INTO organizacao_membros (organizacao_id, usuario_id, papel) VALUES (?, ?, ?)',
      [org.insertId, usuario.insertId, 'dono']
    );

    await conexao.commit();

    const token = assinar(usuario.insertId, nome, emailLimpo, org.insertId, 'dono');
    return res.status(201).json({
      token,
      usuario: { id: usuario.insertId, nome, email: emailLimpo, papel: 'dono' },
      organizacao: { id: org.insertId, nome: organizacao, status: 'teste', teste_ate: dataFimTeste() },
    });
  } catch (erro) {
    await conexao.rollback();
    return responderErro(res, 500, 'Não foi possível criar a conta agora.', erro);
  } finally {
    conexao.release();
  }
});

// --------------------------------------------------------------------- login
rotas.post('/login', async (req, res) => {
  const { email: emailUsuario, senha, password } = req.body || {};
  const palavraPasse = senha || password;

  if (!emailUsuario || !palavraPasse) {
    return res.status(400).json({ erro: 'Informe e-mail e senha.' });
  }

  const emailLimpo = String(emailUsuario).trim().toLowerCase();
  try {
    const [linhas] = await pool.query(
      'SELECT id, nome, email, senha_hash, ativo FROM usuarios WHERE email = ? LIMIT 1',
      [emailLimpo]
    );
    if (!linhas.length) return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });

    const usuario = linhas[0];
    if (!usuario.ativo) {
      return res.status(403).json({ erro: 'Usuário inativo. Fale com o administrador da sua organização.' });
    }

    const senhaValida = await bcrypt.compare(palavraPasse, usuario.senha_hash);
    if (!senhaValida) return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });

    const organizacoes = await organizacoesDoUsuario(usuario.id);
    if (!organizacoes.length) {
      return res.status(403).json({ erro: 'Sua conta não pertence a nenhuma organização ativa.' });
    }

    // Entra direto na primeira (o painel troca depois, sem senha de novo).
    const principal = organizacoes[0];
    const token = assinar(usuario.id, usuario.nome, usuario.email, principal.id, principal.papel);

    return res.json({
      token,
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, papel: principal.papel },
      organizacao: { id: principal.id, nome: principal.nome, status: principal.status },
      organizacoes,
    });
  } catch (erro) {
    return responderErro(res, 500, 'Não foi possível entrar agora.', erro);
  }
});

rotas.get('/eu', autenticar, async (req, res) => {
  try {
    const organizacoes = await organizacoesDoUsuario(req.usuario.id);
    res.json({ usuario: req.usuario, organizacoes });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar sua sessão.', erro);
  }
});

// ----------------------------------------------------- trocar de organização
/**
 * POST /api/auth/trocar-organizacao — reemite o token para outra organização
 * a que o usuário já pertence. Não pede senha: a prova de identidade já foi
 * feita no login; isto só muda em qual organização o token atua.
 */
rotas.post('/trocar-organizacao', autenticar, async (req, res) => {
  const organizacaoId = Number((req.body || {}).organizacao_id);
  if (!organizacaoId) return res.status(400).json({ erro: 'Informe a organização.' });

  try {
    const [linhas] = await pool.query(
      `SELECT o.id, o.nome, o.status, m.papel
         FROM organizacao_membros m
         JOIN organizacoes o ON o.id = m.organizacao_id
        WHERE m.usuario_id = ? AND m.organizacao_id = ?`,
      [req.usuario.id, organizacaoId]
    );
    if (!linhas.length) {
      return res.status(403).json({ erro: 'Você não pertence a esta organização.' });
    }

    const org = linhas[0];
    const token = assinar(req.usuario.id, req.usuario.nome, req.usuario.email, org.id, org.papel);
    return res.json({
      token,
      usuario: { id: req.usuario.id, nome: req.usuario.nome, email: req.usuario.email, papel: org.papel },
      organizacao: { id: org.id, nome: org.nome, status: org.status },
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível trocar de organização.', erro);
  }
});

// ------------------------------------------------------------------ convites
/**
 * POST /api/auth/convites — só 'admin' ou 'dono' convidam. O convite é para
 * a organização do token de quem chama, nunca para outra (ninguém convida
 * gente para uma organização que não é a sua).
 */
rotas.post('/convites', autenticar, exigirPapel('admin'), async (req, res) => {
  const { email: emailConvite, papel } = req.body || {};
  if (!emailConvite || !String(emailConvite).trim()) {
    return res.status(400).json({ erro: 'Informe o e-mail de quem você quer convidar.' });
  }
  const papelConvite = papel || 'membro';
  if (!papelValido(papelConvite) || papelConvite === 'dono') {
    return res.status(400).json({ erro: 'Papel inválido. Use admin, membro ou leitor.' });
  }

  const emailLimpo = String(emailConvite).trim().toLowerCase();
  const token = gerarTokenConvite();
  const expira = expiraConvite();

  try {
    await pool.query(
      `INSERT INTO convites (organizacao_id, email, papel, token, criado_por, expira_em)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.organizacaoId, emailLimpo, papelConvite, token, req.usuario.id, expira]
    );

    const { urlPublica } = require('../config/ambiente');
    const link = `${urlPublica || ''}/convite/${token}`;
    const envio = await email.enviarTransacional({
      para: emailLimpo,
      assunto: 'Convite — Painel de Licitações',
      texto: `Você foi convidado para o painel de licitações. Entre pelo link:\n${link}\n\nEle vale por 72 horas.`,
    });

    res.status(201).json({
      ok: true,
      link,
      email_enviado: envio.enviado,
      mensagem: envio.enviado
        ? `Convite enviado para ${emailLimpo}.`
        : `E-mail não configurado — copie o link e mande para ${emailLimpo} à mão.`,
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível criar o convite.', erro);
  }
});

/**
 * POST /api/auth/convites/:token/aceitar — rota pública (quem recebe o
 * convite ainda não tem sessão). Se o e-mail já tem conta, só entra na
 * organização; senão, cria a conta com a senha enviada aqui.
 */
rotas.post('/convites/:token/aceitar', async (req, res) => {
  const { nome, senha } = req.body || {};
  const conexao = await pool.getConnection();
  try {
    const [convitesLinhas] = await conexao.query(
      'SELECT * FROM convites WHERE token = ? LIMIT 1',
      [req.params.token]
    );
    if (!convitesLinhas.length) {
      conexao.release();
      return res.status(404).json({ erro: 'Convite não encontrado.' });
    }
    const convite = convitesLinhas[0];
    if (convite.aceito_em) {
      conexao.release();
      return res.status(409).json({ erro: 'Este convite já foi usado.' });
    }
    if (new Date(convite.expira_em) < new Date()) {
      conexao.release();
      return res.status(410).json({ erro: 'Este convite venceu. Peça um novo.' });
    }

    await conexao.beginTransaction();

    const [existentes] = await conexao.query('SELECT id, nome FROM usuarios WHERE email = ?', [convite.email]);
    let usuarioId;
    let nomeUsuario;

    if (existentes.length) {
      usuarioId = existentes[0].id;
      nomeUsuario = existentes[0].nome;
    } else {
      if (!nome || !senha || String(senha).length < 8) {
        await conexao.rollback();
        conexao.release();
        return res.status(400).json({ erro: 'Informe seu nome e uma senha de pelo menos 8 caracteres.' });
      }
      const senhaHash = await bcrypt.hash(senha, CUSTO_BCRYPT);
      const [novo] = await conexao.query(
        'INSERT INTO usuarios (nome, email, senha_hash) VALUES (?, ?, ?)',
        [String(nome).trim().slice(0, 160), convite.email, senhaHash]
      );
      usuarioId = novo.insertId;
      nomeUsuario = nome;
    }

    await conexao.query(
      `INSERT INTO organizacao_membros (organizacao_id, usuario_id, papel)
       VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE papel = papel`,
      [convite.organizacao_id, usuarioId, convite.papel]
    );
    await conexao.query('UPDATE convites SET aceito_em = NOW() WHERE id = ?', [convite.id]);

    await conexao.commit();

    const token = assinar(usuarioId, nomeUsuario, convite.email, convite.organizacao_id, convite.papel);
    res.json({
      token,
      usuario: { id: usuarioId, nome: nomeUsuario, email: convite.email, papel: convite.papel },
    });
  } catch (erro) {
    await conexao.rollback();
    responderErro(res, 500, 'Não foi possível aceitar o convite.', erro);
  } finally {
    conexao.release();
  }
});

module.exports = rotas;
