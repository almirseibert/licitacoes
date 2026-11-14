// Planos e cobrança (Seção 3 do PLANO_SAAS_CONLICITACAO.md) — sem banco e sem rede.
// O que erra calado aqui: a situação da assinatura (quem perde o acesso e
// quando), a conta do limite (GB em bytes, null = sem teto), o plano sugerido
// no erro, o vencimento do próximo ciclo e a assinatura do webhook.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const limites = require('../backend/servicos/limites');
const cobranca = require('../backend/servicos/cobranca');

const PLANOS = [
  { id: 3, codigo: 'avancado', nome: 'Avançado', ordem: 3, recursos: ['radar', 'ia', 'estrategicas'], limites: { usuarios: 15, exportacoes_mes: null, cofre_gb: 20 } },
  { id: 1, codigo: 'essencial', nome: 'Essencial', ordem: 1, recursos: ['radar'], limites: { usuarios: 2, exportacoes_mes: 20, cofre_gb: 1 } },
  { id: 2, codigo: 'profissional', nome: 'Profissional', ordem: 2, recursos: ['radar', 'ia'], limites: { usuarios: 5, exportacoes_mes: 100, cofre_gb: 5 } },
];
const AGORA = new Date('2026-11-13T12:00:00Z');

test('situacao: teste dentro do prazo escreve; vencido só lê; suspensa nem lê', () => {
  const t = limites.situacao({ status: 'teste', teste_ate: '2026-11-28' }, null, AGORA);
  assert.equal(t.codigo, 'teste');
  assert.equal(t.pode_escrever, true);
  assert.equal(t.dias_restantes, 15);

  const ultimoDia = limites.situacao({ status: 'teste', teste_ate: '2026-11-13' }, null, AGORA);
  assert.equal(ultimoDia.codigo, 'teste', 'o último dia do teste ainda vale');

  const v = limites.situacao({ status: 'teste', teste_ate: '2026-11-12' }, null, AGORA);
  assert.deepEqual([v.codigo, v.pode_ler, v.pode_escrever], ['teste_vencido', true, false]);

  const s = limites.situacao({ status: 'suspensa', teste_ate: '2027-01-01' }, { pago_ate: '2027-01-01' }, AGORA);
  assert.deepEqual([s.codigo, s.pode_ler, s.pode_escrever], ['suspensa', false, false]);
});

test('situacao: ativa respeita a carência de 5 dias depois do pago_ate', () => {
  const semVencimento = limites.situacao({ status: 'ativa' }, { pago_ate: null }, AGORA);
  assert.equal(semVencimento.codigo, 'ativa');

  const naCarencia = limites.situacao({ status: 'ativa' }, { pago_ate: '2026-11-08' }, AGORA);
  assert.equal(naCarencia.codigo, 'ativa');
  assert.match(naCarencia.mensagem, /em aberto/);

  const vencida = limites.situacao({ status: 'ativa' }, { pago_ate: '2026-11-07' }, AGORA);
  assert.deepEqual([vencida.codigo, vencida.pode_ler, vencida.pode_escrever], ['vencida', true, false]);
});

test('cabe: null é sem teto, e o cofre compara em bytes', () => {
  assert.equal(limites.cabe({ exportacoes_mes: null }, 'exportacoes_mes', 10_000).ok, true);
  assert.equal(limites.cabe({}, 'tokens_api', 0).ok, false, 'limite ausente = fora do plano');
  assert.equal(limites.cabe(null, 'usuarios', 0).ok, false, 'sem plano não libera nada');
  assert.equal(limites.cabe({ usuarios: 2 }, 'usuarios', 1).ok, true);
  assert.equal(limites.cabe({ usuarios: 2 }, 'usuarios', 2).ok, false, 'o terceiro não entra');
  assert.equal(limites.cabe({ ia_resumos_mes: 0 }, 'ia_resumos_mes', 0).ok, false, 'zero bloqueia o primeiro');

  const umGb = limites.BYTES_POR_GB;
  assert.equal(limites.cabe({ cofre_gb: 1 }, 'cofre_gb', umGb - 100, 100).ok, true);
  assert.equal(limites.cabe({ cofre_gb: 1 }, 'cofre_gb', umGb - 100, 101).ok, false);
});

