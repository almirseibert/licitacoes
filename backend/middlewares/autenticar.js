// Verificação do JWT (seção 1 do PLANO_SAAS_CONLICITACAO.md).
//
// Até a Fase 15, isto reaproveitava o login do CRM atual. A partir daqui o
// painel tem login próprio e multiempresa: o token carrega quem é o usuário
// E em qual organização ele está entrando agora — um usuário pode pertencer
// a mais de uma (seção `organizacao_membros`), e o token vale para uma por
// vez. `req.usuario` guarda o payload inteiro; `req.organizacaoId` e
// `req.papel` são os dois campos que toda rota escopada por organização usa,
// nomeados à parte para não repetir `req.usuario.organizacao_id` em cada
// arquivo de rotas.
const jwt = require('jsonwebtoken');
const { jwt: cfgJwt } = require('../config/ambiente');

function autenticar(req, res, next) {
  const cabecalho = req.headers.authorization || '';
  const token = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7) : null;

  if (!token) {
    return res.status(401).json({ erro: 'Faça login para continuar.' });
  }

  try {
    const payload = jwt.verify(token, cfgJwt.segredo);
    if (!payload.organizacao_id || !payload.papel) {
      // Token de um formato antigo (pré-multiempresa) ou corrompido: pedir
      // login de novo é mais seguro do que adivinhar a organização.
      return res.status(401).json({ erro: 'Sessão inválida. Entre novamente.' });
    }
    req.usuario = payload;
    req.organizacaoId = payload.organizacao_id;
    req.papel = payload.papel;
    return next();
  } catch {
    return res.status(401).json({ erro: 'Sessão expirada. Entre novamente.' });
  }
}

// Papéis em ordem crescente de poder — 'admin' cobre o que 'membro' cobre,
// e assim por diante. 'dono' é o único que pode apagar a organização ou
// trocar o plano; os outros três participam do dia a dia.
const NIVEL_PAPEL = { leitor: 0, membro: 1, admin: 2, dono: 3 };

/**
 * Exige um papel mínimo dentro da organização do token. Uso:
 *   router.delete('/:id', autenticar, exigirPapel('admin'), handler)
 */
function exigirPapel(papelMinimo) {
  const minimo = NIVEL_PAPEL[papelMinimo] ?? 99;
  return (req, res, next) => {
    const nivel = NIVEL_PAPEL[req.papel] ?? -1;
    if (nivel < minimo) {
      return res.status(403).json({ erro: 'Esta ação exige um papel maior na organização.' });
    }
    return next();
  };
}

// Seção 1b: o token diz a organização e o papel de quando foi emitido. Sem
// conferir de novo, quem saiu da equipe (ou foi rebaixado) continuaria com o
// acesso antigo até o token vencer (8 h). A conferência lê `organizacao_membros`
// e guarda o resultado por poucos segundos — as rotas de Equipe limpam o cache
// na hora em que mudam alguém.
const VALIDADE_VINCULO_MS = 15000;
const vinculos = new Map(); // "usuario:organizacao" -> { papel, em }

function esquecerVinculo(usuarioId, organizacaoId) {
  if (usuarioId === undefined) vinculos.clear();
  else vinculos.delete(`${usuarioId}:${organizacaoId}`);
}

async function confirmarVinculo(req, res, next) {
  const chave = `${req.usuario.id}:${req.organizacaoId}`;
  const guardado = vinculos.get(chave);
  let papel = guardado && Date.now() - guardado.em < VALIDADE_VINCULO_MS ? guardado.papel : undefined;
  try {
    if (papel === undefined) {
      // Carregado aqui, não no topo: os testes deste módulo rodam sem banco.
      const pool = require('../config/db');
      const [[linha]] = await pool.query(
        `SELECT m.papel FROM organizacao_membros m JOIN usuarios u ON u.id = m.usuario_id
          WHERE m.usuario_id = ? AND m.organizacao_id = ? AND u.ativo = 1`,
        [req.usuario.id, req.organizacaoId]
      );
      papel = linha ? linha.papel : null;
      vinculos.set(chave, { papel, em: Date.now() });
    }
  } catch (erro) {
    return next(erro);
  }
  if (!papel) return res.status(401).json({ erro: 'Seu acesso a esta organização foi encerrado. Entre novamente.' });
  // O papel que vale é o de agora, não o do token. `req` é desta requisição
  // só; nenhuma outra escreve nele entre o await e aqui.
  // eslint-disable-next-line require-atomic-updates
  req.papel = papel;
  return next();
}

/**
 * O papel 'leitor' só lê (Seção 1b): toda rota de dado recusa a escrita dele
 * num ponto só, em vez de cada arquivo de rotas lembrar de pedir 'membro'.
 */
function leitorSoLe(req, res, next) {
  if (req.papel === 'leitor' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return res.status(403).json({ erro: 'Seu acesso nesta organização é só de leitura.' });
  }
  return next();
}

function apenasAdmin(req, res, next) {
  return exigirPapel('admin')(req, res, next);
}

module.exports = {
  autenticar,
  apenasAdmin,
  exigirPapel,
  leitorSoLe,
  confirmarVinculo,
  esquecerVinculo,
  NIVEL_PAPEL,
};
