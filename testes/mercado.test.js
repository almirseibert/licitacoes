// Seção 12 — contratos, atas e acompanhamentos do mercado. Sem banco e sem rede.
// O que erra calado: a hora do PNCP ganhar fuso, a ata perder a contratação de
// origem (e o acompanhamento não casar com a favorita), ata sem valor virar R$ 0,
// edital só divulgado virar "publicação posterior", e filtro de tela virar SQL.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const regras = require('../backend/regras/mercado');
const notificacoes = require('../backend/regras/notificacoes');

// Registros reais da busca do PNCP (14/11/2026), cortados ao que interessa.
const CONTRATO = {
  numero_controle_pncp: '92402510000103-2-000135/2026',
  numero_contratacao: '92402510000103-1-000167/2026',
  numero_contrato_empenho: '6263',
  title: 'Empenho nº 6263',
  tipo_contrato_nome: 'Empenho',
  orgao_cnpj: '92402510000103',
  orgao_nome: 'MUNICIPIO DE RELVADO',
  esfera_nome: 'Municipal',
  poder_nome: 'Não se aplica',
  uf: 'RS',
  municipio_nome: 'Relvado',
  modalidade_licitacao_nome: 'Dispensa',
  description: 'Aquisição de 35 cestas básicas',
  valor_global: 5806.5,
  fornecedor_ni: '00607814000199',
  fornecedor_nome: 'COMERCIAL DE ALIMENTOS RELVADO LTDA',
  data_assinatura: '2026-11-13',
  data_inicio_vigencia: '2026-11-13',
  data_fim_vigencia: '2026-11-13',
  cancelado: false,
  data_publicacao_pncp: '2026-11-14T08:01:19.919451820',
  data_atualizacao_pncp: '2026-11-14T08:01:20.083313258',
};
const ATA = {
  title: 'Ata nº 1495/2025',
  numero_controle_pncp: '87958658000199-1-000972/2025-000003',
  numero_sequencial_compra_ata: '972',
  ano: '2025',
  orgao_cnpj: '87958658000199',
  esfera_nome: 'Estadual',
  uf: 'RS',
  data_fim_vigencia: '2026-11-13',
  valor_global: null,
  fornecedor_ni: null,
  permite_adesao: true,
  data_publicacao_pncp: '2025-11-13T17:39:30.825845',
};

test('hora do PNCP: lida como Brasília, gravada em UTC', () => {
  assert.equal(regras.dataHora('2026-11-14T08:01:19.919451820'), '2026-11-14 08:01:19');
  assert.equal(regras.dataHora('2026-11-13T00:00'), '2026-11-13 00:00:00');
  assert.equal(regras.dataHora('2026-11-13'), '2026-11-13 00:00:00');
  assert.equal(regras.dataHora(null), null);
  assert.equal(regras.dataHora('lixo'), null);
  // No banco vai UTC (timezone 'Z'): 23:30 em Brasília já é o dia seguinte.
  assert.equal(regras.instante('2026-11-13T23:30:00.5'), '2026-11-14 02:30:00');
  assert.equal(regras.instante(''), null);
});

test('contrato normalizado guarda fornecedor, valor e a contratação de origem', () => {
  const c = regras.normalizarContrato(CONTRATO);
  assert.equal(c.numero_controle, '92402510000103-2-000135/2026');
  assert.equal(c.numero_controle_compra, '92402510000103-1-000167/2026');
  assert.equal(c.numero_contrato, '6263');
  assert.equal(c.fornecedor_ni, '00607814000199');
  assert.equal(c.valor_global, 5806.5);
  assert.equal(c.vigencia_fim, '2026-11-13');
  assert.equal(c.publicado_em, '2026-11-14 11:01:19', 'Brasília 08:01 = 11:01 UTC, que é o que o banco guarda');
  assert.equal(c.cancelado, 0);
});

test('ata acha a contratação pelo próprio ID e não inventa valor nem fornecedor', () => {
  const a = regras.normalizarAta(ATA);
  assert.equal(a.numero_controle_compra, '87958658000199-1-000972/2025');
  assert.equal(a.numero_ata, '1495/2025');
  assert.equal(a.valor_global, null, 'ata sem valor é NULL, nunca 0');
  assert.equal(a.fornecedor_ni, null);
  assert.equal(a.permite_adesao, 1);
  // ID fora do formato: reconstrói pelo CNPJ + sequencial + ano.
  assert.equal(regras.compraDaAta('x', ATA), '87958658000199-1-000972/2025');
  assert.equal(regras.compraDaAta('x', {}), null);
});

test('contrato e ata viram publicação com chave estável; sem contratação, não vira', () => {
  const p = regras.publicacaoDe('contrato', regras.normalizarContrato(CONTRATO));
  assert.equal(p.chave, 'contrato:92402510000103-2-000135/2026');
  assert.equal(p.numero_controle_compra, '92402510000103-1-000167/2026');
  assert.match(p.descricao, /Empenho nº 6263 · com COMERCIAL/);
  const pa = regras.publicacaoDe('ata', regras.normalizarAta(ATA));
  assert.match(pa.descricao, /vigente até 13\/11\/2026/);
  assert.equal(regras.publicacaoDe('contrato', { numero_controle: 'x', numero_controle_compra: null }), null);
});

