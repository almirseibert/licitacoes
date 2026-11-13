// /api/auth — login próprio e multiempresa (seção 1 do PLANO_SAAS_CONLICITACAO.md).
//
// Até a Fase 15 o login reaproveitava a tabela `usuarios` do banco do CRM
// (backend/config/db-auth.js, removido). Agora o painel tem seus próprios
// usuários (bcrypt) e organizações: cadastro cria a organização e o primeiro
// usuário como 'dono'; convite traz gente nova para dentro de uma
// organização já existente; e quem pertence a mais de uma troca de token sem
// digitar senha de novo.
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { jwt: cfgJwt } = require('../config/ambiente');
const { autenticar, confirmarVinculo, esquecerVinculo, exigirPapel, NIVEL_PAPEL } = require('../middlewares/autenticar');
const { responderErro } = require('../middlewares/responder-erro');
const email = require('../servicos/email');
const fila = require('../servicos/fila');
const {
  papelValido,
  gerarTokenConvite,
  dataFimTeste,
  expiraConvite,
} = require('../config/organizacao');

const rotas = express.Router();
const CUSTO_BCRYPT = 12;
const MINUTOS_RECUPERACAO = 60;
const RECUPERACOES_POR_HORA = 3;

/** sha256 em hex — o banco guarda o hash do token de recuperação, nunca o token. */
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

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

    // Seção 1b: a organização nova ganha a sua linha em cada licitação do
    // catálogo, pontuada com os pesos de fábrica, para o Radar não nascer vazio.
    // Falhar aqui não desfaz a conta: o botão "Repontuar" refaz.
    await fila
      .enfileirar('repontuar', { organizacaoId: org.insertId }, { prioridade: 5, chaveUnica: `repontuar:${org.insertId}` })
      .catch((erro) => console.error('Repontuação da organização nova não entrou na fila:', erro.message));

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
rotas.post('/convites', autenticar, confirmarVinculo, exigirPapel('admin'), async (req, res) => {
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
 * GET /api/auth/convites/:token — rota pública: o que a tela de aceite mostra
 * antes de pedir os dados (para qual organização, com que papel, e se o e-mail
 * já tem conta — aí a tela pede a senha dela em vez de criar outra).
 */
rotas.get('/convites/:token', async (req, res) => {
  try {
    const [[convite]] = await pool.query(
      `SELECT c.email, c.papel, c.expira_em, c.aceito_em, o.nome AS organizacao
         FROM convites c JOIN organizacoes o ON o.id = c.organizacao_id
        WHERE c.token = ? LIMIT 1`,
      [req.params.token]
    );
    if (!convite) return res.status(404).json({ erro: 'Convite não encontrado.' });
    if (convite.aceito_em) return res.status(409).json({ erro: 'Este convite já foi usado.' });
    if (new Date(convite.expira_em) < new Date()) return res.status(410).json({ erro: 'Este convite venceu. Peça um novo.' });

    const [[conta]] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [convite.email]);
    res.json({
      email: convite.email,
      papel: convite.papel,
      organizacao: convite.organizacao,
      conta_existe: Boolean(conta),
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível abrir o convite.', erro);
  }
});

/**
 * POST /api/auth/convites/:token/aceitar — rota pública (quem recebe o
 * convite ainda não tem sessão). Se o e-mail já tem conta, entra na
 * organização com a SENHA DESSA CONTA; senão, cria a conta com a senha
 * enviada aqui.
 *
 * Seção 1b — correção de segurança: antes, e-mail com conta entrava só com o
 * link. Quem tivesse o link (o próprio admin, quando o e-mail não está
 * configurado e a API devolve o link para envio à mão) recebia um token
 * daquele usuário — e, com ele, `trocar-organizacao` abria as OUTRAS
 * organizações da pessoa. O link prova que o convite existe, não quem é você.
 */
rotas.post('/convites/:token/aceitar', async (req, res) => {
  const { nome, senha } = req.body || {};
  const conexao = await pool.getConnection();
  try {
    await conexao.beginTransaction();
    // FOR UPDATE: dois aceites ao mesmo tempo do mesmo link não passam os dois.
    const [[convite]] = await conexao.query('SELECT * FROM convites WHERE token = ? LIMIT 1 FOR UPDATE', [
      req.params.token,
    ]);
    if (!convite) {
      await conexao.rollback();
      return res.status(404).json({ erro: 'Convite não encontrado.' });
    }
    if (convite.aceito_em) {
      await conexao.rollback();
      return res.status(409).json({ erro: 'Este convite já foi usado.' });
    }
    if (new Date(convite.expira_em) < new Date()) {
      await conexao.rollback();
      return res.status(410).json({ erro: 'Este convite venceu. Peça um novo.' });
    }

    const [existentes] = await conexao.query('SELECT id, nome, senha_hash, ativo FROM usuarios WHERE email = ?', [
      convite.email,
    ]);
    let usuarioId;
    let nomeUsuario;

    if (existentes.length) {
      const conta = existentes[0];
      const senhaConfere = senha ? await bcrypt.compare(String(senha), conta.senha_hash) : false;
      if (!senhaConfere || !conta.ativo) {
        await conexao.rollback();
        return res.status(401).json({ erro: 'Este e-mail já tem conta: entre com a senha dela para aceitar.' });
      }
      usuarioId = conta.id;
      nomeUsuario = conta.nome;
    } else {
      if (!nome || !senha || String(senha).length < 8) {
        await conexao.rollback();
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

    // O papel que vale é o da tabela (quem já era membro mantém o seu).
    const [[membro]] = await pool.query(
      'SELECT papel FROM organizacao_membros WHERE organizacao_id = ? AND usuario_id = ?',
      [convite.organizacao_id, usuarioId]
    );
    const token = assinar(usuarioId, nomeUsuario, convite.email, convite.organizacao_id, membro.papel);
    res.json({
      token,
      usuario: { id: usuarioId, nome: nomeUsuario, email: convite.email, papel: membro.papel },
    });
  } catch (erro) {
    await conexao.rollback().catch(() => {});
    responderErro(res, 500, 'Não foi possível aceitar o convite.', erro);
  } finally {
    conexao.release();
  }
});

// ------------------------------------------------------------------- equipe
/**
 * GET /api/auth/equipe — quem é da organização e, para admin/dono, os
 * convites ainda abertos. Qualquer membro vê a equipe; só admin/dono mexe.
 */
rotas.get('/equipe', autenticar, confirmarVinculo, async (req, res) => {
  try {
    const [membros] = await pool.query(
      `SELECT u.id, u.nome, u.email, u.ativo, m.papel, m.criado_em
         FROM organizacao_membros m JOIN usuarios u ON u.id = m.usuario_id
        WHERE m.organizacao_id = ?
        ORDER BY FIELD(m.papel, 'dono', 'admin', 'membro', 'leitor'), u.nome`,
      [req.organizacaoId]
    );
    let convites = [];
    if (NIVEL_PAPEL[req.papel] >= NIVEL_PAPEL.admin) {
      [convites] = await pool.query(
        `SELECT id, email, papel, expira_em, criado_em FROM convites
          WHERE organizacao_id = ? AND aceito_em IS NULL AND expira_em > NOW()
          ORDER BY criado_em DESC`,
        [req.organizacaoId]
      );
    }
    res.json({ membros, convites, eu: { id: req.usuario.id, papel: req.papel } });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar a equipe.', erro);
  }
});

/**
 * PATCH /api/auth/equipe/:usuarioId — muda o papel. Admin muda entre admin,
 * membro e leitor; só o dono passa a coroa (promove outro a dono) ou mexe em
 * outro dono. A organização nunca fica sem dono.
 */
rotas.patch('/equipe/:usuarioId', autenticar, confirmarVinculo, exigirPapel('admin'), async (req, res) => {
  const papelNovo = (req.body || {}).papel;
  if (!papelValido(papelNovo)) return res.status(400).json({ erro: 'Papel inválido.' });
  const alvoId = Number(req.params.usuarioId);

  try {
    const [[alvo]] = await pool.query(
      'SELECT papel FROM organizacao_membros WHERE organizacao_id = ? AND usuario_id = ?',
      [req.organizacaoId, alvoId]
    );
    if (!alvo) return res.status(404).json({ erro: 'Pessoa não encontrada nesta organização.' });

    const mexeComDono = alvo.papel === 'dono' || papelNovo === 'dono';
    if (mexeComDono && req.papel !== 'dono') {
      return res.status(403).json({ erro: 'Só o dono da organização define quem é dono.' });
    }
    if (alvo.papel === 'dono' && papelNovo !== 'dono' && (await quantosDonos(req.organizacaoId)) <= 1) {
      return res.status(409).json({ erro: 'A organização precisa de ao menos um dono. Promova outra pessoa antes.' });
    }

    await pool.query('UPDATE organizacao_membros SET papel = ? WHERE organizacao_id = ? AND usuario_id = ?', [
      papelNovo,
      req.organizacaoId,
      alvoId,
    ]);
    esquecerVinculo(alvoId, req.organizacaoId);
    res.json({ ok: true, mensagem: 'Papel alterado.' });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível mudar o papel.', erro);
  }
});

/** DELETE /api/auth/equipe/:usuarioId — tira a pessoa da organização (não apaga a conta). */
rotas.delete('/equipe/:usuarioId', autenticar, confirmarVinculo, exigirPapel('admin'), async (req, res) => {
  const alvoId = Number(req.params.usuarioId);
  try {
    const [[alvo]] = await pool.query(
      'SELECT papel FROM organizacao_membros WHERE organizacao_id = ? AND usuario_id = ?',
      [req.organizacaoId, alvoId]
    );
    if (!alvo) return res.status(404).json({ erro: 'Pessoa não encontrada nesta organização.' });
    if (alvo.papel === 'dono') {
      return res.status(409).json({ erro: 'O dono não sai da organização por aqui. Passe a posição de dono antes.' });
    }
    await pool.query('DELETE FROM organizacao_membros WHERE organizacao_id = ? AND usuario_id = ?', [
      req.organizacaoId,
      alvoId,
    ]);
    esquecerVinculo(alvoId, req.organizacaoId);
    res.json({ ok: true, mensagem: 'A pessoa saiu da organização e perdeu o acesso a ela.' });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível remover a pessoa.', erro);
  }
});

/** DELETE /api/auth/convites/:id — cancela um convite ainda não aceito. */
rotas.delete('/convites/:id', autenticar, confirmarVinculo, exigirPapel('admin'), async (req, res) => {
  try {
    const [r] = await pool.query(
      'DELETE FROM convites WHERE id = ? AND organizacao_id = ? AND aceito_em IS NULL',
      [req.params.id, req.organizacaoId]
    );
    if (!r.affectedRows) return res.status(404).json({ erro: 'Convite não encontrado.' });
    res.json({ ok: true });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível cancelar o convite.', erro);
  }
});

async function quantosDonos(organizacaoId) {
  const [[{ total }]] = await pool.query(
    "SELECT COUNT(*) AS total FROM organizacao_membros WHERE organizacao_id = ? AND papel = 'dono'",
    [organizacaoId]
  );
  return Number(total);
}

// ------------------------------------------------------ recuperação de senha
const RESPOSTA_RECUPERAR = {
  ok: true,
  mensagem: 'Se este e-mail tiver conta, chega nele um link para criar uma senha nova. Ele vale por 1 hora.',
};

/**
 * POST /api/auth/recuperar — pede o link. A resposta é a mesma exista ou não
 * a conta (não confirma e-mail cadastrado para quem está testando), e o link
 * só vai por e-mail: devolvê-lo na resposta entregaria a conta a quem
 * digitasse o e-mail de outra pessoa.
 */
rotas.post('/recuperar', async (req, res) => {
  const emailLimpo = String((req.body || {}).email || '').trim().toLowerCase();
  if (!emailLimpo) return res.status(400).json({ erro: 'Informe o e-mail da conta.' });

  try {
    const [[usuario]] = await pool.query('SELECT id, nome, ativo FROM usuarios WHERE email = ?', [emailLimpo]);
    if (!usuario || !usuario.ativo) return res.json(RESPOSTA_RECUPERAR);

    // Teto por hora: o link vai para a caixa da pessoa, e pedir cem não pode
    // virar cem e-mails nela.
    const [[{ recentes }]] = await pool.query(
      'SELECT COUNT(*) AS recentes FROM recuperacoes_senha WHERE usuario_id = ? AND criado_em > DATE_SUB(NOW(), INTERVAL 1 HOUR)',
      [usuario.id]
    );
    if (Number(recentes) >= RECUPERACOES_POR_HORA) return res.json(RESPOSTA_RECUPERAR);

    const token = crypto.randomBytes(32).toString('hex');
    await pool.query(
      'INSERT INTO recuperacoes_senha (usuario_id, token_hash, expira_em) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))',
      [usuario.id, hashToken(token), MINUTOS_RECUPERACAO]
    );

    const { urlPublica } = require('../config/ambiente');
    const envio = await email.enviarTransacional({
      para: emailLimpo,
      assunto: 'Nova senha — Painel de Licitações',
      texto:
        `Olá, ${usuario.nome}.\n\nPara criar uma senha nova, entre pelo link:\n` +
        `${urlPublica || ''}/redefinir-senha/${token}\n\n` +
        'Ele vale por 1 hora e funciona uma vez só. Se não foi você quem pediu, ignore este e-mail.',
    });
    if (!envio.enviado) {
      console.error('Recuperação de senha pedida, mas o e-mail não está configurado (SMTP_HOST/SMTP_DE).');
    }
    return res.json(RESPOSTA_RECUPERAR);
  } catch (erro) {
    return responderErro(res, 500, 'Não foi possível pedir a recuperação agora.', erro);
  }
});

/** POST /api/auth/redefinir — { token, senha }: troca a senha, uma vez só. */
rotas.post('/redefinir', async (req, res) => {
  const { token, senha } = req.body || {};
  if (!token) return res.status(400).json({ erro: 'Link de recuperação incompleto.' });
  if (!senha || String(senha).length < 8) {
    return res.status(400).json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' });
  }

  const conexao = await pool.getConnection();
  try {
    await conexao.beginTransaction();
    const [[pedido]] = await conexao.query(
      `SELECT id, usuario_id FROM recuperacoes_senha
        WHERE token_hash = ? AND usado_em IS NULL AND expira_em > NOW()
        LIMIT 1 FOR UPDATE`,
      [hashToken(token)]
    );
    if (!pedido) {
      await conexao.rollback();
      return res.status(410).json({ erro: 'Este link não vale mais. Peça outro em "Esqueci minha senha".' });
    }

    const senhaHash = await bcrypt.hash(String(senha), CUSTO_BCRYPT);
    await conexao.query('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [senhaHash, pedido.usuario_id]);
    // Usa este e invalida qualquer outro link aberto da mesma pessoa.
    await conexao.query(
      'UPDATE recuperacoes_senha SET usado_em = NOW() WHERE usuario_id = ? AND usado_em IS NULL',
      [pedido.usuario_id]
    );
    await conexao.commit();
    return res.json({ ok: true, mensagem: 'Senha nova salva. Entre com ela.' });
  } catch (erro) {
    await conexao.rollback().catch(() => {});
    return responderErro(res, 500, 'Não foi possível trocar a senha agora.', erro);
  } finally {
    conexao.release();
  }
});

module.exports = rotas;
