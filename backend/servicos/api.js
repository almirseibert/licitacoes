// Autenticação da API por token (Seção 14 do PLANO_SAAS_CONLICITACAO.md).
//
// `/api/v1/*` não usa o login do painel: o cliente cria um token na tela de
// Integrações e o manda em `Authorization: Bearer lic_…`. A API é só de leitura
// (o token entra como papel 'leitor' e a rota só tem GET).
//
// Ordem do que é conferido, do mais barato ao mais caro, e o código de cada recusa:
//   1. formato e existência do token ........ 401 (revogado e desconhecido dão a mesma resposta)
//   2. IP fora da lista do token ............. 403
//   3. limite por minuto (por token) ......... 429
//   4. assinatura da organização (suspensa) .. 402   — `assinaturaValida`, da Seção 3
//   5. plano sem o recurso `api` ............. 402   — `exigirRecurso('api')`
//   6. cota mensal de chamadas do plano ...... 429
const pool = require('../config/db');
const { responderErro } = require('../middlewares/responder-erro');
const limites = require('./limites');
const regras = require('../regras/api');
const { confiarProxy } = require('../config/ambiente');

const POR_MINUTO = 60;
const FALHAS_POR_MINUTO = regras.limiteDeFalhas(confiarProxy);
const porToken = regras.criarLimitador({ maximo: POR_MINUTO, janelaMs: 60000 });
const falhasPorIp = regras.criarLimitador({ maximo: FALHAS_POR_MINUTO, janelaMs: 60000 });

const lerLista = (valor) => {
  const v = limites.lerJson(valor, []);
  return Array.isArray(v) ? v : [];
};

function ipDe(req) {
  return regras.normalizarIp(req.ip) || String(req.ip || '');
}

function recusar(res, status, erro, extra = {}) {
  return res.status(status).json({ erro, ...extra });
}

/** Passo 1 a 3. Deixa `req.organizacaoId`, `req.papel` e `req.tokenApi` para os próximos. */
async function autenticarToken(req, res, next) {
  const ip = ipDe(req);
  try {
    const token = regras.lerBearer(req.headers.authorization);
    // Falha repetida do mesmo IP (token inventado em laço) esfria antes de tocar no banco.
    const falhou = () => {
      const r = falhasPorIp.tentar(ip);
      if (!r.ok) {
        res.set('Retry-After', String(r.esperarS));
        return recusar(res, 429, 'Muitas tentativas com token inválido. Aguarde um minuto.');
      }
      return recusar(res, 401, 'Token de API ausente, inválido ou revogado. Envie "Authorization: Bearer <token>".');
    };
    if (!token) return falhou();

    const [[linha]] = await pool.query(
      'SELECT id, organizacao_id, nome, ips_liberados, revogado_em FROM tokens_api WHERE token_hash = ?',
      [regras.hashToken(token)]
    );
    if (!linha || linha.revogado_em) return falhou();

    if (!regras.ipLiberado(lerLista(linha.ips_liberados), ip)) {
      console.warn(`API: token ${linha.id} (organização ${linha.organizacao_id}) recusado — IP ${ip} fora da lista.`);
      return recusar(res, 403, `O IP ${ip} não está na lista de IPs liberados deste token.`);
    }

    const ritmo = porToken.tentar(linha.id);
    if (!ritmo.ok) {
      res.set('Retry-After', String(ritmo.esperarS));
      return recusar(res, 429, `Limite de ${POR_MINUTO} chamadas por minuto por token. Tente de novo em ${ritmo.esperarS} s.`);
    }

    // Anotar o uso no máximo uma vez por minuto: a leitura não vira uma escrita a cada chamada.
    pool
      .query(
        `UPDATE tokens_api SET ultimo_uso = NOW(), ultimo_ip = ?
          WHERE id = ? AND (ultimo_uso IS NULL OR ultimo_uso < NOW() - INTERVAL 1 MINUTE OR ultimo_ip <> ?)`,
        [ip.slice(0, 45), linha.id, ip.slice(0, 45)]
      )
      .catch((erro) => console.error('API: não foi possível anotar o uso do token:', erro.code || erro.message));

    // `req` é desta requisição só; nenhuma outra escreve nele entre o await e aqui.
    /* eslint-disable require-atomic-updates */
    req.organizacaoId = linha.organizacao_id;
    req.papel = 'leitor';
    req.tokenApi = { id: linha.id, nome: linha.nome };
    /* eslint-enable require-atomic-updates */
    return next();
  } catch (erro) {
    return responderErro(res, 500, 'Não foi possível validar o token de API.', erro);
  }
}

