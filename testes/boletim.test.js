// Boletim diário (Seção 4 do plano SaaS): o filtro roda no nosso banco, e é
// aqui que ele erra calado — palavra que casa dentro de outra, exclusão que não
// exclui, horário que sai duas vezes, link de descadastro forjado.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const r = require('../backend/regras/boletim');

const perfil = (extra = {}) => r.lerPerfil({ ...r.validarPerfil({ nome: 'Teste', palavras: ['software'], ...extra }) });
const lic = (extra = {}) => ({ objeto: 'Contratação de software de gestão escolar', uf: 'RS', municipio: 'Porto Alegre', modalidade: 'Pregão - Eletrônico', valor_estimado: 50000, pontuacao: 40, ...extra });

test('palavra casa no começo da palavra, sem acento e sem caixa', () => {
  assert.equal(r.casar(perfil({ palavras: ['GESTAO'] }), lic()).casa, true);
  assert.equal(r.casar(perfil({ palavras: ['ti'] }), lic({ objeto: 'Material de multimídia e gestião' })).casa, false);
  assert.equal(r.casar(perfil({ palavras: ['ti'] }), lic({ objeto: 'Serviços de TI.' })).casa, true);
  assert.equal(r.casar(perfil({ palavras: ['monitor'] }), lic({ objeto: 'Notebooks e monitores' })).casa, true);
});

test('palavra só no texto do edital entra, marcada como edital', () => {
  const p = perfil({ palavras: ['rastreamento veicular'] });
  assert.deepEqual(r.casar(p, lic()), { casa: false, motivo: 'palavra' });
  const c = r.casar(p, lic(), 'Anexo I — serviço de Rastreamento Veicular por GPS');
  assert.equal(c.casa, true);
  assert.equal(c.onde, 'edital');
});

test('exclusão vale no objeto, não no edital', () => {
  const p = perfil({ palavras: ['software'], exclusoes: ['escolar'] });
  assert.equal(r.casar(p, lic()).motivo, 'exclusao');
  const p2 = perfil({ palavras: ['software'], exclusoes: ['merenda'] });
  assert.equal(r.casar(p2, lic(), 'cláusula sobre merenda').casa, true);
});

test('UF, município, modalidade, faixa de valor e nota', () => {
  assert.equal(r.casar(perfil({ ufs: ['sc'] }), lic()).motivo, 'uf');
  assert.equal(r.casar(perfil({ municipios: ['porto alegre'] }), lic()).casa, true);
  assert.equal(r.casar(perfil({ municipios: ['Canoas'] }), lic()).motivo, 'municipio');
  assert.equal(r.casar(perfil({ modalidades: ['Pregão'] }), lic()).casa, true);
  assert.equal(r.casar(perfil({ modalidades: ['Concorrência'] }), lic()).motivo, 'modalidade');
  assert.equal(r.casar(perfil({ valor_minimo: 60000 }), lic()).motivo, 'valor');
  assert.equal(r.casar(perfil({ valor_maximo: 10000 }), lic()).motivo, 'valor');
  // Sem valor (sigiloso ou não informado) passa: lacuna, não exclusão.
  assert.equal(r.casar(perfil({ valor_minimo: 60000 }), lic({ valor_estimado: null })).casa, true);
  assert.equal(r.casar(perfil({ nota_minima: 50 }), lic()).motivo, 'nota');
  // Nunca pontuada pela organização: a nota não barra.
  assert.equal(r.casar(perfil({ nota_minima: 50 }), lic({ pontuacao: null })).casa, true);
});

test('filtro sem palavra não casa nada', () => {
  assert.equal(r.casar(perfil({ palavras: [] }), lic()).motivo, 'sem_palavras');
});

test('validação do filtro', () => {
  assert.throws(() => r.validarPerfil({ nome: '' }), /nome/);
  assert.throws(() => r.validarPerfil({ nome: 'x', ufs: ['RSS'] }), /UF|longo/);
  assert.throws(() => r.validarPerfil({ nome: 'x', valor_minimo: 10, valor_maximo: 5 }), /mínimo/);
  assert.throws(() => r.validarPerfil({ nome: 'x', horarios: [25] }), /Horário/);
  assert.deepEqual(r.validarPerfil({ nome: 'x', horarios: '18, 7 7' }).horarios, [7, 18]);
  assert.deepEqual(r.validarPerfil({ nome: 'x', palavras: 'a, b\nb' }).palavras, ['a', 'b']);
  assert.deepEqual(r.validarPerfil({ nome: 'x' }).horarios, [7, 12, 18]);
  assert.deepEqual(Object.keys(r.validarPerfil({ ativo: false }, { parcial: true })), ['ativo']);
});

test('horário devido: só o mais recente, e uma vez só', () => {
  assert.equal(r.horarioDevido([7, 12, 18], 6, []), null);
  assert.equal(r.horarioDevido([7, 12, 18], 7, []), 7);
  assert.equal(r.horarioDevido([7, 12, 18], 7, [7]), null);
  assert.equal(r.horarioDevido([7, 12, 18], 19, []), 18);
  assert.equal(r.horarioDevido([7, 12, 18], 13, [7]), 12);
});

test('token de descadastro: confere e não aceita forjado', () => {
  const t = r.tokenDescadastro('segredo', 3, 9);
  assert.deepEqual(r.lerTokenDescadastro('segredo', t), { perfilId: 3, usuarioId: 9 });
  assert.equal(r.lerTokenDescadastro('outro', t), null);
  const [, , assinatura] = t.split('.');
  assert.equal(r.lerTokenDescadastro('segredo', `3.10.${assinatura}`), null);
  assert.equal(r.lerTokenDescadastro('segredo', 'lixo'), null);
});

test('e-mail mostra lacuna, nunca valor inventado', () => {
  const texto = r.montarTexto({ nome: 'F' }, { numero: 2, data: '2026-11-13', horario: 7 }, [lic({ valor_estimado: null, orgao_nome: null, fim_propostas: null })]);
  assert.match(texto, /valor estimado ____________/);
  assert.match(texto, /Boletim nº 2 de 13\/11\/2026, 07h/);
  assert.equal(r.formatarValor({ orcamento_sigiloso: 1, valor_estimado: 10 }), 'sigiloso');
});
