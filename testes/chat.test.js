// Seção 6 — monitor de chat do pregão. Sem banco e sem rede: só o que erra calado.
const test = require('node:test');
const assert = require('node:assert/strict');

const regras = require('../backend/regras/chat');
const notificacoes = require('../backend/regras/notificacoes');
const generico = require('../backend/adaptadores/generico_html');
const comprasgov = require('../backend/adaptadores/comprasgov');
const adaptadores = require('../backend/adaptadores');

const HORA = 3600 * 1000;

// ---------------------------------------------------------------- destaques

test('destaques: acento, caixa, flexão e plural não escapam', () => {
  assert.deepEqual(regras.destaquesDe('Licitante 07 CONVOCADO a enviar o anexo'), ['convocado', 'anexo']);
  assert.deepEqual(regras.destaquesDe('Abrimos DILIGÊNCIAS; prazo de 30 min'), ['diligência', 'prazo']);
  assert.deepEqual(regras.destaquesDe('diligencia'), ['diligência']);
  assert.deepEqual(regras.destaquesDe('Convocamos a empresa'), ['convocado']);
  assert.ok(regras.destaquesDe('Sessão suspensa até amanhã').includes('suspensão'));
});

test('destaques: conversa comum não vira alerta vermelho', () => {
  assert.deepEqual(regras.destaquesDe('Bom dia a todos. Sessão aberta.'), []);
  assert.deepEqual(regras.destaquesDe('Aguardem a análise das propostas.'), []);
  assert.deepEqual(regras.destaquesDe(''), []);
  assert.deepEqual(regras.destaquesDe(null), []);
});

// ------------------------------------------------------------------- chaves

test('mensagens idênticas na mesma leitura continuam duas, e a releitura gera as mesmas chaves', () => {
  const leitura = [
    { autor: 'Pregoeiro', texto: 'Aguardem.', enviada_em: '2026-11-14T12:00:00Z' },
    { autor: 'Pregoeiro', texto: 'Aguardem.', enviada_em: '2026-11-14T12:00:00Z' },
    { autor: 'Pregoeiro', texto: 'Outra.', enviada_em: '2026-11-14T12:01:00Z' },
  ];
  const a = regras.comChaves(leitura);
  const b = regras.comChaves(leitura);
  assert.equal(a.length, 3);
  assert.equal(new Set(a.map((m) => m.chave)).size, 3);
  assert.deepEqual(a.map((m) => m.chave), b.map((m) => m.chave));
});

test('mensagem nova no fim da lista não muda a chave das anteriores', () => {
  const base = [{ autor: 'P', texto: 'Um', enviada_em: null }, { autor: 'P', texto: 'Um', enviada_em: null }];
  const antes = regras.comChaves(base).map((m) => m.chave);
  const depois = regras.comChaves([...base, { autor: 'P', texto: 'Dois', enviada_em: null }]).map((m) => m.chave);
  assert.deepEqual(depois.slice(0, 2), antes);
});

test('linha sem texto é descartada e texto de terceiro é só texto, com tamanho limitado', () => {
  const r = regras.comChaves([{ autor: 'X', texto: '   ' }, { autor: 'X' }, { texto: `<b>oi</b>${'a'.repeat(5000)}` }]);
  assert.equal(r.length, 1);
  assert.equal(r[0].texto.length, 2000);
  assert.ok(r[0].texto.startsWith('<b>oi</b>'));
  assert.equal(r[0].autor, null);
});

test('data inválida do portal vira null, não Invalid Date', () => {
  assert.equal(regras.normalizarMensagem({ texto: 'oi', enviada_em: 'ontem à tarde' }).enviada_em, null);
});

// ------------------------------------------------------------------- janela