test('erroRecurso sugere o plano mais barato que tem o módulo', () => {
  const corpo = limites.erroRecurso(PLANOS[1], PLANOS, 'ia');
  assert.equal(corpo.upgrade.plano_sugerido, 'profissional');
  assert.match(corpo.erro, /Leitura por IA não faz parte do plano Essencial/);
  assert.match(corpo.erro, /Profissional/);
  assert.equal(limites.erroRecurso(PLANOS[2], PLANOS, 'estrategicas').upgrade.plano_sugerido, 'avancado');
});

test('erroLimite sugere quem comporta, e manda falar com o suporte no topo', () => {
  const corpo = limites.erroLimite(PLANOS[1], PLANOS, 'usuarios', { usado: 2, limite: 2 });
  assert.equal(corpo.upgrade.plano_sugerido, 'profissional');
  assert.match(corpo.erro, /permite 2 usuários na equipe e você já usa 2/);

  const noTopo = limites.erroLimite(PLANOS[0], PLANOS, 'usuarios', { usado: 15, limite: 15 });
  assert.equal(noTopo.upgrade.plano_sugerido, null);
  assert.match(noTopo.erro, /suporte/);

  const cofre = limites.erroLimite(PLANOS[1], PLANOS, 'cofre_gb', { usado: limites.BYTES_POR_GB, limite: limites.BYTES_POR_GB, acrescimo: 10 });
  assert.match(cofre.erro, /permite 1,00 GB/);
  assert.equal(cofre.upgrade.plano_sugerido, 'profissional');
});

test('temRecurso não confunde ausência de plano com permissão', () => {
  assert.equal(limites.temRecurso(null, 'radar'), false);
  assert.equal(limites.temRecurso({ recursos: ['radar'] }, 'radar'), true);
  assert.equal(limites.temRecurso({ recursos: ['radar'] }, 'ia'), false);
});

test('montarPlano lê JSON que vem como texto (MariaDB) ou objeto (MySQL 8)', () => {
  const texto = limites.montarPlano({ id: 1, codigo: 'x', recursos: '["radar"]', limites: '{"usuarios":2}' });
  const objeto = limites.montarPlano({ id: 1, codigo: 'x', recursos: ['radar'], limites: { usuarios: 2 } });
  assert.deepEqual(texto.recursos, objeto.recursos);
  assert.deepEqual(texto.limites, objeto.limites);
});

test('proximoPagoAte soma o ciclo a partir do que vence mais tarde e não pula mês', () => {
  assert.equal(cobranca.proximoPagoAte(null, 'mensal', AGORA), '2026-12-13');
  assert.equal(cobranca.proximoPagoAte(null, 'anual', AGORA), '2027-11-13');
  assert.equal(cobranca.proximoPagoAte('2026-12-20', 'mensal', AGORA), '2027-01-20', 'renovação antecipada não perde dias');
  assert.equal(cobranca.proximoPagoAte('2026-10-01', 'mensal', AGORA), '2026-12-13', 'vencido conta de hoje');
  assert.equal(cobranca.proximoPagoAte(null, 'mensal', new Date('2027-01-31T10:00:00Z')), '2027-02-28');
});

test('assinatura do webhook: só o HMAC certo do corpo cru passa', () => {
  const corpo = Buffer.from('{"id":"ev1","tipo":"pagamento_confirmado","referencia":"cli_1"}');
  const segredo = 's3gr3do';
  const certo = crypto.createHmac('sha256', segredo).update(corpo).digest('hex');
  assert.equal(cobranca.assinaturaValida(corpo, certo, segredo), true);
  assert.equal(cobranca.assinaturaValida(corpo, `sha256=${certo.toUpperCase()}`, segredo), true);
  assert.equal(cobranca.assinaturaValida(Buffer.from(`${corpo} `), certo, segredo), false, 'corpo mexido');
  assert.equal(cobranca.assinaturaValida(corpo, certo, 'outro'), false);
  assert.equal(cobranca.assinaturaValida(corpo, certo.slice(0, 10), segredo), false);
  assert.equal(cobranca.assinaturaValida(corpo, certo, ''), false, 'sem segredo, nada passa');
});
