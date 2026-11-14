// "Meu desempenho" (Seção 15): o que erra calado nas contas — a janela de meses,
// a taxa sobre quem já teve resultado, o ticket médio sem as ganhas sem valor, a
// margem sobre o preço e a lacuna onde não há custo. Sem banco e sem rede.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const r = require('../backend/regras/desempenho');

const HOJE = '2026-11-14';

test('janelas: 1, 3, 6 meses e 1 ano contam em calendário; "todo" não tem início', () => {
  assert.deepEqual(r.periodoDesempenho({ janela: '1m' }, { hoje: HOJE }), { janela: '1m', rotulo: 'Último mês', de: '2026-10-14', ate: HOJE });
  assert.equal(r.periodoDesempenho({ janela: '3m' }, { hoje: HOJE }).de, '2026-08-14');
  assert.equal(r.periodoDesempenho({ janela: '1a' }, { hoje: HOJE }).de, '2025-11-14');
  assert.equal(r.periodoDesempenho({ janela: 'todo' }, { hoje: HOJE }).de, null);
});

test('janela: dia 31 em mês curto cai no último dia, sem pular de mês', () => {
  assert.equal(r.mesesAntes('2026-03-31', 1), '2026-02-28');
  assert.equal(r.mesesAntes('2024-03-31', 1), '2024-02-29');
  assert.equal(r.mesesAntes('2026-01-15', 2), '2025-11-15');
});

test('período: sem nada vale o padrão; datas sem janela viram "definido"; invertidas trocam', () => {
  assert.equal(r.periodoDesempenho({}, { hoje: HOJE }).janela, r.JANELA_PADRAO);
  assert.equal(r.periodoDesempenho({ janela: 'invalida' }, { hoje: HOJE }).janela, r.JANELA_PADRAO);
  const p = r.periodoDesempenho({ de: '2026-05-01', ate: '2026-03-01' }, { hoje: HOJE });
  assert.deepEqual([p.janela, p.de, p.ate], ['definido', '2026-03-01', '2026-05-01']);
  // data inexistente é ignorada, não vira erro
  assert.equal(r.periodoDesempenho({ janela: 'definido', de: '2026-02-30', ate: '2026-06-30' }, { hoje: HOJE }).de, '2025-12-30');
});

test('taxa de vitória: o que está em disputa não conta como derrota; sem resultado é nulo', () => {
  assert.equal(r.taxaDeVitoria(1, 3), 0.25);
  assert.equal(r.taxaDeVitoria(0, 0), null);
});

const ganha = (extra = {}) => ({ id: 1, etapa: 'Ganhamos', valor_estimado: 100000, valor_proposto: 80000, valor_final: 80000, ...extra });

test('margem: sobre o preço, não sobre o custo; sem custo é lacuna, não zero', () => {
  const m = r.margemDaParticipacao(ganha({ custo_estimado: 60000 }));
  assert.equal(m.margem_pct, 0.25); // (80000−60000)/80000
  assert.equal(m.margem_valor, 20000);
  assert.equal(m.margem_sinal, 'ok');
  const sem = r.margemDaParticipacao(ganha());
  assert.equal(sem.margem_pct, null);
  assert.equal(sem.custo, null);
});

test('margem: no prejuízo vira sinal de erro e entra na contagem', () => {
  const m = r.margemDaParticipacao(ganha({ custo_estimado: 90000 }));
  assert.equal(m.margem_pct, -0.125);
  assert.equal(m.margem_sinal, 'erro');
});

test('preço da ganha: contrato vence resultado, que vence proposta; as demais usam a proposta', () => {
  assert.deepEqual(
    [r.precoECusto(ganha({ contrato_valor: 75000 })).preco, r.precoECusto(ganha({ contrato_valor: 75000 })).preco_fonte],
    [75000, 'contrato']
  );
  assert.equal(r.precoECusto(ganha({ contrato_valor: null })).preco_fonte, 'resultado');
  assert.equal(r.precoECusto(ganha({ contrato_valor: null, valor_final: null })).preco_fonte, 'proposta');
  // perdida: o valor_final é o do vencedor, nunca o meu preço
  const perdida = { etapa: 'Perdemos', valor_proposto: 90000, valor_final: 70000 };
  assert.equal(r.precoECusto(perdida).preco, 90000);
});

test('custo: o total da proposta (itens) vence o custo estimado da licitação', () => {
  const c = r.precoECusto(ganha({ proposta_custo: 50000, custo_estimado: 60000 }));
  assert.deepEqual([c.custo, c.custo_fonte], [50000, 'proposta']);
  assert.equal(r.precoECusto(ganha({ custo_estimado: 60000 })).custo_fonte, 'custo estimado');
});