test('janela do chat: uma hora antes até três dias depois do fim das propostas', () => {
  const fim = new Date('2026-11-14T14:00:00Z');
  const lic = { fim_propostas: fim };
  assert.equal(regras.janelaDoChat(lic, new Date(fim.getTime() - 2 * HORA)).estado, 'antes');
  assert.equal(regras.janelaDoChat(lic, new Date(fim.getTime() - 2 * HORA)).inicio.getTime(), fim.getTime() - HORA);
  assert.equal(regras.janelaDoChat(lic, new Date(fim.getTime() - 0.5 * HORA)).estado, 'dentro');
  assert.equal(regras.janelaDoChat(lic, new Date(fim.getTime() + 71 * HORA)).estado, 'dentro');
  assert.equal(regras.janelaDoChat(lic, new Date(fim.getTime() + 73 * HORA)).estado, 'depois');
  assert.equal(regras.janelaDoChat({ fim_propostas: null }).estado, 'sem_data');
});

test('próximo passo: bloqueado volta em 6 h, sem consulta nunca, erro em 15 min, sessão em 5 min', () => {
  const agora = new Date('2026-11-14T15:00:00Z');
  const dentro = { estado: 'dentro' };
  const em = (p) => (p.proxima ? p.proxima.getTime() - agora.getTime() : null);
  assert.equal(em(regras.proximoPasso({ resultado: 'bloqueado', aviso: 'x' }, dentro, agora)), 6 * HORA);
  assert.equal(em(regras.proximoPasso({ resultado: 'sem_consulta', aviso: 'x' }, dentro, agora)), null);
  assert.equal(em(regras.proximoPasso({ resultado: 'erro', aviso: 'x' }, dentro, agora)), 15 * 60000);
  assert.equal(em(regras.proximoPasso({ resultado: 'ok' }, dentro, agora)), 5 * 60000);
  assert.equal(em(regras.proximoPasso({ resultado: 'ok' }, { estado: 'sem_data' }, agora)), HORA);
});

test('bloqueado nunca é apresentado como leitura boa', () => {
  const p = regras.proximoPasso({ resultado: 'bloqueado', aviso: 'exige login' }, { estado: 'dentro' });
  assert.equal(p.status, 'bloqueado');
  assert.equal(p.aviso, 'exige login');
});

// ------------------------------------------------------------------- alerta

test('alerta: um por leitura, vermelho só com palavra de destaque', () => {
  const novas = regras.comChaves([
    { autor: 'P', texto: 'Bom dia.' },
    { autor: 'P', texto: 'Licitante convocado: envie o anexo. Prazo 30 min.' },
  ]);
  const a = regras.alertaDeMensagens(novas, { orgao: 'Prefeitura X' });
  assert.equal(a.nivel, 'vermelho');
  assert.match(a.mensagem, /2 mensagens novas/);
  assert.match(a.mensagem, /convocado, anexo, prazo/);
  assert.match(a.mensagem, /Prefeitura X/);

  const calma = regras.alertaDeMensagens(regras.comChaves([{ autor: 'P', texto: 'Aguardem.' }]));
  assert.equal(calma.nivel, 'atencao');
  assert.match(calma.mensagem, /1 mensagem nova/);
  assert.equal(regras.alertaDeMensagens([]), null);
});

test('alerta: trecho longo é cortado', () => {
  const [m] = regras.comChaves([{ texto: `convocado ${'x'.repeat(500)}` }]);
  assert.ok(regras.alertaDeMensagens([m]).mensagem.length < 320);
});

// -------------------------------------------------------------- abas, portais

test('aba desconhecida vira "todos"', () => {
  assert.equal(regras.abaValida('nao_lidos'), 'nao_lidos');
  assert.equal(regras.abaValida("x'; DROP TABLE chat_mensagens;--"), 'todos');
  assert.equal(regras.abaValida(undefined), 'todos');
  for (const aba of regras.ABAS) assert.ok(regras.CONDICAO_DA_ABA[aba], aba);
});

test('portais compatíveis: não afirma o que não foi conferido', () => {
  const lista = regras.catalogoDePortais();
  const compras = lista.find((p) => /Compras\.gov/.test(p.portal));
  assert.equal(compras.situacao, 'bloqueada');
  assert.match(compras.detalhe, /captcha/i);
  // Nenhum portal está como "configurável" por palpite: isso só vale depois de alguém conferir.
  assert.ok(lista.every((p) => p.situacao !== 'configuravel'));
  assert.ok(lista.filter((p) => p.situacao === 'nao_verificada').every((p) => /não foi verificada/i.test(p.explicacao)));
  assert.ok(lista.every((p) => p.explicacao));
});

