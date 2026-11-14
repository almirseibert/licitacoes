// Serviços complementares por parceria (Seção 18). O que erra calado: mandar dado a parceiro
// sem o aceite da versão vigente, inventar valor que falta em vez de mostrar a lacuna,
// avançar pedido de "interesse" (que nunca teve consentimento) e dizer "vendido" sem valor.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const r = require('../backend/regras/servicos');
const aud = require('../backend/regras/auditoria');
const { LACUNA } = require('../backend/config/dados/legal');

test('pedido: serviço inválido e mensagem comprida são recusados em português', () => {
  assert.match(r.validarPedido({ servico: 'vale_tudo' }).erro, /Serviço inválido/);
  assert.match(r.validarPedido({ servico: 'cursos', mensagem: 'x'.repeat(1001) }).erro, /1000 letras/);
  assert.equal(r.validarPedido({ servico: 'seguro_garantia', licitacao_id: 'abc' }).erro, 'Licitação inválida.');
  assert.equal(r.validarPedido({ servico: 'seguro_garantia', licitacao_id: -3 }).erro, 'Licitação inválida.');
});

test('pedido: licitação só vale no serviço que a usa', () => {
  assert.equal(r.validarPedido({ servico: 'seguro_garantia', licitacao_id: '12' }).dados.licitacaoId, 12);
  assert.equal(r.validarPedido({ servico: 'cursos', licitacao_id: '12' }).dados.licitacaoId, null);
});

test('aceite: só a versão vigente do termo vale', () => {
  assert.equal(r.aceiteValido(r.VERSAO_TERMO_PARCEIRO), true);
  assert.equal(r.aceiteValido('2020-01-01'), false);
  assert.equal(r.aceiteValido(''), false);
  assert.equal(r.aceiteValido(true), false);
});

test('dados ao parceiro: o mínimo, e o que falta fica null (nunca inventado)', () => {
  const d = r.montarDados({
    servico: 'seguro_garantia',
    empresa: { razao_social: 'ACME Ltda', cnpj: '', natureza: 'EPP', cpf_representante: '123', receita_12m: 9 },
    usuario: { nome: 'Ana', email: 'ana@acme.com', senha_hash: 'x' },
    licitacao: { orgao_nome: 'Prefeitura', objeto: 'y'.repeat(900), valor_estimado: null, pontuacao: 90 },
    garantias: { proposta: true, contrato: null },
  });
  assert.equal(d.empresa.cnpj, null);
  assert.equal(d.licitacao.valor_estimado, null);
  assert.equal(d.licitacao.objeto.length, 600);
  assert.deepEqual(d.garantia_exigida, { proposta: true, contrato: null });
  const json = JSON.stringify(d);
  for (const proibido of ['cpf_representante', 'receita_12m', 'senha_hash', 'pontuacao']) assert.ok(!json.includes(proibido), proibido);
});

test('dados ao parceiro: serviço sem licitação não leva campo de licitação', () => {
  const d = r.montarDados({ servico: 'cursos', empresa: {}, usuario: {}, mensagem: 'oi' });
  assert.equal('licitacao' in d, false);
  assert.equal('garantia_exigida' in d, false);
});

test('garantias: indefinido e ausente são "não sei" (null), não "não exige"', () => {
  assert.deepEqual(r.garantiasDasExigencias([]), { proposta: null, contrato: null });
  assert.deepEqual(
    r.garantiasDasExigencias([{ codigo: 'garantia_proposta', detectado: 'sim' }, { codigo: 'garantia_contrato', detectado: 'indefinido' }]),
    { proposta: true, contrato: null }
  );
  assert.equal(r.garantiasDasExigencias([{ codigo: 'garantia_contrato', detectado: 'negado' }]).contrato, false);
});

test('e-mail: lacuna visível, protocolo, resposta direto ao cliente, termo citado', () => {
  const dados = r.montarDados({ servico: 'seguro_garantia', empresa: { razao_social: 'ACME' }, usuario: { nome: 'Ana', email: 'ana@acme.com' }, licitacao: null });
  const e = r.montarEmail({
    pedido: { id: 7, servico: 'seguro_garantia', criado_em: new Date('2026-11-14T12:00:00'), termo_versao: r.VERSAO_TERMO_PARCEIRO },
    parceiro: { nome: 'Corretora X', email_pedidos: 'x@corretora.com' },
    dados,
  });
  assert.equal(e.para, 'x@corretora.com');
  assert.equal(e.responderPara, 'ana@acme.com');
  assert.match(e.assunto, /SRV-2026-000007/);
  assert.ok(e.texto.includes(`CNPJ: ${LACUNA}`));
  assert.ok(e.texto.includes('Licitação: Não informada'));
  assert.ok(e.texto.includes(r.VERSAO_TERMO_PARCEIRO));
});