/**
 * Reserva UMA chamada da cota do mês, de forma atômica: o UPDATE só conta se ainda cabe, então
 * duas chamadas ao mesmo tempo não passam juntas do teto (antes: ler e depois somar).
 * @returns {Promise<boolean>} se coube
 */
async function reservarChamada(organizacaoId, limite) {
  const mes = limites.mesDe();
  await pool.query(
    "INSERT IGNORE INTO uso_mensal (organizacao_id, mes, recurso, quantidade) VALUES (?, ?, 'api_chamadas_mes', 0)",
    [organizacaoId, mes]
  );
  const [r] = await pool.query(
    `UPDATE uso_mensal SET quantidade = quantidade + 1
      WHERE organizacao_id = ? AND mes = ? AND recurso = 'api_chamadas_mes' ${limite === null ? '' : 'AND quantidade < ?'}`,
    limite === null ? [organizacaoId, mes] : [organizacaoId, mes, limite]
  );
  return r.affectedRows > 0;
}

/** Devolve a chamada reservada (resposta 5xx: erro nosso não gasta a cota do cliente). */
function estornarChamada(organizacaoId) {
  return pool
    .query(
      "UPDATE uso_mensal SET quantidade = GREATEST(quantidade - 1, 0) WHERE organizacao_id = ? AND mes = ? AND recurso = 'api_chamadas_mes'",
      [organizacaoId, limites.mesDe()]
    )
    .catch((erro) => console.error('API: não foi possível estornar a chamada:', erro.code || erro.message));
}

/** Passo 6: a cota mensal do plano (reserva atômica; falha do servidor devolve a chamada). */
async function cotaMensal(req, res, next) {
  try {
    const dados = await limites.daOrganizacao(req.organizacaoId);
    if (!dados) return recusar(res, 401, 'Organização não encontrada para este token.');
    if (dados.isenta) return next();
    const teto = dados.plano && dados.plano.limites && 'api_chamadas_mes' in dados.plano.limites ? dados.plano.limites.api_chamadas_mes : 0;
    const limite = teto === null ? null : Number(teto);
    if (!(await reservarChamada(req.organizacaoId, limite))) {
      const [[linha]] = await pool.query(
        "SELECT quantidade FROM uso_mensal WHERE organizacao_id = ? AND mes = ? AND recurso = 'api_chamadas_mes'",
        [req.organizacaoId, limites.mesDe()]
      );
      const corpo = limites.erroLimite(dados.plano, dados.planos, 'api_chamadas_mes', { usado: linha ? Number(linha.quantidade) : 0, limite });
      res.set('Retry-After', '3600');
      return res.status(429).json(corpo);
    }
    res.on('finish', () => {
      if (res.statusCode >= 500) estornarChamada(req.organizacaoId);
    });
    if (limite === null) res.set('X-Cota-Mensal-Restante', 'ilimitada');
    else {
      const [[linha]] = await pool.query(
        "SELECT quantidade FROM uso_mensal WHERE organizacao_id = ? AND mes = ? AND recurso = 'api_chamadas_mes'",
        [req.organizacaoId, limites.mesDe()]
      );
      res.set('X-Cota-Mensal-Restante', String(Math.max(0, limite - (linha ? Number(linha.quantidade) : 0))));
    }
    return next();
  } catch (erro) {
    return responderErro(res, 500, 'Não foi possível conferir a cota da API.', erro);
  }
}

/** A pilha completa de `/api/v1`: `app.use('/api/v1', ...pilhaApi, rotas)`. */
const pilhaApi = [autenticarToken, limites.assinaturaValida, limites.exigirRecurso('api'), cotaMensal];

module.exports = { autenticarToken, cotaMensal, reservarChamada, pilhaApi, POR_MINUTO };
