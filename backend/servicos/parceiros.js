// Parceiros dos serviços complementares (Seção 18): quem atende agora e o aviso a quem
// registrou interesse quando o parceiro surge. Usado pelas rotas do cliente e da operadora.
const pool = require('../config/db');
const email = require('./email');
const { urlPublica } = require('../config/ambiente');
const regras = require('../regras/servicos');
const { emParalelo } = require('./paralelo');

/** Parceiros ativos (de um serviço ou de todos) com o último pedido recebido, para o rodízio. */
async function parceirosAtivos(servico) {
  const [linhas] = await pool.query(
    `SELECT p.id, p.servico, p.nome, p.email_pedidos, p.site,
            (SELECT MAX(s.criado_em) FROM servico_pedidos s WHERE s.parceiro_id = p.id) AS ultimo_pedido
       FROM parceiros p WHERE p.ativo = 1 ${servico ? 'AND p.servico = ?' : ''} ORDER BY p.id`,
    servico ? [servico] : []
  );
  return linhas;
}

/** Parceiro que atende o serviço agora: o rodízio entre os ativos (ver `regras.escolherParceiro`). */
async function parceiroAtivo(servico) {
  return regras.escolherParceiro(await parceirosAtivos(servico));
}

const AVISOS_EM_PARALELO = 5;

/**
 * Avisa por e-mail quem registrou interesse no serviço que agora há parceiro. Um e-mail por
 * pessoa; só marca `avisado_em` quando o e-mail saiu (sem SMTP o aviso fica pendente e a operadora
 * repete depois). Não envia dado de ninguém ao parceiro: o interesse continua só registrado.
 * @returns {{ avisados:number, sem_envio:number }} pessoas avisadas e pessoas que ficaram pendentes
 */
async function avisarInteressados(servico) {
  if (!(await parceirosAtivos(servico)).length) return { avisados: 0, sem_envio: 0 };
  const [linhas] = await pool.query(
    `SELECT p.id, p.usuario_id, u.nome, u.email
       FROM servico_pedidos p
       JOIN usuarios u ON u.id = p.usuario_id AND u.ativo = 1
       JOIN organizacao_membros m ON m.organizacao_id = p.organizacao_id AND m.usuario_id = p.usuario_id
       JOIN organizacoes o ON o.id = p.organizacao_id AND o.status <> 'suspensa'
      WHERE p.servico = ? AND p.status = 'interesse' AND p.avisado_em IS NULL`,
    [servico]
  );
  const pessoas = new Map();
  for (const l of linhas) {
    if (!pessoas.has(l.usuario_id)) pessoas.set(l.usuario_id, { usuario: { nome: l.nome, email: l.email }, ids: [] });
    pessoas.get(l.usuario_id).ids.push(l.id);
  }
  let avisados = 0;
  let semEnvio = 0;
  // Vários e-mails ao mesmo tempo (até 5): cem interessados não seguram a requisição da operadora
  // por cem idas e voltas ao SMTP, uma depois da outra.
  await emParalelo([...pessoas.values()], AVISOS_EM_PARALELO, async ({ usuario, ids }) => {
    // Reserva antes de enviar: dois cliques na operadora não mandam o aviso duas vezes.
    const [reserva] = await pool.query('UPDATE servico_pedidos SET avisado_em = NOW() WHERE id IN (?) AND avisado_em IS NULL', [ids]);
    if (!reserva.affectedRows) return;
    let enviado = false;
    try {
      ({ enviado } = await email.enviarTransacional(regras.montarAvisoInteresse({ servico, usuario, urlPublica })));
    } catch (erro) {
      console.error('Aviso de interesse não saiu:', erro.message);
    }
    if (enviado) {
      avisados += 1;
    } else {
      // Sem envio a reserva é desfeita: a pessoa continua pendente e a operadora repete o aviso depois.
      semEnvio += 1;
      await pool.query('UPDATE servico_pedidos SET avisado_em = NULL WHERE id IN (?)', [ids]).catch((erro) => console.error('Não desfez a reserva do aviso:', erro.message));
    }
  });
  return { avisados, sem_envio: semEnvio };
}

module.exports = { parceirosAtivos, parceiroAtivo, avisarInteressados };
