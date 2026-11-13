// Cobrança (Seção 3 do PLANO_SAAS_CONLICITACAO.md).
//
// Provedor inicial: 'manual' — o cliente pede o plano pela tela de Assinatura
// e o administrador da Studio Mythos ativa pelo painel de Organizações depois
// de receber (Pix, boleto, transferência). O gateway (Asaas ou Stripe) ainda
// não foi escolhido: o webhook já existe, valida assinatura HMAC do corpo cru e
// chama `processarEventoGateway`, que é o mesmo caminho da ativação manual.
// Quando o gateway for escolhido, só a tradução do payload dele para o formato
// normalizado abaixo é escrita — a regra de negócio não muda.
const crypto = require('crypto');
const limites = require('./limites');
const { dataFimTeste } = require('../config/organizacao');

const CICLOS = ['mensal', 'anual'];
const db = () => require('../config/db');

// ------------------------------------------------------------------- puro

/** Próximo `pago_ate`: soma o período a partir do que vence mais tarde — hoje ou o já pago. */
function proximoPagoAte(pagoAteAtual, ciclo, agora = new Date()) {
  const hoje = agora.toISOString().slice(0, 10);
  const base = pagoAteAtual && String(pagoAteAtual).slice(0, 10) > hoje ? String(pagoAteAtual).slice(0, 10) : hoje;
  const d = new Date(`${base}T00:00:00Z`);
  const meses = ciclo === 'anual' ? 12 : 1;
  const diaOriginal = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + meses);
  // 31/01 + 1 mês = 28/02 (ou 29), nunca 03/03.
  const ultimoDia = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(diaOriginal, ultimoDia));
  return d.toISOString().slice(0, 10);
}

/**
 * Confere a assinatura do webhook: HMAC-SHA256 do corpo cru, em hex, no
 * cabeçalho `X-Assinatura`. Comparação em tempo constante.
 */
function assinaturaValida(corpoBruto, assinatura, segredo) {
  if (!segredo || !assinatura || !corpoBruto) return false;
  const esperado = crypto.createHmac('sha256', segredo).update(corpoBruto).digest('hex');
  const recebido = String(assinatura).trim().toLowerCase().replace(/^sha256=/, '');
  if (recebido.length !== esperado.length) return false;
  return crypto.timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado));
}

// ------------------------------------------------------------------ banco

