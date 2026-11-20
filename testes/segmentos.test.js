// O catálogo de segmentos (decisão de 20/11/2026) decide em que "prateleira" cada contrato cai —
// e dali sai a mediana de desconto do preço de referência. Errar calado aqui mistura preços de
// coisas diferentes, então os casos abaixo são objetos no estilo real do PNCP.
const test = require('node:test');
const assert = require('node:assert/strict');
const { classificar, normalizar, listarCatalogo, areaDoSegmento, SEM_CLASSIFICACAO } = require('../backend/regras/segmentos');
const { CATALOGO } = require('../backend/config/dados/catalogo-segmentos');

const CASOS = [
  ['Registro de preços para aquisição de medicamentos para a farmácia básica municipal', 'Saúde', 'Medicamentos'],
  ['Contratação de empresa para pavimentação asfáltica e drenagem de vias urbanas', 'Obras e engenharia', 'Pavimentação e drenagem'],
  ['Prestação de serviço de rastreamento veicular por GPS com telemetria', 'Tecnologia da informação', 'Rastreamento e telemetria'],
  ['Fornecimento parcelado de combustível (diesel S10 e gasolina comum) para a frota', 'Veículos e transporte', 'Combustíveis e lubrificantes'],
  ['Aquisição de gêneros alimentícios (arroz, feijão, carne) para a rede municipal', 'Alimentação', 'Gêneros alimentícios'],
  ['Fornecimento de merenda escolar e refeições prontas (marmitex)', 'Alimentação', 'Merenda e refeições'],
  ['Locação de licença de uso de software de gestão pública', 'Tecnologia da informação', 'Software e sistemas'],
  ['Aquisição de computadores, notebooks e impressoras', 'Tecnologia da informação', 'Computadores e informática'],
  ['Prestação de serviços de limpeza e conservação predial com fornecimento de mão de obra', 'Limpeza e conservação', 'Serviços de limpeza'],
  ['Contratação de serviços de vigilância armada e portaria', 'Segurança', 'Vigilância e portaria'],
  ['Aquisição de material escolar e kits para alunos da rede municipal', 'Educação e cultura', 'Material escolar e didático'],
  ['Contratação de agência de viagens para emissão de passagens aéreas', 'Serviços profissionais', 'Viagens e hospedagem'],
  ['Manutenção preventiva e corretiva de ar-condicionado', 'Máquinas, equipamentos e manutenção', 'Ar-condicionado e climatização'],
  ['Aquisição de pneus e câmaras de ar para veículos da frota', 'Veículos e transporte', 'Pneus e câmaras'],
];

for (const [objeto, area, segmento] of CASOS) {
  test(`classifica: ${objeto.slice(0, 60)}…`, () => {
    const r = classificar(objeto);
    assert.equal(r.classificado, true);
    assert.deepEqual([r.area, r.segmento], [area, segmento]);
  });
}

test('objeto sem nenhum termo do catálogo vira Outros › Sem classificação (não some, não chuta)', () => {
  const r = classificar('Objeto genérico qualquer sem assunto reconhecível xyz');
  assert.deepEqual({ area: r.area, segmento: r.segmento, classificado: r.classificado }, { ...SEM_CLASSIFICACAO, classificado: false });
  assert.equal(classificar('').classificado, false);
  assert.equal(classificar(null).classificado, false);
});

test('"!" no fim do termo exige a palavra inteira: "cras" não casa dentro de "crase"', () => {
  assert.equal(classificar('Estudo sobre o uso da crase na redação oficial').segmento !== 'Serviços socioassistenciais', true);
  assert.equal(classificar('Manutenção do CRAS do bairro').segmento, 'Serviços socioassistenciais');
});

test('excluir veta o segmento: lavagem veicular não é serviço de limpeza predial', () => {
  const r = classificar('Serviços de limpeza veicular e lavagem de veículos');
  assert.notEqual(r.segmento, 'Serviços de limpeza');
});

test('normalizar tira acento, cedilha e pontuação', () => {
  assert.equal(normalizar('  Roçadeira — Ar-Condicionado!  '), 'rocadeira ar condicionado');
});

test('plural e singular casam: "materiais de construção" e "cestas básicas" (caso real do PNCP)', () => {
  assert.equal(normalizar('Materiais elétricos e licitações'), 'material eletrico e licitacao');
  assert.equal(classificar('Aquisição de materiais de construção para diversas secretarias').segmento, 'Material de construção');
  assert.equal(classificar('REGISTRO DE PREÇOS VISANDO A AQUISIÇÃO DE CESTAS BÁSICAS').area, 'Alimentação');
});

test('termos curtos que viram falso positivo exigem palavra inteira: mudança ≠ muda, bandagem ≠ banda', () => {
  assert.notEqual(classificar('Serviço de mudança de móveis').segmento, 'Insumos agrícolas');
  assert.notEqual(classificar('Aquisição de bandagem e ataduras').segmento, 'Shows e eventos culturais');
});

test('o catálogo é íntegro: nomes de segmento únicos, todo termo não vazio e área conhecida', () => {
  const nomes = CATALOGO.flatMap((a) => a.segmentos.map((s) => s.nome));
  assert.equal(new Set(nomes).size, nomes.length, 'segmento repetido entre áreas');
  for (const a of CATALOGO) {
    assert.ok(a.segmentos.length > 0, a.area);
    for (const s of a.segmentos) {
      assert.ok(s.termos.length >= 3, `${s.nome} tem poucos termos`);
      for (const t of s.termos) assert.ok(normalizar(t.replace(/!$/, '')).length >= 2, `${s.nome}: termo curto "${t}"`);
    }
  }
  assert.equal(areaDoSegmento('Medicamentos'), 'Saúde');
  assert.equal(areaDoSegmento('Inexistente'), null);
  assert.equal(listarCatalogo().length, CATALOGO.length);
});

test('limitação conhecida, com o que se sabe fazer: termo no destino não vence um objeto que o catálogo reconhece', () => {
  const r = classificar('Locação de brinquedos infláveis para os eventos de vacinação da Secretaria da Saúde');
  assert.equal(r.segmento, 'Shows e eventos culturais'); // 2 termos de 2 palavras contra "vacina" solta
});
