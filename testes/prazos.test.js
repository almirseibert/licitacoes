// Testes do prazo de esclarecimento e impugnação (seção 25.1).
//
// Três dias úteis antes da abertura, sem contar o dia da abertura, pulando fim
// de semana e feriado — e feriado de outro município não suspende prazo nenhum.
// A conta errada aqui não dá erro em tela: só faz o painel prometer um prazo que
// já passou, que é o pior tipo de defeito que este projeto pode ter.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const prazos = require('../backend/regras/prazos');

test('conta três dias úteis para trás, sem contar o dia da abertura', () => {
  // Sexta, 13/03/2026. Três dias úteis antes: 12 (qui), 11 (qua), 10 (ter).
  const r = prazos.diasUteisAntes('2026-03-13', 3);
  assert.deepEqual(r.uteis, ['2026-03-12', '2026-03-11', '2026-03-10']);
  assert.equal(prazos.chaveDia(r.data), '2026-03-10');
});

test('pula o fim de semana e diz qual dia pulou', () => {
  // Terça, 10/03/2026: 9 (seg), 6 (sex), 5 (qui) — com sábado 7 e domingo 8 fora.
  const r = prazos.diasUteisAntes('2026-03-10', 3);
  assert.deepEqual(r.uteis, ['2026-03-09', '2026-03-06', '2026-03-05']);
  const motivos = r.pulados.map((p) => p.motivo);
  assert.ok(motivos.includes('domingo'));
  assert.ok(motivos.includes('sábado'));
});

test('feriado entra na conta e aparece em `pulados` com o nome', () => {
  const feriados = prazos.feriadosQueValem(
    [{ data: '2026-03-11', nome: 'Aniversário da cidade', abrangencia: 'municipal', municipio: 'Lajeado', uf: 'RS' }],
    { uf: 'RS', municipio: 'Lajeado' }
  );
  const r = prazos.diasUteisAntes('2026-03-13', 3, feriados);
  assert.deepEqual(r.uteis, ['2026-03-12', '2026-03-10', '2026-03-09']);
  assert.ok(r.pulados.some((p) => p.motivo === 'Aniversário da cidade'));
});

test('feriado de outro município não suspende o prazo deste', () => {
  const linhas = [
    { data: '2026-03-11', nome: 'Aniversário de Canoas', abrangencia: 'municipal', municipio: 'Canoas', uf: 'RS' },
  ];
  const valem = prazos.feriadosQueValem(linhas, { uf: 'RS', municipio: 'Lajeado' });
  assert.equal(valem.size, 0, 'feriado de Canoas não vale para órgão de Lajeado');
});

test('feriado estadual só vale na UF dele; nacional vale sempre', () => {
  const linhas = [
    { data: '2026-09-20', nome: 'Revolução Farroupilha', abrangencia: 'estadual', uf: 'RS' },
    { data: '2026-09-07', nome: 'Independência', abrangencia: 'nacional' },
  ];
  const noRs = prazos.feriadosQueValem(linhas, { uf: 'RS', municipio: 'Lajeado' });
  assert.equal(noRs.size, 2);
  const emSp = prazos.feriadosQueValem(linhas, { uf: 'SP', municipio: 'Mairiporã' });
  assert.equal(emSp.size, 1, 'em SP só o nacional conta');
});

test('nome do município com acento e caixa diferente ainda casa', () => {
  const linhas = [
    { data: '2026-03-11', nome: 'Padroeira', abrangencia: 'municipal', municipio: 'MAIRIPORÃ', uf: 'SP' },
  ];
  const valem = prazos.feriadosQueValem(linhas, { uf: 'SP', municipio: 'Mairiporã' });
  assert.equal(valem.size, 1);
});

test('o limite é às 18h do terceiro dia útil', () => {
  const r = prazos.prazoQuestionamento({
    abertura: '2026-03-13T09:00:00',
    uf: 'RS',
    municipio: 'Lajeado',
    agora: new Date('2026-03-01T10:00:00'),
  });
  assert.equal(prazos.chaveDia(r.limite), '2026-03-10');
  assert.equal(r.limite.getHours(), prazos.HORA_LIMITE);
  assert.equal(r.vencido, false);
  assert.equal(r.dias_uteis, 3);
});

test('depois do limite o prazo aparece como vencido', () => {
  const r = prazos.prazoQuestionamento({
    abertura: '2026-03-13T09:00:00',
    agora: new Date('2026-03-12T10:00:00'),
  });
  assert.equal(r.vencido, true);
});

test('dentro de 24 h do limite o prazo aparece como urgente', () => {
  const r = prazos.prazoQuestionamento({
    abertura: '2026-03-13T09:00:00',
    agora: new Date('2026-03-10T09:00:00'),
  });
  assert.equal(r.urgente, true);
  assert.equal(r.vencido, false);
});

test('sem data de abertura não há prazo: devolve null em vez de inventar', () => {
  assert.equal(prazos.prazoQuestionamento({ abertura: null }), null);
  assert.equal(prazos.diasUteisAntes(null, 3), null);
});