async function registrarEvento(conexao, { organizacaoId, provedor = 'manual', eventoExterno = null, tipo, dados = null, usuarioId = null }) {
  await conexao.query(
    `INSERT INTO assinatura_eventos (organizacao_id, provedor, evento_externo, tipo, dados, usuario_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [organizacaoId, provedor, eventoExterno, tipo, dados ? JSON.stringify(dados) : null, usuarioId]
  );
}

async function planoPorCodigo(codigo) {
  const planos = await limites.listarPlanos();
  return planos.find((p) => p.codigo === codigo) || null;
}

/** Cria a assinatura do teste grátis de uma organização nova (cadastro). */
async function abrirTeste(conexao, organizacaoId) {
  await conexao.query(
    `INSERT INTO assinaturas (organizacao_id, plano_id, ciclo, provedor)
     SELECT ?, id, 'mensal', 'manual' FROM planos WHERE codigo = 'avancado'`,
    [organizacaoId]
  );
  await registrarEvento(conexao, { organizacaoId, tipo: 'teste_iniciado', dados: { ate: dataFimTeste() } });
}

/** Executa `fn(conexao)` numa transação e limpa o cache da organização. */
async function emTransacao(organizacaoId, fn) {
  const conexao = await db().getConnection();
  try {
    await conexao.beginTransaction();
    const r = await fn(conexao);
    await conexao.commit();
    return r;
  } catch (erro) {
    await conexao.rollback();
    throw erro;
  } finally {
    conexao.release();
    limites.esquecer(organizacaoId);
  }
}

function erroUso(mensagem) {
  const e = new Error(mensagem);
  e.status = 400;
  return e;
}

/**
 * Ativa (ou renova) um plano. Usado pelo administrador (manual) e pelo
 * webhook do gateway. `pagoAte` explícito vence o cálculo pelo ciclo.
 */
async function ativar({ organizacaoId, planoCodigo, ciclo = 'mensal', pagoAte = null, usuarioId = null, provedor = 'manual', eventoExterno = null, agora = new Date() }) {
  const plano = await planoPorCodigo(planoCodigo);
  if (!plano) throw erroUso('Plano desconhecido.');
  if (!CICLOS.includes(ciclo)) throw erroUso('Ciclo inválido. Use mensal ou anual.');

  return emTransacao(organizacaoId, async (conexao) => {
    const [[atual]] = await conexao.query(
      'SELECT pago_ate FROM assinaturas WHERE organizacao_id = ? FOR UPDATE',
      [organizacaoId]
    );
    const [org] = await conexao.query('UPDATE organizacoes SET status = ? WHERE id = ?', ['ativa', organizacaoId]);
    if (!org.affectedRows) throw Object.assign(new Error('Organização não encontrada.'), { status: 404 });

    const novoPagoAte = pagoAte || proximoPagoAte(atual && atual.pago_ate, ciclo, agora);
    await conexao.query(
      `INSERT INTO assinaturas (organizacao_id, plano_id, ciclo, pago_ate, provedor)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE plano_id = VALUES(plano_id), ciclo = VALUES(ciclo), pago_ate = VALUES(pago_ate),
         provedor = VALUES(provedor), plano_pedido_id = NULL, ciclo_pedido = NULL, pedido_em = NULL`,
      [organizacaoId, plano.id, ciclo, novoPagoAte, provedor]
    );
    await registrarEvento(conexao, {
      organizacaoId, provedor, eventoExterno, usuarioId,
      tipo: 'plano_ativado',
      dados: { plano: plano.codigo, ciclo, pago_ate: novoPagoAte },
    });
    return { plano: plano.codigo, ciclo, pago_ate: novoPagoAte };
  });
}

async function mudarStatus({ organizacaoId, status, tipo, dados = null, usuarioId = null, testeAte }) {
  return emTransacao(organizacaoId, async (conexao) => {
    const [r] = testeAte
      ? await conexao.query('UPDATE organizacoes SET status = ?, teste_ate = ? WHERE id = ?', [status, testeAte, organizacaoId])
      : await conexao.query('UPDATE organizacoes SET status = ? WHERE id = ?', [status, organizacaoId]);
    if (!r.affectedRows) throw Object.assign(new Error('Organização não encontrada.'), { status: 404 });
    await registrarEvento(conexao, { organizacaoId, tipo, dados, usuarioId });
    return { status };
  });
}

function suspender({ organizacaoId, motivo, usuarioId }) {
  return mudarStatus({ organizacaoId, status: 'suspensa', tipo: 'suspensa', dados: { motivo: motivo || null }, usuarioId });
}

/** Volta a 'ativa' se já pagou alguma vez; senão, volta ao teste que tinha. */
async function reativar({ organizacaoId, usuarioId }) {
  const [[a]] = await db().query('SELECT pago_ate FROM assinaturas WHERE organizacao_id = ?', [organizacaoId]);
  return mudarStatus({ organizacaoId, status: a && a.pago_ate ? 'ativa' : 'teste', tipo: 'reativada', usuarioId });
}

function estenderTeste({ organizacaoId, dias, usuarioId, agora = new Date() }) {
  const n = Number(dias);
  if (!Number.isInteger(n) || n < 1 || n > 90) throw erroUso('Informe de 1 a 90 dias.');
  const ate = limites.somarDias(agora.toISOString().slice(0, 10), n);
  return mudarStatus({ organizacaoId, status: 'teste', tipo: 'teste_estendido', dados: { ate }, usuarioId, testeAte: ate });
}

/** O cliente pede um plano pela tela; com o provedor manual, o administrador ativa. */
async function pedirPlano({ organizacaoId, planoCodigo, ciclo, usuarioId }) {
  const plano = await planoPorCodigo(planoCodigo);
  if (!plano) throw erroUso('Plano desconhecido.');
  if (!CICLOS.includes(ciclo)) throw erroUso('Ciclo inválido. Use mensal ou anual.');
  return emTransacao(organizacaoId, async (conexao) => {
    await conexao.query(
      'UPDATE assinaturas SET plano_pedido_id = ?, ciclo_pedido = ?, pedido_em = NOW() WHERE organizacao_id = ?',
      [plano.id, ciclo, organizacaoId]
    );
    await registrarEvento(conexao, { organizacaoId, tipo: 'plano_pedido', dados: { plano: plano.codigo, ciclo }, usuarioId });
    return { plano: plano.codigo, ciclo };
  });
}

/**
 * Evento já normalizado do gateway:
 *   { id, tipo: 'pagamento_confirmado'|'assinatura_cancelada', referencia,
 *     plano?, ciclo?, pago_ate? }
 * `referencia` é a `assinaturas.referencia_externa` (o id do cliente no gateway).
 * Idempotente: o mesmo `id` duas vezes é aceito e ignorado.
 */
async function processarEventoGateway(provedor, evento) {
  if (!evento || !evento.id || !evento.tipo || !evento.referencia) throw erroUso('Evento incompleto.');
  if (evento.pago_ate && !/^\d{4}-\d{2}-\d{2}$/.test(String(evento.pago_ate))) throw erroUso('pago_ate precisa ser AAAA-MM-DD.');
  const [[a]] = await db().query(
    `SELECT a.organizacao_id, p.codigo AS plano, a.ciclo FROM assinaturas a JOIN planos p ON p.id = a.plano_id
      WHERE a.provedor = ? AND a.referencia_externa = ?`,
    [provedor, String(evento.referencia)]
  );
  const [[repetido]] = await db().query(
    'SELECT id FROM assinatura_eventos WHERE provedor = ? AND evento_externo = ?',
    [provedor, String(evento.id)]
  );
  if (repetido) return { repetido: true };
  if (!a) {
    await registrarEvento(db(), { organizacaoId: null, provedor, eventoExterno: String(evento.id), tipo: 'sem_organizacao', dados: evento });
    return { ignorado: 'referência sem organização' };
  }
  if (evento.tipo === 'pagamento_confirmado') {
    return ativar({
      organizacaoId: a.organizacao_id,
      planoCodigo: evento.plano || a.plano,
      ciclo: evento.ciclo || a.ciclo,
      pagoAte: evento.pago_ate || null,
      provedor,
      eventoExterno: String(evento.id),
    });
  }
  if (evento.tipo === 'assinatura_cancelada') {
    return emTransacao(a.organizacao_id, async (conexao) => {
      await conexao.query('UPDATE organizacoes SET status = ? WHERE id = ?', ['suspensa', a.organizacao_id]);
      await registrarEvento(conexao, { organizacaoId: a.organizacao_id, provedor, eventoExterno: String(evento.id), tipo: 'cancelada', dados: evento });
      return { status: 'suspensa' };
    });
  }
  await registrarEvento(db(), { organizacaoId: a.organizacao_id, provedor, eventoExterno: String(evento.id), tipo: 'ignorado', dados: evento });
  return { ignorado: evento.tipo };
}

module.exports = {
  CICLOS,
  proximoPagoAte,
  assinaturaValida,
  abrirTeste,
  ativar,
  suspender,
  reativar,
  estenderTeste,
  pedirPlano,
  processarEventoGateway,
};
