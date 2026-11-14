// Trilha de auditoria, solicitações, status das ferramentas e LGPD (Seção 17).
// O que erra calado: gravar conteúdo na trilha, deixar de auditar documento,
// tarefa e etapa, dizer "worker de pé" com sinal velho, apagar a organização
// errada ou exportar segredo.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const aud = require('../backend/regras/auditoria');
const sup = require('../backend/regras/suporte');
const st = require('../backend/regras/status');
const lgpd = require('../backend/regras/lgpd');

// ---------------------------------------------------------------- auditoria
test('auditoria: documento, tarefa e etapa são auditados, com a ação e o id certos', () => {
  assert.deepEqual(aud.classificar('POST', '/empresa/documentos', { codigo: 'cnd_federal' }, { id: 42 }), {
    acao: 'subiu_documento', entidade: 'documento', entidade_id: '42', detalhe: { codigo: 'cnd_federal' },
  });
  assert.equal(aud.classificar('DELETE', '/empresa/documentos/7').acao, 'removeu_documento');
  assert.equal(aud.classificar('DELETE', '/empresa/documentos/7').entidade_id, '7');
  assert.equal(aud.classificar('PATCH', '/gestao/tarefas/9', { status: 'feita' }).acao, 'alterou_tarefa');
  const etapa = aud.classificar('PATCH', '/licitacoes/123', { etapa: 'Ganhamos', valor_final: 99999 });
  assert.equal(etapa.acao, 'mudou_etapa');
  assert.equal(etapa.entidade_id, '123');
  assert.deepEqual(etapa.detalhe, { etapa: 'Ganhamos' });
});

test('auditoria: o id de quem foi criado vem da raiz da resposta ou de um objeto dentro dela', () => {
  assert.equal(aud.classificar('POST', '/gestao/tarefas', { titulo: 'x' }, { tarefa: { id: 77, titulo: 'x' } }).entidade_id, '77');
  assert.equal(aud.classificar('POST', '/gestao/tarefas', {}, { id: 5 }).entidade_id, '5');
  assert.equal(aud.classificar('POST', '/gestao/tarefas', {}, { ok: true, lista: [{ id: 9 }] }).entidade_id, null);
});

test('auditoria: o corpo nunca vai inteiro — só os campos de controle da regra', () => {
  const r = aud.classificar('POST', '/integracoes/tokens', { nome: 'x', segredo: 'ultra-secreto' }, { id: 3, token: 'abc' });
  assert.equal(r.detalhe, null);
  const t = aud.classificar('POST', '/gestao/tarefas', { titulo: 'texto longo de cliente', status: 'aberta', prazo: '2026-12-01' }, { id: 1 });
  assert.deepEqual(t.detalhe, { status: 'aberta', prazo: '2026-12-01' });
  // valor estruturado ou comprido demais fica de fora mesmo sendo campo de controle
  const l = aud.classificar('PATCH', '/licitacoes/5', { etapa: 'x'.repeat(200), favorito: true });
  assert.deepEqual(l.detalhe, { favorito: true });
});

test('auditoria: PATCH de licitação sem campo de controle, GET e rota desconhecida não entram', () => {
  assert.equal(aud.classificar('PATCH', '/licitacoes/5', { anotacao_livre: 'oi' }), null);
  assert.equal(aud.classificar('GET', '/empresa/documentos'), null);
  assert.equal(aud.classificar('POST', '/licitacoes/pesquisas', {}), null);
  assert.equal(aud.classificar('PATCH', '/licitacoes/abc', { etapa: 'x' }), null); // id não numérico
  assert.equal(aud.classificar('POST', '/palavras', {}), null);
});

test('auditoria: query e barra final não atrapalham; rótulo cai para a própria ação', () => {
  assert.equal(aud.classificar('DELETE', '/gestao/tarefas/4/?x=1').acao, 'removeu_tarefa');
  assert.equal(aud.rotulo('mudou_etapa'), 'Mudou a etapa de uma licitação');
  assert.equal(aud.rotulo('acao_nova'), 'acao_nova');
});

// ------------------------------------------------------------------ suporte
test('suporte: protocolo com ano e id preenchido', () => {
  assert.equal(sup.protocolo(123, '2026-11-14T10:00:00'), 'SOL-2026-000123');
  assert.equal(sup.protocolo(1, '2027-01-02T10:00:00'), 'SOL-2027-000001');
});

