// Radar 2.0 (Seção 7 do plano SaaS): onde o filtro erra calado — busca exata
// que vira "qualquer palavra", curinga digitado que vira curinga do SQL, região
// desconhecida que vira "sem filtro", raio sem cidade que filtra nada — e as
// etiquetas que dependem da hora.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const AdmZip = require('adm-zip');
const f = require('../backend/regras/filtros-radar');
const etiquetas = require('../backend/regras/etiquetas');
const docx = require('../backend/servicos/docx');
const link = require('../backend/servicos/link-publico');

const semNota = (extra) => f.montarFiltros({ pontuacao_min: '0', ...extra }, { organizacaoId: 7 });

test('busca entre aspas é frase exata no objeto; palavras soltas, todas em qualquer ordem', () => {
  assert.deepEqual(f.lerBusca('toner "cartucho original" hp'), { frases: ['cartucho original'], palavras: ['toner', 'hp'] });
  assert.deepEqual(f.lerBusca('"aspa sem par'), { frases: ['aspa sem par'], palavras: [] });

  const exata = semNota({ busca: '"material de limpeza"' });
  assert.match(exata.onde, /l\.objeto LIKE \?/);
  assert.deepEqual(exata.valores, ['%material de limpeza%']);

  const solta = semNota({ busca: 'limpeza material' });
  assert.equal((solta.onde.match(/l\.objeto LIKE \? OR l\.orgao_nome/g) || []).length, 2);
  assert.deepEqual(solta.valores, ['%limpeza%', '%limpeza%', '%limpeza%', '%material%', '%material%', '%material%']);
});

test('% e _ digitados são texto, não curinga', () => {
  assert.deepEqual(semNota({ processo: '10%_a' }).valores, ['%10\\%\\_a%']);
});

test('região soma as UFs; região que não existe filtra tudo, não nada', () => {
  const sul = semNota({ regiao: 'Sul' });
  assert.deepEqual(sul.valores, ['PR', 'RS', 'SC']);
  assert.match(semNota({ regiao: 'Atlântida' }).onde, /1 = 0/);
});

test('raio sem cidade de partida avisa e não filtra; com centro usa haversine e teto de 1000 km', () => {
  const sem = semNota({ raio_km: '100' });
  assert.equal(sem.avisos.length, 1);
  assert.doesNotMatch(sem.onde, /municipios/);

  const com = f.montarFiltros({ pontuacao_min: '0', raio_km: '5000' }, { centro: { latitude: -30, longitude: -51 } });
  assert.match(com.onde, /FROM municipios m/);
  assert.deepEqual(com.valores, [-30, -51, -30, 1000]);
});

test('esfera fora da lista é descartada; datas inválidas são ignoradas; "até" inclui o dia', () => {
  assert.deepEqual(semNota({ esfera: 'Municipal,Galáctica' }).valores, ['Municipal']);
  const datas = semNota({ inclusao_de: '2026-11-13', inclusao_ate: '2026-11-13', prazo_de: '13/11/2026' });
  assert.deepEqual(datas.valores, ['2026-11-13 00:00:00', '2026-11-13']);
  assert.match(datas.onde, /criado_em < DATE_ADD\(\?, INTERVAL 1 DAY\)/);
});

test('CNPJ do órgão casa exato; nome casa por trecho; monitorada filtra pela organização', () => {
  assert.deepEqual(semNota({ orgao: '87.613.535/0001-16' }).valores, ['87613535000116']);
  assert.deepEqual(semNota({ orgao: 'prefeitura' }).valores, ['%prefeitura%', '%prefeitura%']);
  assert.deepEqual(semNota({ monitorada: '1' }).valores, [7]);
});

test('pesquisa salva guarda só campos conhecidos, como texto curto', () => {
  const limpo = f.limparFiltros({ busca: 'x'.repeat(500), pagina: 3, hack: 'DROP', uf: 'RS', vazio: '' });
  assert.deepEqual(Object.keys(limpo).sort(), ['busca', 'uf']);
  assert.equal(limpo.busca.length, 200);
  assert.deepEqual(f.limparFiltros(['a']), {});
});

test('etiquetas: nova, vence hoje x urgente, recebendo, prorrogada, adiada, SRP, suspensa', () => {
  const agora = new Date('2026-11-13T12:00:00-03:00');
  const chaves = (l) => etiquetas.calcular(l, agora).map((e) => e.chave);

  assert.deepEqual(chaves({ criado_em: new Date('2026-11-13T08:00:00-03:00') }), ['nova']);
  assert.deepEqual(chaves({ fim_propostas: new Date('2026-11-13T18:00:00-03:00') }), ['vence_hoje', 'recebendo']);
  assert.deepEqual(chaves({ fim_propostas: new Date('2026-11-14T10:00:00-03:00') }), ['urgente', 'recebendo']);
  // Abre amanhã: ainda não recebe proposta.
  assert.deepEqual(
    chaves({ abertura_propostas: new Date('2026-11-14T08:00:00-03:00'), fim_propostas: new Date('2026-11-30T08:00:00-03:00') }),
    []
  );
  assert.deepEqual(
    chaves({
      srp: 1,
      fim_propostas: new Date('2026-11-30T08:00:00-03:00'),
      fim_propostas_original: new Date('2026-11-20T08:00:00-03:00'),
      abertura_propostas: new Date('2026-11-10T08:00:00-03:00'),
      abertura_original: new Date('2026-11-01T08:00:00-03:00'),
    }),
    ['recebendo', 'srp', 'prorrogada', 'adiada']
  );
  // Suspensa não "recebe propostas" nem fica urgente, mesmo com prazo correndo.
  assert.deepEqual(chaves({ situacao: 'Suspensa', fim_propostas: new Date('2026-11-14T10:00:00-03:00') }), ['suspensa']);
  assert.deepEqual(chaves({ valor_homologado: '1000.00' }), ['homologada']);
});

test('.docx é um zip com document.xml válido e o texto escapado', () => {
  const buffer = docx.gerar({
    titulo: 'Radar <teste> & cia',
    colunas: [{ titulo: 'Objeto', largura: 50 }],
    linhas: [['Aquisição de "toner" <HP>\u0001']],
  });
  const zip = new AdmZip(buffer);
  const xml = zip.readAsText('word/document.xml');
  assert.ok(zip.getEntry('[Content_Types].xml'));
  assert.match(xml, /Radar &lt;teste&gt; &amp; cia/);
  assert.match(xml, /Aquisição de &quot;toner&quot; &lt;HP&gt; </);
  assert.doesNotMatch(xml, /\u0001/);
});

test('link público: token de 43 caracteres, hash estável, formato estranho recusado', () => {
  const token = link.novoToken();
  assert.equal(link.formatoValido(token), true);
  assert.equal(link.hash(token), link.hash(token));
  assert.equal(link.hash(token).length, 64);
  assert.equal(link.formatoValido("' OR 1=1 --"), false);
  assert.equal(link.formatoValido(token + 'a'), false);
});

test('link público descarta filtro de decisão da organização e mostra as descartadas', () => {
  const p = f.filtrosPublicos({ favorito: '1', etapa: 'Participando', pontuacao_min: '80', grupo: 'TI', monitorada: '1', uf: 'RS' });
  assert.deepEqual(p, { uf: 'RS', pontuacao_min: '0', incluir_descartadas: '1' });
  assert.doesNotMatch(f.montarFiltros(p).onde, /descartada|pontuacao|favorito|etapa/);
});
