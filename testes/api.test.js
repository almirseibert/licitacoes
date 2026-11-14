// Seção 14: o que erra calado na API por token e no webhook — sem banco e sem rede.
const test = require('node:test');
const assert = require('node:assert/strict');
const r = require('../backend/regras/api');

test('token: formato, hash e prefixo; o texto puro nunca é o hash', () => {
  const a = r.gerarToken();
  const b = r.gerarToken();
  assert.match(a.token, /^lic_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a.token, b.token);
  assert.equal(a.hash, r.hashToken(a.token));
  assert.equal(a.hash.length, 64);
  assert.ok(!a.hash.includes(a.token.slice(4)), 'o hash não contém o token');
  assert.equal(a.prefixo, a.token.slice(4, 12));
});

test('Bearer: só aceita o formato do token; lixo vira null', () => {
  const { token } = r.gerarToken();
  assert.equal(r.lerBearer(`Bearer ${token}`), token);
  assert.equal(r.lerBearer(token), null, 'sem o esquema Bearer');
  assert.equal(r.lerBearer('Bearer abc'), null);
  assert.equal(r.lerBearer(`Bearer ${token}x`), null, 'comprimento errado');
  assert.equal(r.lerBearer(undefined), null);
});

test('IP: lista vazia libera qualquer um; lista com entradas só deixa quem está nela', () => {
  assert.equal(r.ipLiberado([], '8.8.8.8'), true);
  assert.equal(r.ipLiberado(['203.0.113.7'], '203.0.113.7'), true);
  assert.equal(r.ipLiberado(['203.0.113.7'], '203.0.113.8'), false);
  assert.equal(r.ipLiberado(['203.0.113.0/24'], '203.0.113.200'), true);
  assert.equal(r.ipLiberado(['203.0.113.0/24'], '203.0.114.1'), false);
  assert.equal(r.ipLiberado(['2001:db8::/32'], '2001:db8::1'), true);
  assert.equal(r.ipLiberado(['2001:db8::/32'], '2001:db9::1'), false);
});

test('IP: IPv4 dentro de IPv6 (::ffff:) é tratado como IPv4; IP ilegível não passa', () => {
  assert.equal(r.ipLiberado(['203.0.113.7'], '::ffff:203.0.113.7'), true);
  assert.equal(r.ipLiberado(['203.0.113.7'], 'lixo'), false);
  assert.equal(r.ipLiberado(['203.0.113.7'], undefined), false);
  assert.equal(r.normalizarIp(' ::FFFF:10.0.0.1 '), '10.0.0.1');
});

test('validarIps: normaliza, tira repetido e recusa o que não é IP', () => {
  assert.deepEqual(r.validarIps(['203.0.113.7', ' 203.0.113.7 ', '10.0.0.0/8']), ['203.0.113.7', '10.0.0.0/8']);
  assert.deepEqual(r.validarIps(undefined), []);
  assert.throws(() => r.validarIps(['abc']), /não é um IP válido/);
  assert.throws(() => r.validarIps(['1.2.3.4/33']), /não é um IP válido/);
  assert.throws(() => r.validarIps(['1.2.3.4/8/8']), /não é um IP válido/);
  assert.throws(() => r.validarIps('1.2.3.4'), /precisa ser uma lista/);
  assert.throws(() => r.validarIps(Array.from({ length: 21 }, (_, i) => `10.0.0.${i}`)), /No máximo 20/);
});

test('SSRF: IP da nossa rede e de loopback são privados; IP público não', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.0.10', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1']) {
    assert.equal(r.ipPrivado(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111']) {
    assert.equal(r.ipPrivado(ip), false, ip);
  }
  assert.equal(r.ipPrivado('::ffff:127.0.0.1'), true, 'IPv4 de loopback escondido em IPv6');
});

test('URL do webhook: só https público, sem credencial, sem IP interno', () => {
  assert.equal(r.validarUrlWebhook('https://cliente.com.br/recebe'), 'https://cliente.com.br/recebe');
  assert.throws(() => r.validarUrlWebhook('http://cliente.com.br/x'), /https/);
  assert.throws(() => r.validarUrlWebhook('https://u:s@cliente.com.br/x'), /usuário e senha/);
  assert.throws(() => r.validarUrlWebhook('https://127.0.0.1/x'), /rede interna/);
  assert.throws(() => r.validarUrlWebhook('https://169.254.169.254/latest'), /rede interna/);
  assert.throws(() => r.validarUrlWebhook('https://[::1]/x'), /rede interna/);
  assert.throws(() => r.validarUrlWebhook('https://localhost/x'), /nome público/);
  assert.throws(() => r.validarUrlWebhook('ftp://x.com/y'), /https/);
  assert.throws(() => r.validarUrlWebhook('não é url'), /inválido/);
  // O modo local (só teste) aceita http e rede interna.
  assert.equal(r.validarUrlWebhook('http://127.0.0.1:9000/x', { permitirHttp: true }), 'http://127.0.0.1:9000/x');
});