test('suporte: validações com frase em português', () => {
  assert.match(sup.validarNova({ texto: 'x' }).erro, /assunto/);
  assert.match(sup.validarNova({ assunto: 'a' }).erro, /Descreva/);
  assert.match(sup.validarNova({ assunto: 'a', texto: 'b', categoria: 'xyz' }).erro, /Categoria inválida/);
  assert.deepEqual(sup.validarNova({ assunto: ' Não  chega e-mail ', texto: 'Oi' }).dados, { assunto: 'Não chega e-mail', texto: 'Oi', categoria: 'duvida' });
  assert.match(sup.validarMensagem({ texto: '   ' }).erro, /Escreva/);
});

test('suporte: resposta do suporte → respondida; cliente volta a escrever → reabre', () => {
  assert.equal(sup.statusAposMensagem('aberta', 'suporte'), 'respondida');
  assert.equal(sup.statusAposMensagem('aberta', 'suporte', 'encerrada'), 'encerrada');
  assert.equal(sup.statusAposMensagem('aberta', 'suporte', 'invalido'), 'respondida');
  assert.equal(sup.statusAposMensagem('respondida', 'cliente'), 'aberta');
  assert.equal(sup.statusAposMensagem('encerrada', 'cliente'), 'aberta');
  assert.equal(sup.statusAposMensagem('em_andamento', 'cliente'), 'em_andamento');
});

// ------------------------------------------------------------------- status
test('status do worker: 3 min ok, 15 atrasado, além disso parado, nunca = parado', () => {
  const agora = new Date('2026-11-14T12:00:00Z');
  const min = (n) => new Date(agora.getTime() - n * 60000);
  assert.equal(st.worker(min(1), agora).nivel, 'ok');
  assert.equal(st.worker(min(3), agora).nivel, 'ok');
  assert.equal(st.worker(min(10), agora).nivel, 'atrasado');
  assert.equal(st.worker(min(16), agora).nivel, 'parado');
  assert.match(st.worker(min(180), agora).mensagem, /3 h/);
  assert.equal(st.worker(null, agora).nivel, 'parado');
});

test('status da fila: vazia é ok; espera velha é atrasada; muito velha é parada', () => {
  assert.equal(st.fila({}, 0).nivel, 'ok');
  assert.equal(st.fila({ fila: 4 }, 10).nivel, 'ok');
  assert.equal(st.fila({ fila: 4 }, 90).nivel, 'atrasado');
  assert.equal(st.fila({ fila: 4 }, 400).nivel, 'parado');
  assert.match(st.fila({ erro: 2 }, 0).mensagem, /2 tarefa\(s\) com erro/);
});

test('status da coleta: olha a mais recente das fontes ativas e conta as bloqueadas', () => {
  const agora = new Date('2026-11-14T12:00:00Z');
  const h = (n) => new Date(agora.getTime() - n * 3600000);
  const fontes = [
    { nome: 'A', ativa: 1, ultima_coleta: h(30), ultimo_status: 'ok' },
    { nome: 'B', ativa: 1, ultima_coleta: h(2), ultimo_status: 'bloqueado (403)' },
    { nome: 'C', ativa: 0, ultima_coleta: h(1), ultimo_status: 'ok' },
  ];
  const r = st.coleta(fontes, agora);
  assert.equal(r.nivel, 'ok');
  assert.equal(r.bloqueadas, 1);
  assert.match(r.mensagem, /1 fonte\(s\) bloqueada/);
  assert.equal(st.coleta([{ ativa: 1, ultima_coleta: h(5) }], agora).nivel, 'atrasado');
  assert.equal(st.coleta([{ ativa: 1, ultima_coleta: h(40) }], agora).nivel, 'parado');
  assert.equal(st.coleta([{ ativa: 1, ultima_coleta: null }], agora).nivel, 'atrasado');
  assert.equal(st.coleta([{ ativa: 0 }], agora).nivel, 'desligado');
  // O limite acompanha o intervalo da fonte mais frequente (6 h → ok até 7 h, atrasada até 14 h).
  const seis = (n) => [{ ativa: 1, intervalo_horas: 6, ultima_coleta: h(n) }];
  assert.equal(st.coleta(seis(7), agora).nivel, 'ok');
  assert.equal(st.coleta(seis(10), agora).nivel, 'atrasado');
  assert.equal(st.coleta(seis(15), agora).nivel, 'parado');
});

