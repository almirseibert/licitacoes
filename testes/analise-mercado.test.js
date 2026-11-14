// Seção 13 — concorrentes, histórico e mercado. Sem banco e sem rede.
// O que erra calado: segmento sem termo virar "mercado inteiro" com o nome do
// segmento, fevereiro/31 dias cortados no relatório mensal, perda sem valor
// virar "perdeu por preço", e o "não disponível" da desclassificação virar 0%.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const regras = require('../backend/regras/analise-mercado');

test('segmento sem termo não vira "sem filtro"', () => {
  assert.deepEqual(regras.condicaoDeTermos([]), { sql: '1 = 0', valores: [], termos: [] });
  assert.equal(regras.condicaoDeTermos(['  ', null]).sql, '1 = 0');
});

test('termos viram REGEXP parametrizado, sem repetir, com teto', () => {
  const r = regras.condicaoDeTermos(['toner', 'toner', 'cabo de rede']);
  assert.equal(r.sql, '(a.objeto REGEXP ? OR a.objeto REGEXP ?)');
  assert.equal(r.valores.length, 2);
  assert.equal(regras.condicaoDeTermos(Array.from({ length: 99 }, (_, i) => `t${i}`)).termos.length, regras.TERMOS_MAX);
});

// O padrão é POSIX (MySQL/MariaDB); aqui vira o equivalente em JS para conferir
// o sentido — a mesma bateria rodou contra o MariaDB na conferência da seção.
const casa = (termo, texto) =>
  new RegExp(regras.padraoDePalavra(termo).replace(/\[:alnum:\]/g, 'A-Za-z0-9').replace(/\[\[:space:\]\]/g, '\\s')).test(texto);

test('palavra inteira: "monitor" não acha "monitoramento" (o falso positivo da conferência)', () => {
  assert.equal(casa('monitor', 'vigilância armada e monitoramento'), false);
  assert.equal(casa('monitor', 'videomonitoramento'), false);
  assert.equal(casa('monitor', 'AQUISIÇÃO DE MONITORES 24"'), true);
  assert.equal(casa('monitor', 'Monitor LED'), true);
  assert.equal(casa('saas', 'pessaas'), false);
});

test('palavra inteira tolera acento, caixa e plural em cada palavra', () => {
  assert.equal(casa('periféricos', 'Impressoras e PERIFERICOS'), true);
  assert.equal(casa('material de informática', 'MATERIAL DE INFORMATICA'), true);
  assert.equal(casa('cabo de rede', 'cabos de rede cat6'), true);
  assert.equal(casa('toner', 'TONERS e cartuchos'), true);
  assert.equal(casa('m2m', 'chip M2M.'), true);
});

test('pontuação do termo não vira metacaractere de regex', () => {
  assert.equal(casa('c++', 'curso de c++ avançado'), true);
  assert.equal(casa('c++', 'ccc'), false);
  assert.equal(casa('a.b', 'axb'), false);
  assert.equal(casa('cabo [cat6]', 'cabo [cat6] blindado'), true);
  assert.equal(casa('wi-fi', 'roteador wi-fi'), true);
});

test('mês vira o período inteiro, com bissexto e 31 dias', () => {
  assert.deepEqual(regras.periodoDoMes('2026-02'), { de: '2026-02-01', ate: '2026-02-28' });
  assert.deepEqual(regras.periodoDoMes('2028-02'), { de: '2028-02-01', ate: '2028-02-29' });
  assert.deepEqual(regras.periodoDoMes('2026-10'), { de: '2026-10-01', ate: '2026-10-31' });
  assert.equal(regras.periodoDoMes('2026-13'), null);
  assert.equal(regras.periodoDoMes('2026-1'), null);
});