// ------------------------------------------------------------------- adaptadores

const CONFIG = {
  seletor_lista: '.msg',
  campos: {
    autor: { seletor: '.quem' },
    texto: { seletor: '.texto' },
    hora: { seletor: '.hora', formato_data: 'DD/MM/YYYY HH:mm' },
  },
};

test('generico_html lê o chat público em HTML', () => {
  const html = `<div class="msg"><b class="quem">Pregoeiro</b><span class="hora">14/11/2026 09:05</span><p class="texto">Aguardem.</p></div>
                <div class="msg"><b class="quem">Pregoeiro</b><span class="hora">14/11/2026 09:10</span><p class="texto">  </p></div>`;
  const lidas = generico.lerMensagens(html, CONFIG, 'http://portal/chat');
  assert.equal(lidas.length, 1);
  assert.equal(lidas[0].autor, 'Pregoeiro');
  assert.equal(lidas[0].texto, 'Aguardem.');
  assert.equal(lidas[0].enviada_em.getHours(), 9);
  assert.equal(lidas[0].enviada_em.getMinutes(), 5);
});

test('generico_html: página que pede senha é bloqueada, sem tentar entrar', () => {
  const html = '<form><input name="cpf"><input type="password" name="s"></form>';
  assert.throws(() => generico.lerMensagens(html, CONFIG, 'http://portal/chat'), (e) => e.bloqueado === true && /login/.test(e.message));
});

test('generico_html: chat montado por JavaScript é bloqueado; sala vazia não é', () => {
  const casca = '<html><body><div id="root"></div><script src="/app.js"></script></body></html>';
  assert.throws(() => generico.lerMensagens(casca, CONFIG, 'http://portal/chat'), (e) => e.bloqueado === true && /JavaScript/.test(e.message));
  assert.deepEqual(generico.lerMensagens('<html><body><p>Sem mensagens ainda.</p></body></html>', CONFIG, 'http://portal/chat'), []);
});

test('generico_html sem configuração de chat diz "sem consulta" e não inventa URL', async () => {
  await assert.rejects(generico.listarMensagens({ config: {}, chaveExterna: '2:ABC' }), (e) => e.semConsulta === true);
  await assert.rejects(generico.listarMensagens({ config: { chat: { url: 'http://x' } } }), (e) => e.semConsulta === true);
});

test('compras.gov sem o identificador da compra diz "sem consulta" antes de ir à rede', async () => {
  await assert.rejects(comprasgov.listarMensagens({ link: 'https://exemplo.gov.br/sem-compra' }), (e) => e.semConsulta === true);
});

test('o PNCP não publica chat: o adaptador nem finge ter a função', () => {
  assert.equal(typeof adaptadores.obter('pncp').listarMensagens, 'undefined');
  assert.equal(typeof adaptadores.obter('comprasgov').listarMensagens, 'function');
  assert.equal(typeof adaptadores.obter('generico_html').listarMensagens, 'function');
});

// ----------------------------------------------------------------- notificações

test('alerta de chat e de estratégica por segmento têm tipo próprio nos avisos', () => {
  assert.equal(notificacoes.tipoDoAlerta('chat_pregao'), 'chat');
  assert.equal(notificacoes.tipoDoAlerta('estrategica_segmento'), 'nova_oportunidade');
  assert.ok(notificacoes.TIPOS.some((t) => t.chave === 'chat'));
  // Chat vai ao e-mail e ao WhatsApp de fábrica: mensagem de pregoeiro tem prazo curto.
  assert.equal(notificacoes.ligado(new Map(), 'whatsapp', 'chat'), true);
  assert.equal(notificacoes.ligado(new Map(), 'email', 'chat'), true);
});
