// Assistente de primeiro acesso, NPS e termos (Seção 17): o que erra calado —
// CNPJ com dígito errado, palavra repetida por caixa/acento, UF inventada,
// pesquisa de NPS perguntada cedo demais ou de novo logo depois de respondida.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const r = require('../backend/regras/onboarding');

test('CNPJ: confere os dois dígitos e rejeita sequência repetida', () => {
  assert.equal(r.cnpjValido('11.222.333/0001-81'), true);
  assert.equal(r.cnpjValido('11222333000181'), true);
  assert.equal(r.cnpjValido('11.222.333/0001-82'), false); // último dígito errado
  assert.equal(r.cnpjValido('11.222.333/0001-91'), false); // penúltimo errado
  assert.equal(r.cnpjValido('00000000000000'), false);
  assert.equal(r.cnpjValido('123'), false);
  assert.equal(r.cnpjValido(''), false);
  assert.equal(r.formatarCnpj('11222333000181'), '11.222.333/0001-81');
});

test('palavras-chave: uma por linha, sem repetida por caixa ou acento, com o motivo do descarte', () => {
  const { palavras, descartadas } = r.limparPalavras('Material de Escritório\nmaterial de escritorio\n  papel   A4 \nab\n\ntoner; Toner');
  assert.deepEqual(palavras, ['Material de Escritório', 'papel A4', 'toner']);
  assert.deepEqual(descartadas.map((d) => d.motivo), ['repetida', 'curta demais (mínimo 3 letras)', 'repetida']);
});

test('palavras-chave: vírgula não separa, e o teto de 60 vale', () => {
  assert.deepEqual(r.limparPalavras('luvas, procedimento').palavras, ['luvas, procedimento']);
  const muitas = Array.from({ length: 70 }, (_, i) => `produto numero ${i}`);
  const saida = r.limparPalavras(muitas);
  assert.equal(saida.palavras.length, r.MAX_PALAVRAS);
  assert.equal(saida.descartadas.length, 10);
  assert.match(saida.descartadas[0].motivo, /passou de 60/);
});

test('CNAE: 7 dígitos em qualquer máscara, o primeiro é o principal, repetido some', () => {
  const { cnaes, invalidos } = r.limparCnaes(['4789-0/99', { codigo: '47.89-0-99' }, '62.01-5-01', '12345', 'abc']);
  assert.deepEqual(cnaes.map((c) => c.codigo), ['4789-0/99', '6201-5/01']);
  assert.equal(cnaes[0].principal, true);
  assert.equal(cnaes[1].principal, false);
  assert.deepEqual(invalidos, ['12345', 'abc']);
});

test('UF: só as 27, em maiúscula, sem repetir', () => {
  assert.deepEqual(r.limparUfs('rs, sc ; RS').ufs, ['RS', 'SC']);
  assert.deepEqual(r.limparUfs(['XX', 'sp']).invalidas, ['XX']);
  assert.equal(r.UFS.length, 27);
});

test('assistente: exige palavra-chave e barra CNPJ, CNAE e UF inválidos com frase em português', () => {
  assert.match(r.validarAssistente({}).erro, /pelo menos uma palavra-chave/);
  assert.match(r.validarAssistente({ palavras: ['ab'] }).erro, /pelo menos uma palavra-chave/);
  assert.match(r.validarAssistente({ palavras: ['toner'], empresa: { cnpj: '11222333000182' } }).erro, /CNPJ/);
  assert.match(r.validarAssistente({ palavras: ['toner'], empresa: { cnaes: ['123'] } }).erro, /CNAE inválido: 123/);
  assert.match(r.validarAssistente({ palavras: ['toner'], ufs: ['ZZ'] }).erro, /UF inválida: ZZ/);
});

test('assistente: corpo bom vira dados limpos; o que não veio fica nulo, não inventado', () => {
  const { dados, erro } = r.validarAssistente({
    empresa: { razao_social: ' Alfa Ltda ', cnpj: '11222333000181', cnaes: ['4789-0/99'] },
    palavras: 'toner\nPapel',
    exclusoes: 'usado',
    ufs: ['rs'],
  });
  assert.equal(erro, undefined);
  assert.equal(dados.empresa.razao_social, 'Alfa Ltda');
  assert.equal(dados.empresa.cnpj, '11.222.333/0001-81');
  assert.deepEqual(dados.palavras, ['toner', 'Papel']);
  assert.deepEqual(dados.ufs, ['RS']);

  const minimo = r.validarAssistente({ palavras: ['toner'] }).dados;
  assert.equal(minimo.empresa.razao_social, null);
  assert.equal(minimo.empresa.cnpj, null);
  assert.deepEqual(minimo.ufs, []);
});

test('passos: cada um só vale feito com o dado de verdade', () => {
  const todos = r.passos({});
  assert.deepEqual(todos.map((p) => p.feito), [false, false, false, false, false]);
  const parcial = r.passos({ empresa: true, palavras: 3, filtro: 1 });
  assert.deepEqual(parcial.filter((p) => p.feito).map((p) => p.chave), ['empresa', 'palavras', 'filtro']);
});