test('margem do conjunto: ponderada pelo valor, não a média das margens', () => {
  const s = r.resumirMargens([
    { preco: 100, custo: 50, margem_pct: 0.5 },
    { preco: 900, custo: 900, margem_pct: 0 },
    { preco: 50, custo: null, margem_pct: null }, // sem custo: fora da conta
  ]);
  assert.equal(s.licitacoes, 2);
  assert.equal(s.margem_ponderada, 0.05); // 50 / 1000
  assert.equal(s.margem_media, 0.25);
  assert.equal(s.lucro, 50);
  assert.equal(r.resumirMargens([]).margem_ponderada, null);
});

test('resumo: totais, ticket médio sem as ganhas sem valor e taxa só sobre o resolvido', () => {
  const linhas = [
    ganha({ id: 1, valor_final: 100, valor_proposto: 100, valor_estimado: 200 }),
    ganha({ id: 2, valor_final: 300, valor_proposto: 300, valor_estimado: 400 }),
    ganha({ id: 3, valor_final: null, valor_proposto: null, valor_estimado: null }), // ganha sem valor
    { id: 4, etapa: 'Perdemos', valor_proposto: 500, valor_final: 400, valor_estimado: 600 },
    { id: 5, etapa: 'Em disputa', valor_proposto: 50, valor_estimado: 100 },
  ];
  const { totais } = r.resumir(linhas);
  assert.equal(totais.participacoes, 5);
  assert.deepEqual([totais.ganhas, totais.perdidas, totais.em_andamento], [3, 1, 1]);
  assert.equal(totais.taxa_vitoria, 0.75);
  assert.equal(totais.valor_ganho, 400);
  assert.equal(totais.ticket_medio, 200); // 400 / 2, não 400 / 3
  assert.equal(totais.ganhas_sem_valor, 1);
  // desconto médio só entre quem tem estimado e valor: 0.5, 0.25, 0.1666…, 0.5
  assert.equal(totais.com_desconto, 4);
});

test('resumo: motivo da perda reaproveita a regra do histórico (preço por pouco, sem proposta)', () => {
  const { motivos } = r.resumir([
    { id: 1, etapa: 'Perdemos', valor_proposto: 103, valor_final: 100 },
    { id: 2, etapa: 'Perdemos', valor_proposto: null, valor_final: 100 },
  ]);
  assert.deepEqual(motivos.map((m) => m.motivo).sort(), ['preco_por_pouco', 'sem_proposta']);
});

test('resumo: órgãos e portais agrupam por chave, com "não informado" para o que falta', () => {
  const { por_orgao: orgaos, por_portal: portais } = r.resumir([
    ganha({ id: 1, orgao_cnpj: '111', orgao_nome: 'Prefeitura A', plataforma_disputa: 'BLL' }),
    { id: 2, etapa: 'Perdemos', orgao_cnpj: '111', orgao_nome: 'Prefeitura A', plataforma_disputa: 'BLL' },
    { id: 3, etapa: 'Perdemos', orgao_cnpj: '222', orgao_nome: 'Câmara B', plataforma_disputa: null },
  ]);
  assert.equal(orgaos[0].rotulo, 'Prefeitura A');
  assert.deepEqual([orgaos[0].participacoes, orgaos[0].ganhas, orgaos[0].perdidas, orgaos[0].taxa_vitoria], [2, 1, 1, 0.5]);
  assert.equal(portais.find((p) => p.chave === '—').rotulo, 'Portal não informado');
});

test('contratos e mercado: contam só o que tem os dois lados', () => {
  const { contratos, mercado } = r.resumir([
    ganha({ id: 1, contrato_id: 7, contrato_valor: 80000, contrato_executado: 20000, contrato_situacao: 'vigente', desconto_mercado: 0.1 }),
    ganha({ id: 2 }), // ganha sem contrato
    { id: 3, etapa: 'Perdemos', valor_estimado: 100, valor_proposto: 95, desconto_mercado: 0.3 },
  ]);
  assert.deepEqual([contratos.ganhas_com_contrato, contratos.ganhas_sem_contrato, contratos.valor, contratos.valor_executado, contratos.vigentes], [1, 1, 80000, 20000, 1]);
  assert.equal(mercado.com_historico, 2);
  assert.equal(mercado.comparadas, 2);
  // só as duas licitações com histórico entram: o do mercado é (0.1 + 0.3) / 2
  assert.equal(mercado.desconto_mercado, 0.2);
});

test('desconto: o valor_final da perdida é o do vencedor e não vira desconto meu', () => {
  const perdida = { etapa: 'Perdemos', valor_estimado: 100, valor_proposto: null, valor_final: 80 };
  assert.equal(r.descontoDaProposta(perdida), null);
  assert.equal(r.resumir([{ ...perdida, valor_proposto: 90 }]).totais.desconto_medio, 0.1);
  // ganha sem proposta registrada: o resultado é o meu preço
  assert.equal(r.resumir([{ etapa: 'Ganhamos', valor_estimado: 100, valor_proposto: null, valor_final: 80 }]).totais.desconto_medio, 0.2);
  assert.equal(r.resumir([perdida]).totais.com_desconto, 0);
});
