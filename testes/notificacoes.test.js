// Seção 9 — avisos por tipo e por canal. Sem banco e sem rede: o que erra calado
// é um tipo desligado continuar chegando, o mesmo endereço receber em dobro,
// o autor ser avisado do que fez e o aviso pessoal vazar para a equipe.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const regras = require('../backend/regras/notificacoes');
const push = require('../backend/servicos/push');

const prefs = (pares) => regras.prefsDeLinhas(pares.map(([canal, tipo, ativo]) => ({ canal, tipo, ativo })));
const pessoa = (id, extra = {}) => ({ usuario_id: id, email: `p${id}@t.local`, whatsapp: null, push: [], prefs: new Map(), ...extra });

test('tipo interno de cada job cai no tipo da Seção 9', () => {
  assert.equal(regras.tipoDoAlerta('prazo_48h'), 'prazo');
  assert.equal(regras.tipoDoAlerta('prazo_2h'), 'prazo');
  assert.equal(regras.tipoDoAlerta('validade_15'), 'documento_vencendo');
  assert.equal(regras.tipoDoAlerta('validade_vencido'), 'documento_vencendo');
  assert.equal(regras.tipoDoAlerta('nova_licitacao_alta'), 'nova_oportunidade');
  assert.equal(regras.tipoDoAlerta('situacao'), 'status');
  assert.equal(regras.tipoDoAlerta('recurso'), 'recurso');
  assert.equal(regras.tipoDoAlerta('marco_contrato'), 'aviso');
  assert.equal(regras.tipoDoAlerta(null), 'aviso');
  // Todo tipo mapeado existe na matriz da tela — senão ninguém consegue desligá-lo.
  const chaves = new Set(regras.TIPOS.map((t) => t.chave));
  for (const t of ['prazo_48h', 'esclarecimento', 'impugnacao', 'reabertura', 'resultado', 'tarefa_atrasada', 'edital_alterado']) {
    assert.ok(chaves.has(regras.tipoDoAlerta(t)), t);
  }
});

test('o aceite: recurso desligado no WhatsApp, esclarecimento segue no e-mail e no WhatsApp', () => {
  const p2 = pessoa(2, { whatsapp: '5551999990002', prefs: prefs([['whatsapp', 'recurso', 0]]) });
  const envios = regras.planejarEnvios(
    [
      { id: 1, tipo: 'recurso', mensagem: 'recurso' },
      { id: 2, tipo: 'esclarecimento', mensagem: 'esclarecimento' },
    ],
    [p2]
  );
  const porCanal = Object.fromEntries(envios.map((e) => [e.canal, e.avisos.map((a) => a.id)]));
  assert.deepEqual(porCanal.email, [1, 2]);
  assert.deepEqual(porCanal.whatsapp, [2]);
});

test('linha ausente é o padrão; gravada manda', () => {
  const p = prefs([['email', 'prazo', 0], ['push', 'prazo', 1], ['email', 'nova_oportunidade', 1]]);
  assert.equal(regras.ligado(p, 'email', 'prazo'), false);
  assert.equal(regras.ligado(p, 'push', 'prazo'), true);
  assert.equal(regras.ligado(p, 'whatsapp', 'prazo'), true);
  const m = regras.matriz(p).find((t) => t.chave === 'prazo');
  assert.deepEqual(m.canais, { email: false, whatsapp: true, push: true });
  // Volume nasce desligado: nova oportunidade já vem no boletim; WhatsApp é o bolso.
  assert.equal(regras.ligado(new Map(), 'email', 'nova_oportunidade'), false);
  assert.equal(regras.ligado(new Map(), 'whatsapp', 'aviso'), false);
  assert.equal(regras.ligado(p, 'email', 'nova_oportunidade'), true);
});

test('autor não é avisado; aviso pessoal não vai à equipe nem à caixa da organização', () => {
  const caixa = { usuario_id: null, email: 'caixa@t.local', whatsapp: null, push: [], prefs: new Map() };
  const envios = regras.planejarEnvios(
    [
      { id: 1, tipo: 'recurso', mensagem: 'x', autor_id: 1 },
      { id: 2, tipo: 'tarefa_atrasada', mensagem: 'y', usuario_id: 2 },
    ],
    [pessoa(1), pessoa(2), caixa]
  );
  const de = (email) => (envios.find((e) => e.destino === email) || { avisos: [] }).avisos.map((a) => a.id);
  assert.deepEqual(de('p1@t.local'), []);
  assert.deepEqual(de('p2@t.local'), [1, 2]);
  assert.deepEqual(de('caixa@t.local'), [1]);
});

