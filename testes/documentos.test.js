// Seção 10 (plano SaaS): onde erra calado — o grupo do documento divergir do
// checklist, a revisão de 90 dias que nunca dispara (ou dispara para o que tem
// validade), "emitir" virar link para texto livre, e a agenda de portais que
// aceita um campo de senha e some com ele calada.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const d = require('../backend/regras/documentos');
const p = require('../backend/regras/portais');
const modelos = require('../backend/config/dados/modelos-declaracao');

test('grupo sai do catálogo de exigências; código desconhecido vai para "outros"', () => {
  assert.equal(d.grupoDoCodigo('federal'), 'regularidade');
  assert.equal(d.grupoDoCodigo('ato_constitutivo'), 'juridica');
  assert.equal(d.grupoDoCodigo('atestado'), 'tecnica');
  assert.equal(d.grupoDoCodigo('balanco'), 'economica');
  assert.equal(d.grupoDoCodigo('menor'), 'outros');
  assert.equal(d.grupoDoCodigo('inventado'), 'outros');
  assert.deepEqual(d.GRUPOS.map((g) => g.chave), ['juridica', 'regularidade', 'tecnica', 'economica', 'outros']);
});

test('revisão de 90 dias: só sem validade, conta da última conferência', () => {
  const sem = { valido_ate: null, criado_em: new Date('2026-08-16T15:00:00Z'), revisado_em: null };
  assert.equal(d.revisao(sem, '2026-11-13').devida, false); // 89 dias
  assert.equal(d.revisao(sem, '2026-11-14').devida, true); // 90 dias
  assert.equal(d.revisao({ ...sem, revisado_em: '2026-11-01' }, '2026-11-14').devida, false);
  assert.equal(d.revisao({ ...sem, valido_ate: '2027-01-01' }, '2026-11-14'), null);
  // Criado às 22h de Brasília (01h UTC do dia seguinte) conta o dia de Brasília.
  assert.equal(d.revisao({ valido_ate: null, criado_em: new Date('2026-08-17T01:00:00Z') }, '2026-11-14').base, '2026-08-16');
});

test('situação: pendente (vencido ou sem arquivo), vencendo (30 dias ou revisão), disponível', () => {
  const agora = new Date('2026-11-14T12:00:00Z');
  const hoje = '2026-11-14';
  const base = { arquivo_path: 'x.pdf', criado_em: new Date('2026-11-01T12:00:00Z') };
  assert.equal(d.situacao({ ...base, arquivo_path: null }, agora, hoje).situacao, 'pendente');
  assert.equal(d.situacao({ ...base, valido_ate: '2026-11-10' }, agora, hoje).situacao, 'pendente');
  assert.equal(d.situacao({ ...base, valido_ate: '2026-11-30' }, agora, hoje).situacao, 'vencendo');
  assert.equal(d.situacao({ ...base, valido_ate: '2027-06-01' }, agora, hoje).situacao, 'disponivel');
  assert.equal(d.situacao({ ...base, valido_ate: null }, agora, hoje).situacao, 'disponivel');
  const velho = d.situacao({ ...base, valido_ate: null, criado_em: new Date('2026-07-01T12:00:00Z') }, agora, hoje);
  assert.equal(velho.situacao, 'vencendo');
  assert.match(velho.motivo, /revisar/);
});

test('"emitir" só vira link para https; instrução em texto fica texto', () => {
  assert.equal(d.linkDeEmissao('https://consulta-crf.caixa.gov.br'), 'https://consulta-crf.caixa.gov.br');
  assert.equal(d.linkDeEmissao('site da Sefaz do seu estado'), null);
  assert.equal(d.linkDeEmissao('javascript:alert(1)'), null);
  assert.equal(d.linkDeEmissao('http://inseguro.gov.br'), null);
});

test('agenda de portais recusa campo de login ou senha (e qualquer outro fora da lista), e valida o resto', () => {
  for (const campo of ['senha', 'login', 'usuario', 'password', 'token', 'qualquer']) {
    assert.match(p.validar({ nome: 'X', [campo]: 'segredo' }).erro, /não guarda login nem senha/);
  }
  assert.equal(p.validar({ nome: 'X', login_vence_em: '2027-01-01' }).campos.login_vence_em, '2027-01-01');
  assert.ok(p.validar({ nome: '' }).erro);
  assert.ok(p.validar({ nome: 'X', url: 'javascript:alert(1)' }).erro);
  assert.ok(p.validar({ nome: 'X', tipo: 'banco' }).erro);
  assert.ok(p.validar({ nome: 'X', login_vence_em: '2027-02-30' }).erro);
  assert.equal(p.validar({ nome: 'X', login_vence_em: '' }).campos.login_vence_em, null);
  assert.deepEqual(Object.keys(p.validar({ tipo: 'outro' }, { parcial: true }).campos), ['tipo']);
  assert.ok(p.validar({}, { parcial: true }).erro);
});

test('situação do portal: vencido, hoje, 30 dias, folgado, sem data', () => {
  assert.equal(p.situacao('2026-11-10', '2026-11-14').cor, 'vermelho');
  assert.equal(p.situacao('2026-11-14', '2026-11-14').cor, 'vermelho');
  assert.equal(p.situacao('2026-12-14', '2026-11-14').cor, 'amarelo');
  assert.equal(p.situacao('2026-12-15', '2026-11-14').cor, 'verde');
  assert.equal(p.situacao(null, '2026-11-14').cor, 'cinza');
});

test('marco do portal é o já cruzado, para não perder aviso se o worker parar um dia', () => {
  assert.equal(p.marco(31), null);
  assert.equal(p.marco(30), '30');
  assert.equal(p.marco(16), '30');
  assert.equal(p.marco(15), '15');
  assert.equal(p.marco(4), '15');
  assert.equal(p.marco(3), '3');
  assert.equal(p.marco(0), '0');
  assert.equal(p.marco(-2), 'vencido');
  assert.equal(p.marco(null), null);
});

test('declarações: 13 modelos, códigos únicos, com renúncia de vistoria e carta de credenciamento', () => {
  assert.equal(modelos.length, 13);
  assert.equal(new Set(modelos.map((m) => m.codigo)).size, 13);
  for (const c of ['renuncia_vistoria', 'carta_credenciamento']) {
    const m = modelos.find((x) => x.codigo === c);
    assert.ok(m && m.corpo.includes('{{razao_social}}') && m.corpo.includes('{{numero_licitacao}}'));
  }
});
