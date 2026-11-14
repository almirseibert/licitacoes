// /api/integracoes — tokens de API e webhooks da organização (Seção 14 do
// PLANO_SAAS_CONLICITACAO.md). Só administrador e dono: um token lê tudo o que a
// organização enxerga, e um webhook leva esse dado para fora.
//
//   · O token aparece UMA vez, na resposta da criação; o banco guarda só o hash.
//   · O segredo do webhook segue a mesma regra (é derivado, mas a tela só o mostra
//     ao criar ou girar). Perdeu? Gire — o antigo deixa de valer na hora.
//   · O limite do plano é conferido DENTRO da transação, com a organização
//     travada, para duas criações simultâneas não passarem juntas do teto.
const express = require('express');
const pool = require('../config/db');
const { exigirPapel } = require('../middlewares/autenticar');
const { responderErro } = require('../middlewares/responder-erro');
const limites = require('../servicos/limites');
const webhook = require('../servicos/webhook');
const { jwt, urlPublica, webhookPermitirLocal } = require('../config/ambiente');
const regras = require('../regras/api');

const rotas = express.Router();
rotas.use(exigirPapel('admin'));

function id(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function nomeDe(valor, padrao) {
  const nome = String(valor === undefined ? padrao : valor).trim();
  if (!nome) throw new Error('Dê um nome para identificar depois.');
  if (nome.length > 80) throw new Error('O nome pode ter no máximo 80 caracteres.');
  return nome;
}

function lerIps(valor) {
  if (Array.isArray(valor)) return valor;
  try {
    const v = JSON.parse(valor);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Cria dentro de uma transação com a organização travada; `criar` recebe a conexão. */
async function criarComLimite(organizacaoId, chave, contar, criar) {
  const conexao = await pool.getConnection();
  try {
    await conexao.beginTransaction();
    await conexao.query('SELECT id FROM organizacoes WHERE id = ? FOR UPDATE', [organizacaoId]);
    const usado = await contar(conexao);
    const corpo = await limites.conferir(organizacaoId, chave, { usadoAtual: usado });
    if (corpo) {
      await conexao.rollback();
      return { recusa: corpo };
    }
    const resultado = await criar(conexao);
    await conexao.commit();
    return { resultado };
  } catch (erro) {
    await conexao.rollback().catch(() => {});
    throw erro;
  } finally {
    conexao.release();
  }
}

// ------------------------------------------------------------------ tokens

const COLUNAS_TOKEN = 'id, nome, prefixo, ips_liberados, criado_em, ultimo_uso, ultimo_ip, revogado_em';

function formaToken(l) {
  return { ...l, ips_liberados: lerIps(l.ips_liberados) };
}

rotas.get('/tokens', async (req, res) => {
  try {
    const [linhas] = await pool.query(
      `SELECT ${COLUNAS_TOKEN} FROM tokens_api WHERE organizacao_id = ?
        ORDER BY revogado_em IS NOT NULL, id DESC LIMIT 100`,
      [req.organizacaoId]
    );
    res.json({ dados: linhas.map(formaToken) });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar os tokens de API.', erro);
  }
});

rotas.post('/tokens', async (req, res) => {
  let nome;
  let ips;
  try {
    nome = nomeDe(req.body && req.body.nome);
    ips = regras.validarIps(req.body && req.body.ips_liberados);
  } catch (erro) {
    return res.status(400).json({ erro: erro.message });
  }
  try {
    const novo = regras.gerarToken();
    const r = await criarComLimite(
      req.organizacaoId,
      'tokens_api',
      async (c) => {
        const [[{ total }]] = await c.query('SELECT COUNT(*) AS total FROM tokens_api WHERE organizacao_id = ? AND revogado_em IS NULL', [req.organizacaoId]);
        return Number(total);
      },
      async (c) => {
        const [ins] = await c.query(
          'INSERT INTO tokens_api (organizacao_id, nome, prefixo, token_hash, ips_liberados, criado_por) VALUES (?, ?, ?, ?, ?, ?)',
          [req.organizacaoId, nome, novo.prefixo, novo.hash, JSON.stringify(ips), req.usuario.id]
        );
        return ins.insertId;
      }
    );
    if (r.recusa) return res.status(402).json(r.recusa);
    console.log(`API: token ${r.resultado} criado na organização ${req.organizacaoId} por ${req.usuario.id}.`);
    // A única vez em que o token em texto puro sai do servidor.
    return res.status(201).json({
      id: r.resultado,
      nome,
      prefixo: novo.prefixo,
      ips_liberados: ips,
      token: novo.token,
      aviso: 'Copie o token agora: ele não será mostrado de novo. Se perder, revogue e crie outro.',
    });
  } catch (erro) {
    return responderErro(res, 500, 'Não foi possível criar o token de API.', erro);
  }
});

rotas.patch('/tokens/:id', async (req, res) => {
  const tokenId = id(req.params.id);
  if (!tokenId) return res.status(400).json({ erro: 'Token inválido.' });
  const campos = {};
  try {
    if (req.body && 'nome' in req.body) campos.nome = nomeDe(req.body.nome);
    if (req.body && 'ips_liberados' in req.body) campos.ips_liberados = JSON.stringify(regras.validarIps(req.body.ips_liberados));
  } catch (erro) {
    return res.status(400).json({ erro: erro.message });
  }
  if (!Object.keys(campos).length) return res.status(400).json({ erro: 'Nada para alterar.' });
  try {
    const nomes = Object.keys(campos);
    const [r] = await pool.query(
      `UPDATE tokens_api SET ${nomes.map((n) => `${n} = ?`).join(', ')}
        WHERE id = ? AND organizacao_id = ? AND revogado_em IS NULL`,
      [...nomes.map((n) => campos[n]), tokenId, req.organizacaoId]
    );
    if (!r.affectedRows) return res.status(404).json({ erro: 'Token não encontrado (ou já revogado).' });
    const [[linha]] = await pool.query(`SELECT ${COLUNAS_TOKEN} FROM tokens_api WHERE id = ? AND organizacao_id = ?`, [tokenId, req.organizacaoId]);
    return res.json(formaToken(linha));
  } catch (erro) {
    return responderErro(res, 500, 'Não foi possível alterar o token.', erro);
  }
});

// Revogar não apaga: a linha fica para o histórico e deixa de contar no limite.
rotas.delete('/tokens/:id', async (req, res) => {
  const tokenId = id(req.params.id);
  if (!tokenId) return res.status(400).json({ erro: 'Token inválido.' });
  try {
    const [r] = await pool.query(
      'UPDATE tokens_api SET revogado_em = NOW() WHERE id = ? AND organizacao_id = ? AND revogado_em IS NULL',
      [tokenId, req.organizacaoId]
    );
    if (!r.affectedRows) return res.status(404).json({ erro: 'Token não encontrado (ou já revogado).' });
    console.log(`API: token ${tokenId} revogado na organização ${req.organizacaoId} por ${req.usuario.id}.`);
    return res.json({ ok: true });
  } catch (erro) {
    return responderErro(res, 500, 'Não foi possível revogar o token.', erro);
  }
});

// ---------------------------------------------------------------- webhooks

const COLUNAS_WEBHOOK = `w.id, w.nome, w.url, w.perfil_id, p.nome AS filtro_nome, p.origem AS filtro_origem, w.ativo,
       w.criado_em, w.ultima_entrega_em, w.ultimo_status, w.ultimo_detalhe, w.falhas_seguidas,
       (SELECT COUNT(*) FROM webhook_itens wi WHERE wi.webhook_id = w.id) AS entregues`;

async function lerWebhook(webhookId, organizacaoId) {
  const [[linha]] = await pool.query(
    `SELECT ${COLUNAS_WEBHOOK} FROM webhooks w JOIN perfis_busca p ON p.id = w.perfil_id
      WHERE w.id = ? AND w.organizacao_id = ?`,
    [webhookId, organizacaoId]
  );
  return linha ? { ...linha, ativo: Boolean(linha.ativo), entregues: Number(linha.entregues) } : null;
}

async function perfilDaOrganizacao(perfilId, organizacaoId) {
  const [[perfil]] = await pool.query(
    'SELECT id, nome FROM perfis_busca WHERE id = ? AND organizacao_id = ?',
    [perfilId, organizacaoId]
  );
  return perfil || null;
}

// Os filtros que podem ter webhook: os do boletim e as pesquisas salvas do Radar.
rotas.get('/filtros', async (req, res) => {
  try {
    const [linhas] = await pool.query(
      'SELECT id, nome, origem FROM perfis_busca WHERE organizacao_id = ? ORDER BY origem, nome',
      [req.organizacaoId]
    );
    res.json({ dados: linhas });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar os filtros salvos.', erro);
  }
});

rotas.get('/webhooks', async (req, res) => {
  try {
    const [linhas] = await pool.query(
      `SELECT ${COLUNAS_WEBHOOK} FROM webhooks w JOIN perfis_busca p ON p.id = w.perfil_id
        WHERE w.organizacao_id = ? ORDER BY w.id DESC`,
      [req.organizacaoId]
    );
    res.json({ dados: linhas.map((l) => ({ ...l, ativo: Boolean(l.ativo), entregues: Number(l.entregues) })) });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar os webhooks.', erro);
  }
});

rotas.post('/webhooks', async (req, res) => {
  const corpo = req.body || {};
  let nome;
  let url;
  try {
    nome = nomeDe(corpo.nome);
    url = regras.validarUrlWebhook(corpo.url, { permitirHttp: webhookPermitirLocal });
  } catch (erro) {
    return res.status(400).json({ erro: erro.message });
  }
  const perfilId = id(corpo.perfil_id);
  if (!perfilId) return res.status(400).json({ erro: 'Escolha o filtro salvo que alimenta este webhook.' });
  try {
    if (!(await perfilDaOrganizacao(perfilId, req.organizacaoId))) {
      return res.status(404).json({ erro: 'Filtro não encontrado.' });
    }
    const sal = regras.novoSal();
    const r = await criarComLimite(
      req.organizacaoId,
      'webhooks',
      async (c) => {
        const [[{ total }]] = await c.query('SELECT COUNT(*) AS total FROM webhooks WHERE organizacao_id = ?', [req.organizacaoId]);
        return Number(total);
      },
      async (c) => {
        const [ins] = await c.query(
          'INSERT INTO webhooks (organizacao_id, perfil_id, nome, url, segredo_sal, criado_por, entregar_desde) VALUES (?, ?, ?, ?, ?, ?, NOW())',
          [req.organizacaoId, perfilId, nome, url, sal, req.usuario.id]
        );
        return ins.insertId;
      }
    );
    if (r.recusa) return res.status(402).json(r.recusa);
    return res.status(201).json({
      ...(await lerWebhook(r.resultado, req.organizacaoId)),
      segredo: regras.segredoDoWebhook(jwt.segredo, sal),
      aviso: 'Guarde o segredo agora: ele assina cada entrega e não será mostrado de novo. Se perder, gire o segredo.',
    });
  } catch (erro) {
    return responderErro(res, 500, 'Não foi possível criar o webhook.', erro);
  }
});

rotas.patch('/webhooks/:id', async (req, res) => {
  const webhookId = id(req.params.id);
  if (!webhookId) return res.status(400).json({ erro: 'Webhook inválido.' });
  const corpo = req.body || {};
  const sets = [];
  const valores = [];
  try {
    if ('nome' in corpo) {
      sets.push('nome = ?');
      valores.push(nomeDe(corpo.nome));
    }
    if ('url' in corpo) {
      sets.push('url = ?', 'falhas_seguidas = 0');
      valores.push(regras.validarUrlWebhook(corpo.url, { permitirHttp: webhookPermitirLocal }));
    }
    if ('ativo' in corpo) {
      sets.push('ativo = ?');
      valores.push(corpo.ativo ? 1 : 0);
      // Ligar de novo é um recomeço: zera a contagem que o desligou.
      if (corpo.ativo) sets.push('falhas_seguidas = 0');
    }
    if ('perfil_id' in corpo) {
      const perfilId = id(corpo.perfil_id);
      if (!perfilId || !(await perfilDaOrganizacao(perfilId, req.organizacaoId))) {
        return res.status(404).json({ erro: 'Filtro não encontrado.' });
      }
      // Outro filtro, outro começo: não despeja o que já existia no catálogo.
      sets.push('perfil_id = ?', 'entregar_desde = NOW()');
      valores.push(perfilId);
    }
  } catch (erro) {
    return res.status(400).json({ erro: erro.message });
  }
  if (!sets.length) return res.status(400).json({ erro: 'Nada para alterar.' });
  try {
    const [r] = await pool.query(
      `UPDATE webhooks SET ${[...new Set(sets)].join(', ')} WHERE id = ? AND organizacao_id = ?`,
      [...valores, webhookId, req.organizacaoId]
    );
    if (!r.affectedRows) return res.status(404).json({ erro: 'Webhook não encontrado.' });
    return res.json(await lerWebhook(webhookId, req.organizacaoId));
  } catch (erro) {
    return responderErro(res, 500, 'Não foi possível alterar o webhook.', erro);
  }
});

rotas.delete('/webhooks/:id', async (req, res) => {
  const webhookId = id(req.params.id);
  if (!webhookId) return res.status(400).json({ erro: 'Webhook inválido.' });
  try {
    const [r] = await pool.query('DELETE FROM webhooks WHERE id = ? AND organizacao_id = ?', [webhookId, req.organizacaoId]);
    if (!r.affectedRows) return res.status(404).json({ erro: 'Webhook não encontrado.' });
    return res.json({ ok: true });
  } catch (erro) {
    return responderErro(res, 500, 'Não foi possível apagar o webhook.', erro);
  }
});

// Gira o segredo: sal novo, o antigo para de valer na hora.
rotas.post('/webhooks/:id/segredo', async (req, res) => {
  const webhookId = id(req.params.id);
  if (!webhookId) return res.status(400).json({ erro: 'Webhook inválido.' });
  try {
    const sal = regras.novoSal();
    const [r] = await pool.query('UPDATE webhooks SET segredo_sal = ? WHERE id = ? AND organizacao_id = ?', [sal, webhookId, req.organizacaoId]);
    if (!r.affectedRows) return res.status(404).json({ erro: 'Webhook não encontrado.' });
    return res.json({
      segredo: regras.segredoDoWebhook(jwt.segredo, sal),
      aviso: 'Segredo novo. Atualize-o no seu sistema: as próximas entregas já saem assinadas com ele.',
    });
  } catch (erro) {
    return responderErro(res, 500, 'Não foi possível girar o segredo.', erro);
  }
});

// Envia um evento "teste" assinado, para o cliente conferir a URL e a assinatura.
rotas.post('/webhooks/:id/testar', async (req, res) => {
  const webhookId = id(req.params.id);
  if (!webhookId) return res.status(400).json({ erro: 'Webhook inválido.' });
  try {
    const [[linha]] = await pool.query('SELECT * FROM webhooks WHERE id = ? AND organizacao_id = ?', [webhookId, req.organizacaoId]);
    if (!linha) return res.status(404).json({ erro: 'Webhook não encontrado.' });
    const payload = {
      evento: 'teste',
      entrega_id: webhook.novaEntregaId(),
      gerado_em: new Date().toISOString(),
      webhook: { id: linha.id, nome: linha.nome },
      mensagem: 'Entrega de teste do painel de licitações. Se você a recebeu e a assinatura confere, está tudo certo.',
      painel: urlPublica || null,
    };
    const r = await webhook.entregar({
      webhook: linha,
      segredo: regras.segredoDoWebhook(jwt.segredo, linha.segredo_sal),
      payload,
      evento: 'teste',
    });
    return res.json({ ok: r.ok, status: r.status, detalhe: r.detalhe });
  } catch (erro) {
    return responderErro(res, 500, 'Não foi possível enviar o teste.', erro);
  }
});

module.exports = rotas;
