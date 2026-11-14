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

test('vendas: uma linha por serviço vinda do banco; serviço sem pedido aparece zerado', () => {
  const v = r.resumoDeVendas([
    { servico: 'seguro_garantia', interesses: '1', pedidos: '3', contratados: '2', valor: '2000.30', organizacoes: '1' },
  ]);
  const seguro = v.find((x) => x.servico === 'seguro_garantia');
  assert.deepEqual(
    { i: seguro.interesses, p: seguro.pedidos, c: seguro.contratados, o: seguro.organizacoes_contratantes, v: seguro.valor_contratado },
    { i: 1, p: 3, c: 2, o: 1, v: 2000.3 }
  );
  const cursos = v.find((x) => x.servico === 'cursos');
  assert.deepEqual([cursos.interesses, cursos.pedidos, cursos.contratados, cursos.valor_contratado], [0, 0, 0, 0]);
  assert.equal(v.length, Object.keys(r.SERVICOS).length);
  assert.equal(r.resumoDeVendas(null).length, Object.keys(r.SERVICOS).length);
});

test('rodízio: quem nunca recebeu vem primeiro; depois, o mais antigo; empate pelo cadastro', () => {
  const a = { id: 1, ultimo_pedido: '2026-11-10T10:00:00Z' };
  const b = { id: 2, ultimo_pedido: '2026-11-01T10:00:00Z' };
  const c = { id: 3, ultimo_pedido: null };
  assert.equal(r.escolherParceiro([a, b, c]).id, 3);
  assert.equal(r.escolherParceiro([a, b]).id, 2);
  assert.equal(r.escolherParceiro([{ id: 5, ultimo_pedido: null }, { id: 4, ultimo_pedido: null }]).id, 4);
  assert.equal(r.escolherParceiro([]), null);
  assert.equal(r.escolherParceiro(undefined), null);
});

test('aviso de interesse: diz que nenhum dado foi enviado e leva ao pedido com aceite', () => {
  const m = r.montarAvisoInteresse({
    servico: 'seguro_garantia', usuario: { nome: 'Ana', email: 'ana@acme.com' }, urlPublica: 'https://painel.exemplo.com.br',
  });
  assert.equal(m.para, 'ana@acme.com');
  assert.match(m.assunto, /Seguro garantia/);
  assert.doesNotMatch(m.texto, /Corretora Boa/); // o nome do parceiro é o da prévia, não o do aviso
  assert.match(m.texto, /nenhum dado seu foi enviado/);
  assert.match(m.texto, /aceite o termo/);
  assert.match(m.texto, /https:\/\/painel\.exemplo\.com\.br → Serviços/);
  assert.doesNotMatch(r.montarAvisoInteresse({ servico: 'cursos', usuario: { email: 'a@b.co' } }).texto, /undefined|null/);
});

test('protocolo: SRV e SOL usam o mesmo formato', () => {
  const sup = require('../backend/regras/suporte');
  assert.equal(r.protocolo(123, '2026-03-01T12:00:00Z'), 'SRV-2026-000123');
  assert.equal(sup.protocolo(7, '2026-03-01T12:00:00Z'), 'SOL-2026-000007');
});

test('exigências: só a garantia declara o serviço complementar (o front não adivinha pelo código)', () => {
  const { CATALOGO } = require('../backend/regras/exigencias');
  const com = CATALOGO.filter((x) => x.servico).map((x) => x.codigo);
  assert.deepEqual(com.sort(), ['garantia_contrato', 'garantia_proposta']);
  for (const x of CATALOGO.filter((i) => i.servico)) assert.ok(r.SERVICOS[x.servico], x.codigo);
});

test('auditoria: aviso aos interessados entra na trilha', () => {
  assert.equal(aud.classificar('POST', '/admin/servicos/avisar-interesses', { servico: 'cursos' }, { id: 1 }).acao, 'avisou_interessados');
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
