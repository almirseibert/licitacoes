// Gestão por licitação (Seção 8 do plano SaaS): onde erra calado — a tarefa de
// hoje que vira "atrasada" às 22 h por causa do fuso, data inexistente aceita,
// "por mim" sem usuário que vira "todos", e a lista de finalizadas que esconde
// a descartada.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const g = require('../backend/regras/gestao');
const f = require('../backend/regras/filtros-radar');

test('o dia de hoje é o de Brasília, não o do UTC', () => {
  // 13/11 às 22h30 em Brasília = 14/11 01h30 UTC.
  assert.equal(g.diaNoFuso(new Date('2026-11-14T01:30:00Z')), '2026-11-13');
  assert.equal(g.diaNoFuso(new Date('2026-11-14T03:00:00Z')), '2026-11-14');
  // DATETIME do banco (instante) vira dia de Brasília; DATE (texto) fica como está.
  assert.equal(g.dia(new Date('2026-11-14T01:30:00Z')), '2026-11-13');
  assert.equal(g.dia('2026-11-14'), '2026-11-14');
});

test('visão da tarefa: atrasada, hoje, futura (inclusive sem prazo) e concluída', () => {
  const hoje = '2026-11-13';
  assert.equal(g.visaoDaTarefa({ status: 'aberta', prazo: '2026-11-12' }, hoje), 'atrasadas');
  assert.equal(g.visaoDaTarefa({ status: 'aberta', prazo: '2026-11-13' }, hoje), 'hoje');
  assert.equal(g.visaoDaTarefa({ status: 'aberta', prazo: '2026-11-14' }, hoje), 'futuras');
  assert.equal(g.visaoDaTarefa({ status: 'aberta', prazo: null }, hoje), 'futuras');
  // Concluída atrasada continua concluída: não volta a gritar.
  assert.equal(g.visaoDaTarefa({ status: 'concluida', prazo: '2020-01-01' }, hoje), 'concluidas');
});

test('o SQL da visão só aceita dia válido e cobre as quatro', () => {
  for (const v of g.VISOES) assert.ok(g.sqlVisao(v, '2026-11-13'));
  assert.match(g.sqlVisao('atrasadas', '2026-11-13'), /t\.prazo < '2026-11-13'/);
  assert.equal(g.sqlVisao('outra', '2026-11-13'), null);
  assert.throws(() => g.sqlVisao('hoje', "2026-11-13' OR 1=1 --"));
});

test('data inexistente não passa como prazo', () => {
  assert.equal(g.dataValida('2026-02-30'), false);
  assert.equal(g.dataValida('2028-02-29'), true);
  assert.match(g.lerTarefa({ titulo: 'x', prazo: '2026-02-30' }).erro, /Prazo inválido/);
  assert.match(g.lerTarefa({ titulo: '   ' }).erro, /título/);
  assert.deepEqual(g.lerTarefa({ titulo: ' a  b ', prazo: '' }).campos, { titulo: 'a b', prazo: null });
  assert.match(g.lerTarefa({ responsavel_id: 'abc' }, { parcial: true }).erro, /Responsável inválido/);
  assert.match(g.lerTarefa({}, { parcial: true }).erro, /Nada para atualizar/);
  assert.match(g.lerTarefa({ status: 'feita' }, { parcial: true }).erro, /Situação/);
});

test('andamento: tipo da Seção 9, data em UTC e nunca no futuro', () => {
  assert.match(g.lerAndamento({ texto: 'x', tipo: 'fofoca' }).erro, /Tipo de andamento inválido/);
  assert.match(g.lerAndamento({ texto: '' }).erro, /Descreva/);
  assert.equal(g.lerAndamento({ texto: 'x' }).campos.tipo, 'outro');
  // 09h30 em Brasília é 12h30 em UTC.
  assert.equal(
    g.lerAndamento({ texto: 'x', ocorrido_em: '2026-11-13T09:30:00-03:00' }).campos.ocorrido_em,
    '2026-11-13 12:30:00'
  );
  assert.match(g.lerAndamento({ texto: 'x', ocorrido_em: '2999-01-01T00:00:00Z' }).erro, /futuro/);
  assert.match(g.lerAndamento({ texto: 'x', ocorrido_em: 'ontem' }).erro, /inválida/);
  // Sem fuso o servidor leria a hora no relógio dele: recusa em vez de adivinhar.
  assert.match(g.lerAndamento({ texto: 'x', ocorrido_em: '2026-11-13T09:30' }).erro, /inválida/);
});

test('"por mim" filtra pelo usuário; sem usuário não vira "todos"', () => {
  const comigo = f.montarFiltros({ pontuacao_min: '0', por: 'mim' }, { organizacaoId: 1, usuarioId: 9 });
  assert.match(comigo.onde, /l\.responsavel_id = \?/);
  assert.match(comigo.onde, /org_tarefas/);
  assert.deepEqual(comigo.valores.slice(-2), [9, 9]);

  const semUsuario = f.montarFiltros({ pontuacao_min: '0', por: 'mim' }, { organizacaoId: 1 });
  assert.match(semUsuario.onde, /1 = 0/);
  assert.equal(semUsuario.avisos.length, 1);
});

test('listas: finalizadas inclui a descartada; gerenciadas não inclui triagem', () => {
  const fin = f.montarFiltros({ pontuacao_min: '0', lista: 'finalizadas' }, {});
  assert.doesNotMatch(fin.onde, /l\.descartada = 0/);
  assert.match(fin.onde, /'Descartada'/);
  const ger = f.montarFiltros({ pontuacao_min: '0', lista: 'gerenciadas' }, {});
  assert.doesNotMatch(ger.onde, /Triagem/);
  assert.match(ger.onde, /l\.descartada = 0/);
  // Lista desconhecida não filtra nada (nem quebra).
  assert.equal(f.montarFiltros({ pontuacao_min: '0', lista: 'xx' }, {}).onde, 'WHERE l.descartada = 0');
});

test('link público não carrega "por mim" nem a lista', () => {
  const publico = f.filtrosPublicos({ por: 'mim', lista: 'favoritas', busca: 'papel' });
  assert.equal(publico.por, undefined);
  assert.equal(publico.lista, undefined);
  assert.equal(publico.busca, 'papel');
});