test('contratação: homologação e situação viram publicação; edital só divulgado, não', () => {
  const base = {
    numeroControlePNCP: '94309291000148-1-000230/2026',
    orgaoEntidade: { cnpj: '94309291000148', razaoSocial: 'MUNICIPIO X', esferaId: 'M' },
    unidadeOrgao: { ufSigla: 'RS', municipioNome: 'X' },
    numeroCompra: '0078',
    anoCompra: 2026,
    dataAtualizacao: '2026-11-13T00:00:57',
  };
  assert.deepEqual(regras.publicacoesDaContratacao({ ...base, situacaoCompraId: 1, valorTotalHomologado: null }), []);
  // Valor homologado zero é ausência de resultado, não homologação.
  assert.deepEqual(regras.publicacoesDaContratacao({ ...base, situacaoCompraId: 1, valorTotalHomologado: 0 }), []);

  const [h] = regras.publicacoesDaContratacao({ ...base, situacaoCompraId: 1, valorTotalHomologado: 1200.5 });
  assert.equal(h.tipo, 'homologacao');
  assert.equal(h.chave, 'homologacao:94309291000148-1-000230/2026');
  assert.equal(h.numero_compra, '0078/2026');
  assert.equal(h.esfera, 'Municipal');
  assert.equal(h.ocorrido_em, '2026-11-13 03:00:57');

  const [r] = regras.publicacoesDaContratacao({ ...base, situacaoCompraId: 2, situacaoCompraNome: 'Revogada' });
  assert.equal(r.tipo, 'revogada');
  assert.equal(regras.publicacoesDaContratacao({}).length, 0);
});

test('filtros: só o que está na lista, tudo parametrizado, curinga digitado é texto', () => {
  const { condicoes, valores } = regras.montarFiltros(
    'contratos',
    {
      busca: '50%_off',
      uf: 'rs',
      cnpj: '00.607.814/0001-99',
      valor_min: '1000',
      valor_max: 'abc',
      de: '2026-10-01',
      ate: "2026-10-31'; DROP TABLE x; --",
      ordem: 'qualquer',
      coluna_inventada: '1',
    },
    { hoje: '2026-11-14' }
  );
  const sql = condicoes.join(' AND ');
  assert.ok(!/DROP|50%|qualquer|inventada/.test(sql), 'nenhum valor da tela entra no SQL');
  assert.ok(valores.includes('%50\\%\\_off%'));
  assert.ok(valores.includes('RS'));
  assert.ok(valores.includes('00607814000199'));
  assert.ok(valores.includes(1000));
  assert.ok(!valores.includes('abc'), 'número inválido é ignorado');
  assert.ok(valores.includes('2026-10-01'));
  assert.ok(!valores.some((v) => String(v).includes('DROP')), 'data inválida é ignorada');
  assert.equal((sql.match(/\?/g) || []).length, valores.length);
  assert.ok(sql.includes('a.cancelado = 0'), 'cancelado sai por padrão');
});

test('vigência: "vence em N dias" usa o hoje de Brasília, e a ata perto do fim é marcada', () => {
  const { condicoes, valores } = regras.montarFiltros('atas', { vence_em: '60' }, { hoje: '2026-11-14' });
  assert.ok(condicoes.some((c) => c.startsWith('a.vigencia_fim BETWEEN')));
  assert.deepEqual(valores, ['2026-11-14', '2026-11-14', 60]);
  assert.equal(regras.montarFiltros('atas', { vence_em: '-3' }).condicoes.some((c) => c.includes('BETWEEN')), false);

  assert.equal(regras.diasParaFim('2026-12-14', '2026-11-14'), 30);
  assert.equal(regras.diasParaFim('2026-11-13', '2026-11-14'), -1);
  assert.equal(regras.diasParaFim(null, '2026-11-14'), null);
  // 23h em Brasília = 02h UTC do dia seguinte: o "hoje" ainda é o de Brasília.
  assert.equal(regras.hojeEmBrasilia(new Date('2026-11-15T02:00:00Z')), '2026-11-14');
});

test('acompanhamento: tipo fora da lista é ignorado; filtro de data usa a publicação', () => {
  const a = regras.montarFiltros('acompanhamentos', { tipo: 'apagar_tudo', de: '2026-11-01', edital: '0078' });
  assert.ok(!a.valores.includes('apagar_tudo'));
  assert.ok(a.condicoes.includes('a.ocorrido_em >= ?'));
  assert.ok(!a.condicoes.some((c) => c.includes('cancelado')), 'publicação não tem coluna cancelado');
  const b = regras.montarFiltros('acompanhamentos', { tipo: 'homologacao' });
  assert.deepEqual(b.valores, ['homologacao']);
});

test('alerta de publicação em favorita cai no tipo "resultado" (dá para desligar)', () => {
  assert.equal(notificacoes.tipoDoAlerta('acompanhamento'), 'resultado');
});
