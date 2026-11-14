// Seção 16 (plano SaaS): onde o Consultor jurídico erra calado — pergunta que a base não
// cobre gastando modelo, artigo citado que não está na base, número de artigo ignorado, base
// declarada "revisada" sem advogado, e as 20 perguntas de aceite chegando ao artigo certo.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const juridico = require('../backend/regras/juridico');
const base = require('../backend/config/dados/juridico');
const perguntasDeTeste = require('../backend/config/dados/juridico-teste');
const schema = require('../backend/regras/ia-schema');

test('a base tem o que se promete: artigos únicos, com lei, rótulo, tema e texto; guias que apontam para artigos reais', () => {
  assert.ok(base.ARTIGOS.length >= 40);
  assert.equal(new Set(base.ARTIGOS.map((a) => a.id)).size, base.ARTIGOS.length, 'id repetido');
  for (const a of base.ARTIGOS) {
    assert.ok(a.lei && a.artigo && a.titulo && a.texto.length > 80, `${a.id} incompleto`);
    assert.ok(base.TEMAS[a.tema], `${a.id}: tema desconhecido`);
    assert.ok(Array.isArray(a.termos) && a.termos.length, `${a.id}: sem termos de busca`);
  }
  assert.ok(base.GUIAS.length >= 12);
  for (const g of base.GUIAS) {
    assert.ok(base.TEMAS[g.tema], `${g.id}: tema desconhecido`);
    assert.ok(g.corpo.length >= 2 && g.artigos.length >= 1, `${g.id} sem corpo ou artigo`);
    for (const id of g.artigos) assert.ok(base.POR_ID.has(id), `${g.id} cita artigo inexistente ${id}`);
  }
});

test('aceite sem rede: nas 20 perguntas de teste a busca põe o artigo certo entre os enviados ao modelo', () => {
  assert.equal(perguntasDeTeste.length, 20);
  const falhas = perguntasDeTeste.filter((q) => !juridico.buscarArtigos(q.pergunta).some((t) => q.esperado.includes(t.arquivoId)));
  assert.deepEqual(falhas.map((q) => q.pergunta), []);
  for (const q of perguntasDeTeste) for (const id of q.esperado) assert.ok(base.POR_ID.has(id), `esperado inexistente: ${id}`);
});

test('pergunta que a base não cobre não devolve artigo (e, portanto, não chama o modelo)', () => {
  for (const q of ['Quem ganhou o campeonato de futebol ontem?', 'Qual a receita do bolo de cenoura?', 'Como cozinhar arroz soltinho?', 'olá, tudo bem com você']) {
    assert.deepEqual(juridico.buscarArtigos(q), [], q);
  }
});

test('quem pergunta pelo número do artigo recebe aquele artigo, inclusive dentro de faixa', () => {
  assert.deepEqual(juridico.numerosCitados('O que diz o art. 71 e o artigo 164? E os arts. 96 a 102?').sort(), ['102', '164', '71', '96']);
  assert.equal(juridico.buscarArtigos('Explique o art. 71')[0].arquivoId, 'lei-art-71');
  assert.ok(juridico.buscarArtigos('Fale do artigo 98').some((t) => t.arquivoId === 'lei-art-96'), 'art. 98 está na faixa "arts. 96 a 102"');
  assert.ok(juridico.buscarArtigos('e o art. 125 da lei?').some((t) => t.arquivoId === 'lei-art-124'));
  assert.deepEqual(juridico.numerosCitados('prazo de 5 dias'), []);
});

test('o rótulo T1..Tn vai ao modelo com o artigo; a citação só vale se a frase está no artigo enviado', () => {
  const trechos = juridico.buscarArtigos('Até quando posso impugnar um edital?');
  const t = trechos.find((x) => x.arquivoId === 'lei-art-164');
  assert.ok(t);
  assert.match(juridico.rotularArtigos(trechos), new RegExp(`\\[${t.id}\\] \\(Lei 14\\.133/2021, art\\. 164\\)`));
  const certa = schema.validarResposta(
    { resposta: 'Até 3 dias úteis antes da abertura (art. 164).', encontrado: true, citacoes: [{ trecho: t.id, citacao: 'até 3 dias úteis antes da data de abertura do certame' }], confianca: 0.8 },
    trechos
  );
  assert.equal(certa.dados.encontrado, true);
  assert.equal(certa.dados.citacoes[0].arquivo, 'Lei 14.133/2021, art. 164');
  assert.equal(certa.dados.citacoes[0].arquivo_id, 'lei-art-164');
  // Citação inventada (e artigo que não foi enviado) não sustenta "encontrado".
  const falsa = schema.validarResposta(
    { resposta: 'Segundo o art. 999, tudo é permitido.', encontrado: true, citacoes: [{ trecho: t.id, citacao: 'Frase que não está em artigo nenhum da base' }, { trecho: 'T99', citacao: 'qualquer coisa escrita aqui' }], confianca: 9 },
    trechos
  );
  assert.equal(falsa.dados.encontrado, false);
  assert.equal(falsa.dados.confianca, null);
  assert.ok(falsa.descartados.length >= 2);
});