test('status geral: desligado não derruba, parado manda', () => {
  assert.equal(st.geral([{ nivel: 'ok' }, { nivel: 'desligado' }]), 'ok');
  assert.equal(st.geral([{ nivel: 'ok' }, { nivel: 'atrasado' }]), 'atrasado');
  assert.equal(st.geral([{ nivel: 'atrasado' }, { nivel: 'parado' }]), 'parado');
  assert.equal(st.recurso(false, 'A leitura assistida', 'falta GEMINI_API_KEY').nivel, 'desligado');
});

// --------------------------------------------------------------------- LGPD
test('LGPD: só o dono pede; a operadora e a conta com cobrança recorrente no gateway não saem', () => {
  assert.equal(lgpd.podePedirExclusao({ papel: 'dono', organizacaoId: 7, cobrancaRecorrente: false }).ok, true);
  assert.match(lgpd.podePedirExclusao({ papel: 'admin', organizacaoId: 7 }).motivo, /Só o dono/);
  assert.match(lgpd.podePedirExclusao({ papel: 'dono', organizacaoId: 1 }).motivo, /operadora/);
  assert.match(lgpd.podePedirExclusao({ papel: 'dono', organizacaoId: 7, cobrancaRecorrente: true }).motivo, /cobrança recorrente/);
});

test('LGPD: a confirmação é o nome da organização, sem ligar para caixa, acento e espaço', () => {
  assert.equal(lgpd.confirmacaoConfere('Alfa Comércio Ltda', '  alfa  comercio LTDA '), true);
  assert.equal(lgpd.confirmacaoConfere('Alfa Comércio Ltda', 'Alfa'), false);
  assert.equal(lgpd.confirmacaoConfere('Alfa', ''), false);
  assert.equal(lgpd.confirmacaoConfere('', ''), false);
});

test('LGPD: carência de 7 dias; vence na hora exata', () => {
  const pedida = new Date('2026-11-14T12:00:00Z');
  const vence = lgpd.dataDaExclusao(pedida);
  assert.equal(vence.toISOString(), '2026-11-21T12:00:00.000Z');
  assert.equal(lgpd.vencida(vence, new Date('2026-11-21T11:59:59Z')), false);
  assert.equal(lgpd.vencida(vence, new Date('2026-11-21T12:00:00Z')), true);
  assert.equal(lgpd.vencida(null), false);
});

test('LGPD: a exportação nunca leva senha, segredo, token ou chave de push', () => {
  const linha = { id: 1, nome: 'x', senha_hash: 'h', segredo: 's', token_hash: 't', chave_p256dh: 'p', chave_auth: 'a', email: 'a@b.c' };
  assert.deepEqual(lgpd.semSegredos(linha), { id: 1, nome: 'x', email: 'a@b.c' });
  assert.equal(lgpd.TABELAS_FORA_DA_EXPORTACAO.has('tokens_api'), true);
  // O que casou por nome é listado, para dado legítimo não sumir calado; contagem e nome comum passam.
  const omitidas = new Set();
  lgpd.semSegredos({ id: 1, api_key: 'k', tokens_ia: 10, total_tokens: 5, hash_arquivo: 'x', arquivo_hash: 'y' }, omitidas);
  assert.deepEqual([...omitidas].sort(), ['api_key', 'arquivo_hash']);
});

test('LGPD: só se apaga arquivo dentro de org/<id>/ da própria organização', () => {
  const f = lgpd.arquivoDaOrganizacao;
  assert.equal(f('org/9/empresa/3/cnd.pdf', 9), 'org/9/empresa/3/cnd.pdf');
  assert.equal(f('org\\9\\anexos\\1\\a.pdf', 9), 'org/9/anexos/1/a.pdf'); // caminho de Windows
  assert.equal(f('org/9/empresa/../../10/cnd.pdf', 9), null); // sobe para a pasta de outra organização
  assert.equal(f('org/10/empresa/cnd.pdf', 9), null);
  assert.equal(f('org/90/x.pdf', 9), null); // prefixo parecido, outra organização
  assert.equal(f('org/9', 9), null);
  assert.equal(f('org/9/', 9), null);
  assert.equal(f('.', 9), null);
  assert.equal(f('', 9), null);
  assert.equal(f('editais/2026/arquivo.pdf', 9), null); // catálogo compartilhado
  assert.equal(f('../fora/arquivo.pdf', 9), null);
});