test('assinatura HMAC: confere com o segredo certo; corpo, segredo ou tempo errados falham', () => {
  const segredo = r.segredoDoWebhook('segredo-da-app', r.novoSal());
  const corpo = JSON.stringify({ evento: 'oportunidades.novas', total: 1 });
  const agora = new Date('2026-11-14T12:00:00Z');
  const cab = r.cabecalhoAssinatura(segredo, corpo, agora);
  assert.match(cab, /^t=\d+,v1=[0-9a-f]{64}$/);
  assert.equal(r.conferirAssinatura(segredo, cab, corpo, agora), true);
  assert.equal(r.conferirAssinatura(segredo, cab, `${corpo} `, agora), false, 'corpo alterado');
  assert.equal(r.conferirAssinatura('whsec_outro', cab, corpo, agora), false, 'segredo errado');
  assert.equal(r.conferirAssinatura(segredo, cab, corpo, new Date('2026-11-14T12:10:00Z')), false, 'entrega velha repetida');
  assert.equal(r.conferirAssinatura(segredo, '', corpo, agora), false);
  assert.equal(r.conferirAssinatura(segredo, 't=1,v1=abc', corpo, agora), false);
});

test('segredo do webhook: determinístico por sal, diferente por sal e por segredo da aplicação', () => {
  const sal = r.novoSal();
  assert.equal(r.segredoDoWebhook('app', sal), r.segredoDoWebhook('app', sal));
  assert.notEqual(r.segredoDoWebhook('app', sal), r.segredoDoWebhook('app', r.novoSal()));
  assert.notEqual(r.segredoDoWebhook('app', sal), r.segredoDoWebhook('outra', sal));
  assert.ok(!r.segredoDoWebhook('app', sal).includes(sal), 'o sal do banco não revela o segredo');
});

test('payload: orçamento sigiloso e valor ausente vão como null, nunca como zero', () => {
  const p = r.montarPayload({
    webhook: { id: 1, nome: 'ERP' },
    perfil: { id: 7, nome: 'TI' },
    itens: [
      { id: 1, objeto: 'a', orgao_nome: 'x', uf: 'RS', valor_estimado: '1000.50', orcamento_sigiloso: 0, fim_propostas: '2026-12-01T10:00:00Z' },
      { id: 2, objeto: 'b', valor_estimado: '999', orcamento_sigiloso: 1 },
      { id: 3, objeto: 'c', valor_estimado: null, orcamento_sigiloso: 0 },
    ],
    urlPublica: 'https://painel.exemplo',
    entregaId: 'e1',
    agora: new Date('2026-11-14T12:00:00Z'),
  });
  assert.equal(p.evento, 'oportunidades.novas');
  assert.equal(p.total, 3);
  assert.equal(p.itens[0].valor_estimado, 1000.5);
  assert.equal(p.itens[1].valor_estimado, null);
  assert.equal(p.itens[1].orcamento_sigiloso, true);
  assert.equal(p.itens[2].valor_estimado, null);
  assert.equal(p.itens[0].link_painel, 'https://painel.exemplo/?licitacao=1');
  assert.equal(p.itens[2].fim_propostas, null);
});

test('limitador: passa até o máximo, barra o excedente e libera na janela seguinte', () => {
  const l = r.criarLimitador({ maximo: 3, janelaMs: 60000 });
  assert.equal(l.tentar('a', 1000).ok, true);
  assert.equal(l.tentar('a', 2000).ok, true);
  const terceira = l.tentar('a', 3000);
  assert.equal(terceira.ok, true);
  assert.equal(terceira.restante, 0);
  const barrada = l.tentar('a', 4000);
  assert.equal(barrada.ok, false);
  assert.equal(barrada.esperarS, 57);
  assert.equal(l.tentar('b', 4000).ok, true, 'outra chave tem a janela dela');
  assert.equal(l.tentar('a', 61000).ok, true, 'janela nova');
});

// ------------------------------------------------------------------ Seção 14b
test('14b: o mesmo lote do mesmo webhook tem sempre o mesmo entrega_id (reenvio reconhecível)', () => {
  const a = r.entregaIdDoLote(7, [3, 1, 2]);
  assert.equal(a, r.entregaIdDoLote(7, [1, 2, 3]), 'a ordem dos itens não muda o id');
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.notEqual(a, r.entregaIdDoLote(8, [1, 2, 3]), 'outro webhook, outro id');
  assert.notEqual(a, r.entregaIdDoLote(7, [1, 2, 4]), 'outros itens, outro id');
});

test('14b: sem CONFIAR_PROXY o teto de tokens inválidos por IP sobe (o IP visto é o do proxy)', () => {
  assert.equal(r.limiteDeFalhas(0), 300);
  assert.equal(r.limiteDeFalhas(1), 30);
  assert.equal(r.limiteDeFalhas(undefined), 300);
});

test('14b: webhooks em paralelo respeitam o teto e o resultado volta por posição', async () => {
  const { emParalelo } = require('../backend/servicos/paralelo');
  let ativos = 0;
  let pico = 0;
  const saida = [];
  await emParalelo([...Array(10).keys()], 4, async (item, i) => {
    ativos += 1;
    pico = Math.max(pico, ativos);
    await new Promise((r) => setTimeout(r, 5 + (10 - item)));
    saida[i] = item * 2;
    ativos -= 1;
  });
  assert.equal(pico, 4, 'nunca mais de 4 ao mesmo tempo, e chegou a 4');
  assert.deepEqual(saida, [0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
  await emParalelo([], 4, () => assert.fail('lista vazia não chama nada'));
});