test('período pedido: mês vence datas; sem nada, os últimos N dias; datas invertidas trocam', () => {
  const hoje = '2026-11-14';
  assert.deepEqual(regras.periodoPedido({ mes: '2026-10', de: '2026-01-01' }, { hoje }), { de: '2026-10-01', ate: '2026-10-31' });
  assert.deepEqual(regras.periodoPedido({}, { hoje }), { de: '2026-10-16', ate: '2026-11-14' });
  assert.deepEqual(regras.periodoPedido({}, { hoje, padrao: 90 }), { de: '2026-08-17', ate: '2026-11-14' });
  assert.deepEqual(regras.periodoPedido({ de: '2026-11-10', ate: '2026-11-01' }, { hoje }), { de: '2026-11-01', ate: '2026-11-10' });
  assert.deepEqual(regras.periodoPedido({ de: 'ontem' }, { hoje }), { de: '2026-10-16', ate: '2026-11-14' });
});

test('perda sem um dos valores é falta de dado, nunca "preço"', () => {
  assert.equal(regras.motivoDaPerda({ valor_proposto: null, valor_final: 100 }).motivo, 'sem_proposta');
  assert.equal(regras.motivoDaPerda({ valor_proposto: '0.00', valor_final: 100 }).motivo, 'sem_proposta');
  const semResultado = regras.motivoDaPerda({ valor_proposto: 100, valor_final: null });
  assert.equal(semResultado.motivo, 'sem_resultado');
  assert.equal(semResultado.diferenca, null);
});

test('perda por preço: por pouco até 5%, acima disso estrutural; menor ou igual não é preço', () => {
  assert.deepEqual(
    [regras.motivoDaPerda({ valor_proposto: 105, valor_final: 100 }).motivo, regras.motivoDaPerda({ valor_proposto: 105, valor_final: 100 }).diferenca],
    ['preco_por_pouco', 0.05]
  );
  assert.equal(regras.motivoDaPerda({ valor_proposto: '105.01', valor_final: '100' }).motivo, 'preco');
  assert.equal(regras.motivoDaPerda({ valor_proposto: 100, valor_final: 100 }).motivo, 'nao_preco');
  const me = regras.motivoDaPerda({ valor_proposto: 90, valor_final: 100, beneficio_me: 1 });
  assert.equal(me.motivo, 'nao_preco');
  assert.match(me.recomendacao, /ME\/EPP/);
});

test('resumo das perdas: percentual, média e principal que não é falta de dado', () => {
  const perdas = [
    { valor_proposto: null, valor_final: 1 },
    { valor_proposto: null, valor_final: 1 },
    { valor_proposto: 110, valor_final: 100, valor_estimado: 200 },
    { valor_proposto: 130, valor_final: 100, valor_estimado: 300 },
    { valor_proposto: 90, valor_final: 100 },
  ].map((p) => ({ ...p, ...regras.motivoDaPerda(p) }));
  const { motivos, principal } = regras.resumirPerdas(perdas);
  assert.equal(motivos[0].motivo, 'preco');
  assert.equal(motivos[0].quantidade, 2);
  assert.equal(motivos[0].percentual, 40);
  assert.equal(motivos[0].diferenca_media, 0.2);
  assert.equal(motivos[0].valor, 500);
  // Empate em quantidade: falta de dado vai depois do que diz algo do jogo.
  assert.equal(principal.motivo, 'preco');
  const soFalta = regras.resumirPerdas([{ ...regras.motivoDaPerda({}), valor_estimado: 1 }]);
  assert.equal(soFalta.principal.motivo, 'sem_proposta');
  assert.deepEqual(regras.resumirPerdas([]), { motivos: [], principal: null });
});

test('desclassificação é "não disponível", nunca um número', () => {
  assert.equal(regras.DESCLASSIFICACAO.disponivel, false);
  assert.ok(!('percentual' in regras.DESCLASSIFICACAO));
  assert.match(regras.DESCLASSIFICACAO.motivo, /PNCP/);
});

test('lista de coluna JSON aceita texto (MariaDB), array (MySQL) e lixo', () => {
  assert.deepEqual(regras.listaJson('["a","b"]'), ['a', 'b']);
  assert.deepEqual(regras.listaJson(['a']), ['a']);
  assert.deepEqual(regras.listaJson('{"a":1}'), []);
  assert.deepEqual(regras.listaJson('não é json'), []);
  assert.deepEqual(regras.listaJson(null), []);
});