test('status inicial: sem parceiro é só interesse; com parceiro depende de o e-mail ter saído', () => {
  assert.equal(r.statusInicial({ temParceiro: false, emailEnviado: false }), 'interesse');
  assert.equal(r.statusInicial({ temParceiro: false, emailEnviado: true }), 'interesse');
  assert.equal(r.statusInicial({ temParceiro: true, emailEnviado: true }), 'encaminhado');
  assert.equal(r.statusInicial({ temParceiro: true, emailEnviado: false }), 'solicitado');
});

test('operadora: interesse nunca avança; contratado exige valor; valor só em contratado', () => {
  assert.match(r.validarAtualizacao({ status: 'encaminhado' }, { status: 'interesse' }).erro, /não vai para/);
  assert.match(r.validarAtualizacao({ status: 'em_atendimento' }, { status: 'contratado' }).erro, /não vai para/);
  assert.match(r.validarAtualizacao({ status: 'contratado' }, { status: 'encaminhado' }).erro, /valor contratado/);
  assert.match(r.validarAtualizacao({ status: 'contratado', valor_contratado: -1 }, { status: 'encaminhado' }).erro, /inválido/);
  assert.match(r.validarAtualizacao({ valor_contratado: 100 }, { status: 'encaminhado' }).erro, /só vale/);
  assert.deepEqual(r.validarAtualizacao({ status: 'contratado', valor_contratado: '1234.567' }, { status: 'encaminhado' }).dados, { status: 'contratado', valor_contratado: 1234.57 });
  assert.deepEqual(r.validarAtualizacao({ observacao: ' ligar ' }, { status: 'encaminhado' }).dados, { observacao: 'ligar' });
});

test('parceiro: e-mail e site precisam ser válidos', () => {
  assert.match(r.validarParceiro({ servico: 'cursos', nome: 'A', email_pedidos: 'sem-arroba' }).erro, /E-mail/);
  assert.match(r.validarParceiro({ servico: 'cursos', nome: 'A', email_pedidos: 'a@b.co', site: 'javascript:alert(1)' }).erro, /http/);
  assert.equal(r.validarParceiro({ servico: 'cursos', nome: ' A  B ', email_pedidos: 'a@b.co' }).dados.nome, 'A B');
  assert.deepEqual(r.validarParceiro({ ativo: 0 }, true).dados, { ativo: 0 });
});

test('vendas: interesse e cancelado não contam como pedido; valor soma só o contratado', () => {
  const v = r.resumoDeVendas([
    { servico: 'seguro_garantia', status: 'interesse', organizacao_id: 1 },
    { servico: 'seguro_garantia', status: 'cancelado', organizacao_id: 1 },
    { servico: 'seguro_garantia', status: 'encaminhado', organizacao_id: 2 },
    { servico: 'seguro_garantia', status: 'contratado', organizacao_id: 3, valor_contratado: '1500.10' },
    { servico: 'seguro_garantia', status: 'contratado', organizacao_id: 3, valor_contratado: '500.20' },
    { servico: 'cursos', status: 'contratado', organizacao_id: 4, valor_contratado: null },
  ]);
  const seguro = v.find((x) => x.servico === 'seguro_garantia');
  assert.deepEqual(
    { i: seguro.interesses, p: seguro.pedidos, c: seguro.contratados, o: seguro.organizacoes_contratantes, v: seguro.valor_contratado },
    { i: 1, p: 3, c: 2, o: 1, v: 2000.3 }
  );
  assert.equal(v.find((x) => x.servico === 'cursos').valor_contratado, 0);
});

test('auditoria: pedir e cancelar serviço entram na trilha, sem a mensagem do cliente', () => {
  const a = aud.classificar('POST', '/servicos/pedidos', { servico: 'seguro_garantia', mensagem: 'texto privado', aceite_termo: 'x' }, { id: 9 });
  assert.equal(a.acao, 'pediu_servico');
  assert.deepEqual(a.detalhe, { servico: 'seguro_garantia' });
  assert.equal(aud.classificar('POST', '/servicos/pedidos/9/cancelar').entidade_id, '9');
});

test('auditoria: ações da operadora (parceiro, andamento, reenvio) entram na trilha, sem valor nem e-mail', () => {
  assert.equal(aud.classificar('POST', '/admin/parceiros', { email_pedidos: 'x@y.com' }, { id: 4 }).acao, 'cadastrou_parceiro');
  assert.deepEqual(aud.classificar('PATCH', '/admin/parceiros/4', { ativo: false, email_pedidos: 'x@y.com' }).detalhe, { ativo: false });
  const a = aud.classificar('POST', '/admin/servicos/pedidos/9', { status: 'contratado', valor_contratado: 5000 });
  assert.equal(a.acao, 'atualizou_pedido_servico');
  assert.deepEqual(a.detalhe, { status: 'contratado' });
  assert.equal(aud.classificar('POST', '/admin/servicos/pedidos/9/reenviar').acao, 'reenviou_pedido_servico');
});