test('a base só conta como revisada com nome, OAB, data e a flag; faltou um, é minuta', () => {
  const completo = { JURIDICO_REVISADO: 'true', ADVOGADO_REVISOR_NOME: 'Dra. Fulana', ADVOGADO_REVISOR_OAB: 'OAB/RS 12345', JURIDICO_REVISADO_EM: '2026-12-01' };
  const ok = juridico.revisao(completo);
  assert.equal(ok.revisado_por_advogado, true);
  assert.deepEqual(ok.revisor, { nome: 'Dra. Fulana', oab: 'OAB/RS 12345', revisado_em: '2026-12-01' });
  assert.equal(juridico.revisao({}).revisado_por_advogado, false, 'sem nada: minuta');
  assert.equal(juridico.revisao({ ...completo, ADVOGADO_REVISOR_OAB: '' }).revisado_por_advogado, false);
  assert.equal(juridico.revisao({ ...completo, JURIDICO_REVISADO_EM: '01/12/2026' }).revisado_por_advogado, false);
  assert.equal(juridico.revisao({ ...completo, JURIDICO_REVISADO: 'false' }).revisor, null);
  assert.equal(juridico.revisao(completo).versao_base, base.VERSAO_BASE);
});

test('um advogado, três textos: cada texto tem a própria data e flag, e data impossível não vale', () => {
  const { revisao } = require('../backend/regras/revisao');
  const env = { ADVOGADO_REVISOR_NOME: 'Dr. X', ADVOGADO_REVISOR_OAB: 'OAB/SC 1', LEGAL_REVISADO: 'true', LEGAL_REVISADO_EM: '2026-12-02', JURIDICO_REVISADO: 'true', JURIDICO_REVISADO_EM: '2026-02-31' };
  assert.equal(revisao(env, 'LEGAL').revisado_por_advogado, true);
  assert.equal(revisao(env, 'JURIDICO').revisado_por_advogado, false, '31 de fevereiro não é data');
  assert.equal(revisao(env, 'PARCEIROS').revisado_por_advogado, false, 'o termo dos parceiros não foi revisado');
  assert.equal(revisao({ ...env, LEGAL_REVISADO_EM: '2026-13-45' }, 'LEGAL').revisado_por_advogado, false, 'mês 13 não explode, só não vale');
  assert.throws(() => revisao(env, 'OUTRO'));
});

test('pedido: tamanho mínimo e máximo; título da conversa é o começo da primeira pergunta', () => {
  assert.match(juridico.lerPedido({ pergunta: 'oi' }).erro, /pelo menos/);
  assert.match(juridico.lerPedido({ pergunta: 'x'.repeat(501) }).erro, /passa de/);
  assert.match(juridico.lerPedido({}).erro, /pelo menos/);
  assert.equal(juridico.lerPedido({ pergunta: '  Qual   o prazo   de recurso?  ' }).pergunta, 'Qual o prazo de recurso?');
  assert.equal(juridico.tituloDaConversa('curta pergunta'), 'curta pergunta');
  assert.ok(juridico.tituloDaConversa('a'.repeat(100)).length <= 60);
});

test('biblioteca: busca por palavra inteira em qualquer parte, filtro por tema, título pesa mais', () => {
  assert.equal(juridico.buscarNaBiblioteca('', '').length, base.GUIAS.length);
  assert.equal(juridico.buscarNaBiblioteca('impugnar', '')[0].id, 'como-impugnar');
  assert.ok(juridico.buscarNaBiblioteca('', 'sancoes').every((g) => g.tema === 'sancoes'));
  assert.deepEqual(juridico.buscarNaBiblioteca('palavraquenaoexiste', ''), []);
  assert.ok(juridico.pesquisarArtigos('multa', '').some((a) => a.id === 'lei-art-156'));
});
