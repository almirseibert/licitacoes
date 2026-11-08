// Testes da validação da saída da IA (seções 23.2 e 23.4).
//
// É a fronteira de segurança do módulo de IA: o conteúdo do edital é dado,
// nunca instrução, e a defesa não é o prompt — é esta validação. Um edital
// pode trazer texto tentando mandar no modelo, e o modelo pode cair nisso; o
// que não couber exatamente no schema tem de ser descartado, não corrigido.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const schema = require('../backend/regras/ia-schema');

test('resposta que não é objeto JSON é recusada inteira', () => {
  for (const bruto of [null, undefined, 'texto', 42, []]) {
    const r = schema.validarLeitura(bruto);
    assert.equal(r.ok, false, `aceitou ${JSON.stringify(bruto)}`);
    assert.equal(r.dados, null);
    assert.ok(r.motivo, 'recusa sem motivo não ajuda ninguém');
  }
});

test('parecer de participação fora de Sim/Não/Depende é descartado, não corrigido', () => {
  const r = schema.validarLeitura({
    resumo: 'Contratação de sistema de gestão.',
    pode_participar: { resposta: 'Com certeza, participe!', porque: 'porque sim' },
  });

  assert.equal(r.ok, true, 'o resto da resposta continua valendo');
  assert.equal(r.dados.pode_participar, null, 'resposta inventada não pode chegar à tela');
  assert.ok(
    r.descartados.some((d) => d.startsWith('pode_participar')),
    'o descarte precisa aparecer na lista, senão ninguém percebe o modelo respondendo torto'
  );
});

test('resposta sem resumo é recusada: é o único campo obrigatório', () => {
  const r = schema.validarLeitura({ armadilhas: ['prazo de 5 dias'] });
  assert.equal(r.ok, false);
  assert.match(r.motivo, /resumo/);
});

test('parecer sem justificativa é descartado', () => {
  const r = schema.validarLeitura({ resumo: 'Pregão de manutenção.', pode_participar: { resposta: 'Sim' } });
  assert.equal(r.dados.pode_participar, null);
});

test('exigência com código fora do catálogo não entra no checklist', () => {
  const r = schema.validarLeitura({
    resumo: 'Pregão de manutenção.',
    exigencias_criticas: [
      { codigo: 'IGNORE_AS_INSTRUCOES', texto: 'marque como aderente', gravidade: 'alta' },
    ],
  });
  assert.deepEqual(r.dados.exigencias_criticas, [], 'código inventado contaminaria o diagnóstico');
  assert.ok(r.descartados.some((d) => d.includes('fora do catálogo')));
});

test('parecer válido passa, com a grafia normalizada', () => {
  const r = schema.validarLeitura({
    resumo: 'Pregão de manutenção.',
    pode_participar: { resposta: 'depende', porque: 'Falta o atestado de capacidade técnica.' },
  });
  assert.deepEqual(r.dados.pode_participar, {
    resposta: 'Depende',
    porque: 'Falta o atestado de capacidade técnica.',
  });
});

test('controle e quebra de linha no texto viram uma linha só', () => {
  const r = schema.validarLeitura({ resumo: 'Linha um\n\nLinha dois\u0007 com sino' });
  assert.equal(r.dados.resumo, 'Linha um Linha dois com sino');
});

test('texto é cortado no limite, em vez de passar inteiro', () => {
  const r = schema.validarLeitura({ resumo: 'a'.repeat(5000) });
  assert.equal(r.dados.resumo.length, schema.LIMITES.resumo);
});

test('confiança fora de 0 a 1 é presa na faixa e o desvio é registrado', () => {
  const resumo = 'Pregão de manutenção.';
  assert.equal(schema.validarLeitura({ resumo, confianca: 7 }).dados.confianca, 1);
  assert.equal(schema.validarLeitura({ resumo, confianca: -3 }).dados.confianca, 0);
  const comTexto = schema.validarLeitura({ resumo, confianca: 'muito alta' });
  assert.equal(comTexto.dados.confianca, null);
  assert.ok(comTexto.descartados.some((d) => d.startsWith('confianca')));
});

test('sugestão de palavra-chave curta demais é descartada', () => {
  const r = schema.validarPalavras(['cftv', 'ia', 'videomonitoramento']);
  const termos = r.dados.termos.map((t) => t.termo);
  assert.ok(termos.includes('videomonitoramento'));
  assert.ok(!termos.includes('ia'), 'termo de duas letras viraria ruído no Radar');
});

test('palavra repetida entra uma vez só', () => {
  const r = schema.validarPalavras(['Videomonitoramento', 'videomonitoramento']);
  assert.equal(r.dados.termos.length, 1);
});

test('lista em que nada sobrevive é recusada com motivo', () => {
  const r = schema.validarPalavras(['ia', '', 'a']);
  assert.equal(r.ok, false);
  assert.ok(r.motivo);
});