test('NPS: nunca no primeiro mês; dispensou volta em 30 dias; respondeu só em 180', () => {
  const agora = new Date('2026-12-31T12:00:00Z');
  const diasAtras = (n) => new Date(agora.getTime() - n * 86400000);
  assert.equal(r.npsDevido({ membroDesde: diasAtras(29), ultima: null, agora }), false);
  assert.equal(r.npsDevido({ membroDesde: diasAtras(30), ultima: null, agora }), true);
  assert.equal(r.npsDevido({ membroDesde: null, ultima: null, agora }), false);
  assert.equal(r.npsDevido({ membroDesde: diasAtras(90), ultima: { criada_em: diasAtras(10), nota: null }, agora }), false);
  assert.equal(r.npsDevido({ membroDesde: diasAtras(90), ultima: { criada_em: diasAtras(31), nota: null }, agora }), true);
  assert.equal(r.npsDevido({ membroDesde: diasAtras(300), ultima: { criada_em: diasAtras(100), nota: 9 }, agora }), false);
  assert.equal(r.npsDevido({ membroDesde: diasAtras(300), ultima: { criada_em: diasAtras(181), nota: 9 }, agora }), true);
});

test('NPS: nota de 0 a 10 inteira; a conta é % promotores − % detratores', () => {
  assert.match(r.validarNps({}).erro, /nota de 0 a 10/);
  assert.match(r.validarNps({ nota: 11 }).erro, /nota de 0 a 10/);
  assert.match(r.validarNps({ nota: 7.5 }).erro, /nota de 0 a 10/);
  assert.deepEqual(r.validarNps({ nota: 0, comentario: '  ' }).dados, { nota: 0, comentario: null });
  // 4 promotores, 2 neutros, 4 detratores em 10 → 0.
  assert.deepEqual(r.resumirNps([10, 9, 9, 10, 8, 7, 6, 0, 3, 5]), { total: 10, promotores: 4, neutros: 2, detratores: 4, nps: 0 });
  assert.equal(r.resumirNps([10, 10, 9, 8]).nps, 75);
  assert.equal(r.resumirNps([]).nps, null);
  assert.equal(r.resumirNps([null, undefined]).total, 0); // dispensa não conta como nota
});

test('termos: versão diferente da vigente é pendente', () => {
  assert.equal(r.termosPendentes('2026-11-14', '2026-11-14'), false);
  assert.equal(r.termosPendentes(null, '2026-11-14'), true);
  assert.equal(r.termosPendentes('2026-01-01', '2026-11-14'), true);
});

// ------------------------------------------------------------ central de ajuda
const ajuda = require('../backend/regras/ajuda');
const { GUIAS } = require('../backend/config/dados/ajuda');
const legal = require('../backend/config/dados/legal');

test('ajuda: busca sem acento nem caixa, todas as palavras, e o título pesa mais', () => {
  assert.equal(ajuda.buscar(GUIAS, '').length, GUIAS.length);
  assert.ok(ajuda.buscar(GUIAS, 'boletim').some((g) => g.id === 'boletins'));
  assert.equal(ajuda.buscar(GUIAS, 'horario boletim')[0].id, 'boletins');
  assert.equal(ajuda.buscar(GUIAS, 'DECLARAÇÃO')[0].id, 'documentos');
  assert.equal(ajuda.buscar(GUIAS, 'excluir apagar dados')[0].id, 'privacidade');
  assert.deepEqual(ajuda.buscar(GUIAS, 'boletim xyzinexistente'), []);
});

test('ajuda: todo guia tem o que a tela precisa e nenhum vídeo é inventado', () => {
  const ids = new Set();
  for (const g of GUIAS) {
    assert.ok(g.id && g.titulo && g.resumo && g.passos.length >= 2, `guia incompleto: ${g.id}`);
    assert.equal(ids.has(g.id), false, `id repetido: ${g.id}`);
    ids.add(g.id);
    assert.equal(g.video, null, 'sem vídeo gravado, o campo fica nulo (a tela mostra "em produção")');
  }
});

test('termos: dado que falta da operadora vira lacuna visível, nunca valor inventado', () => {
  const vazio = legal.documentos({});
  assert.equal(vazio.operadora.razao_social, legal.LACUNA);
  assert.equal(vazio.operadora.cnpj, legal.LACUNA);
  assert.match(JSON.stringify(vazio.termos), /____________/);
  const preenchido = legal.documentos({ OPERADORA_RAZAO_SOCIAL: 'Mythos Ltda', OPERADORA_CNPJ: '11.222.333/0001-81', SUPORTE_EMAIL: 'ajuda@x.com' });
  assert.equal(preenchido.operadora.razao_social, 'Mythos Ltda');
  assert.equal(preenchido.operadora.encarregado, 'ajuda@x.com');
  assert.equal(preenchido.revisado_por_advogado, false, 'minuta: a flag só vira true quando o advogado revisar');
  assert.ok(preenchido.aviso_ia.length >= 2 && preenchido.privacidade.length && preenchido.versao);
});