test('endereço da pessoa igual ao da caixa: um e-mail só, e quem manda é a pessoa', () => {
  const caixa = (desligar) => ({ usuario_id: null, email: 'P2@T.local', whatsapp: null, push: [], prefs: prefs(desligar) });
  const alerta = [{ id: 7, tipo: 'recurso', mensagem: 'z', autor_id: 9 }];
  // A caixa desligou, a pessoa não: chega uma vez.
  let envios = regras.planejarEnvios(alerta, [pessoa(2), caixa([['email', 'recurso', 0]])]);
  assert.equal(envios.length, 1);
  assert.deepEqual(envios[0].avisos.map((a) => a.id), [7]);
  // A pessoa desligou, a caixa não: não chega — a caixa não religa o que ela desligou.
  envios = regras.planejarEnvios(alerta, [pessoa(2, { prefs: prefs([['email', 'recurso', 0]]) }), caixa([])]);
  assert.equal(envios.length, 0);
  // A pessoa é a autora: nem pela caixa.
  envios = regras.planejarEnvios([{ ...alerta[0], autor_id: 2 }], [pessoa(2), caixa([])]);
  assert.equal(envios.length, 0);
});

test('push: um envio por navegador inscrito, só se o tipo estiver ligado', () => {
  const navegadores = [{ id: 1, endpoint: 'https://a' }, { id: 2, endpoint: 'https://b' }];
  const p = pessoa(3, { email: null, push: navegadores, prefs: prefs([['push', 'aviso', 0]]) });
  const envios = regras.planejarEnvios(
    [
      { id: 1, tipo: 'prazo_2h', mensagem: 'a' },
      { id: 2, tipo: 'edital_alterado', mensagem: 'b' },
    ],
    [p]
  );
  assert.equal(envios.length, 2);
  for (const e of envios) assert.deepEqual(e.avisos.map((a) => a.id), [1]);
});

test('preferências e destinos recusam o que não existe', () => {
  assert.ok(regras.lerPreferencias([]).erro);
  assert.ok(regras.lerPreferencias([{ canal: 'sms', tipo: 'prazo', ativo: true }]).erro);
  assert.ok(regras.lerPreferencias([{ canal: 'email', tipo: 'xyz', ativo: true }]).erro);
  assert.ok(regras.lerPreferencias([{ canal: 'email', tipo: 'prazo', ativo: 'sim' }]).erro);
  assert.deepEqual(regras.lerPreferencias([{ canal: 'email', tipo: 'prazo', ativo: false }]).itens, [
    { canal: 'email', tipo: 'prazo', ativo: false },
  ]);
  assert.ok(regras.lerDestinos({ email: 'sem-arroba' }).erro);
  assert.ok(regras.lerDestinos({ whatsapp: '1234' }).erro);
  assert.ok(regras.lerDestinos({}).erro);
  assert.deepEqual(regras.lerDestinos({ whatsapp: '+55 (51) 99999-0002', email: '' }).campos, {
    whatsapp: '5551999990002',
    email: null,
  });
});

test('modelo do WhatsApp: sem quebra de linha, tabulação nem espaço em série, e com teto', () => {
  const t = regras.textoDeModelo([{ mensagem: 'a\n\nb\tc     d' }, { mensagem: 'e' }]);
  assert.equal(t, 'a b c d | e');
  assert.ok(regras.textoDeModelo([{ mensagem: 'x'.repeat(2000) }]).length <= 900);
});

test('inscrição de push: só https de serviço de push conhecido, com as chaves do navegador', () => {
  const chaves = { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) };
  assert.ok(push.lerInscricao({ endpoint: 'http://169.254.169.254/', keys: chaves }).erro);
  assert.ok(push.lerInscricao({ endpoint: 'nada', keys: chaves }).erro);
  assert.ok(push.lerInscricao({ endpoint: 'https://10.0.0.5/admin', keys: chaves }).erro);
  assert.ok(push.lerInscricao({ endpoint: 'https://fcm.googleapis.com.mal.com/x', keys: chaves }).erro);
  assert.ok(push.lerInscricao({ endpoint: 'https://fcm.googleapis.com:8443/x', keys: chaves }).erro);
  assert.ok(push.lerInscricao({ endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/x', keys: chaves }).inscricao);
  assert.ok(push.lerInscricao({ endpoint: 'https://fcm.googleapis.com/x', keys: {} }).erro);
  assert.equal(push.lerInscricao({ endpoint: 'https://fcm.googleapis.com/x', keys: chaves }).inscricao.auth, chaves.auth);
});
