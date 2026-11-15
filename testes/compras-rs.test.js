// Adaptador `compras_rs` (CELIC/RS) — sem banco e sem rede, só funções puras.
// O registro de amostra é real: capturado em 15/11/2026 com POST de verdade em
// www.compras.rs.gov.br/editais/pesquisa.json (termo "veiculo", período de 15 dias).
const test = require('node:test');
const assert = require('node:assert/strict');

const adaptador = require('../backend/adaptadores/compras_rs');

const REGISTRO_REAL = {
  id: 359318,
  biddingType: 'BIDING_DISPENSATION_WITH_DISPUTE',
  issuanceNumber: '0018/2026',
  processNumber: '26120390318577',
  tradeOffice: 'BRIGADA MILITAR - COMANDO DE POLICIAMENTO PLANALTO',
  description:
    'Conserto de danos no lado direito do veículo decorrentes de sinistro - Toyota Corolla Cross \r\nXR 2.0 16V Flex (com blindagem)',
  startDate: 1794830460000,
  resultCount: 4,
  legalNormType: 'LAW_14133_2021',
  simplifiedIssuanceNumber: '0018_2026',
  biddingTypeName: 'Dispensa eletrônica com disputa',
  publishDate: 1794279600000,
};

test('formatarData: DD/MM/YYYY com zero à esquerda', () => {
  assert.equal(adaptador.formatarData(new Date(2026, 0, 5)), '05/01/2026');
  assert.equal(adaptador.formatarData(new Date(2026, 10, 15)), '15/11/2026');
});

test('periodoPublicacao: padrão 180 dias, limitado a 365, mínimo 1', () => {
  const padrao = adaptador.periodoPublicacao(undefined);
  const diasPadrao = Math.round((Date.parse(`${padrao.ate.split('/').reverse().join('-')}`) -
    Date.parse(`${padrao.de.split('/').reverse().join('-')}`)) / 86400000);
  assert.equal(diasPadrao, 180);

  const excesso = adaptador.periodoPublicacao(9999);
  const diasExcesso = Math.round((Date.parse(`${excesso.ate.split('/').reverse().join('-')}`) -
    Date.parse(`${excesso.de.split('/').reverse().join('-')}`)) / 86400000);
  assert.equal(diasExcesso, 365);

  const minimo = adaptador.periodoPublicacao(-10);
  const diasMinimo = Math.round((Date.parse(`${minimo.ate.split('/').reverse().join('-')}`) -
    Date.parse(`${minimo.de.split('/').reverse().join('-')}`)) / 86400000);
  assert.equal(diasMinimo, 1);
});

test('paraData: epoch em milissegundos vira Date; ausente vira null', () => {
  assert.equal(adaptador.paraData(1794279600000).getTime(), 1794279600000);
  assert.equal(adaptador.paraData(null), null);
  assert.equal(adaptador.paraData(undefined), null);
  assert.equal(adaptador.paraData('não é número'), null);
});

test('normalizar: mapeia o registro real do CELIC para o formato da coleta', () => {
  const resultado = adaptador.normalizar(REGISTRO_REAL, { fonteId: 7 });

  assert.equal(resultado.fonte_id, 7);
  assert.equal(resultado.chave_externa, '7:359318');
  assert.equal(resultado.numero_controle, '0018/2026');
  assert.equal(resultado.orgao_nome, 'BRIGADA MILITAR - COMANDO DE POLICIAMENTO PLANALTO');
  assert.equal(resultado.esfera, 'Estadual');
  assert.equal(resultado.uf, 'RS');
  assert.equal(resultado.modalidade, 'Dispensa eletrônica com disputa');
  assert.equal(resultado.numero_compra, '0018/2026');
  assert.equal(resultado.processo, '26120390318577');
  assert.match(resultado.objeto, /Conserto de danos/);
  assert.equal(resultado.abertura_propostas.getTime(), 1794830460000);
  assert.equal(resultado.publicada_em.getTime(), 1794279600000);
  assert.equal(resultado.situacao, 'Recebendo proposta');
  assert.equal(resultado.plataforma_disputa, 'Compras RS (CELIC)');
  assert.equal(resultado.link_portal, 'https://www.compras.rs.gov.br/editais/0018_2026/359318');
  assert.equal(resultado.bruto, REGISTRO_REAL);
});

test('normalizar: sem simplifiedIssuanceNumber não inventa link', () => {
  const resultado = adaptador.normalizar({ ...REGISTRO_REAL, simplifiedIssuanceNumber: null }, { fonteId: 1 });
  assert.equal(resultado.link_portal, null);
});

test('registrado em backend/adaptadores/index.js', () => {
  const adaptadores = require('../backend/adaptadores');
  assert.equal(adaptadores.existe('compras_rs'), true);
  assert.equal(typeof adaptadores.obter('compras_rs').buscar, 'function');
});

test('listarMensagens: diz que não há consulta pública, sem inventar URL', async () => {
  await assert.rejects(adaptador.listarMensagens({}), (erro) => {
    assert.equal(erro.semConsulta, true);
    return true;
  });
});
