// Trilha de auditoria (Seção 17): grava quem fez o quê. A decisão do que se
// audita mora em regras/auditoria.js; aqui só há o banco e o middleware.
const pool = require('../config/db');
const regras = require('../regras/auditoria');

/**
 * Grava uma linha. NUNCA derruba a requisição: a trilha é secundária ao que o
 * usuário pediu, então falha vira log. `usuario` = { id, nome } (como no JWT).
 */
async function registrar({ organizacaoId, usuario = null, acao, entidade, entidadeId = null, detalhe = null, ip = null }) {
  if (!organizacaoId) return;
  try {
    await pool.query(
      `INSERT INTO auditoria (organizacao_id, usuario_id, usuario_nome, acao, entidade, entidade_id, detalhe, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        organizacaoId,
        usuario ? usuario.id || null : null,
        usuario && usuario.nome ? String(usuario.nome).slice(0, 160) : null,
        acao,
        entidade,
        entidadeId === null || entidadeId === undefined ? null : String(entidadeId).slice(0, 40),
        detalhe ? JSON.stringify(detalhe) : null,
        ip ? String(ip).slice(0, 45) : null,
      ]
    );
  } catch (erro) {
    console.error('Auditoria: não gravou', acao, '—', erro.message);
  }
}

/** Atalho para quem já tem `req` (autenticada). */
const registrarDaRequisicao = (req, acao, entidade, entidadeId, detalhe) =>
  registrar({ organizacaoId: req.organizacaoId, usuario: req.usuario, acao, entidade, entidadeId, detalhe, ip: req.ip });

/**
 * Middleware global de `/api`: depois que a resposta sai, se deu certo e a regra
 * reconhece a rota, grava. Guarda a resposta JSON para pegar o id de quem foi criado.
 * Roda antes do `autenticar` na pilha, mas só lê `req.usuario` no fim da resposta.
 */
function middleware(req, res, next) {
  if (!regras.reconhece(req.method, req.originalUrl.replace(/^\/api/, ''))) return next();

  let corpoResposta;
  const jsonOriginal = res.json.bind(res);
  res.json = (corpo) => {
    corpoResposta = corpo;
    return jsonOriginal(corpo);
  };

  res.on('finish', () => {
    if (res.statusCode >= 400 || !req.organizacaoId || !req.usuario) return;
    const caminho = req.originalUrl.replace(/^\/api/, '');
    const alvo = regras.classificar(req.method, caminho, req.body, corpoResposta);
    if (!alvo) return;
    registrar({
      organizacaoId: req.organizacaoId,
      usuario: req.usuario,
      acao: alvo.acao,
      entidade: alvo.entidade,
      entidadeId: alvo.entidade_id,
      detalhe: alvo.detalhe,
      ip: req.ip,
    });
  });
  next();
}

module.exports = { registrar, registrarDaRequisicao, middleware };
