// O PDF do painel de Mercado: o que ele diz (montarRelatorio, puro) e que o arquivo sai de verdade
// (desenharPdf, sem banco). As lacunas da ata e os limites de linhas são o que erra calado.
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST = process.env.DB_HOST || 'x';
process.env.DB_USER = process.env.DB_USER || 'x';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'x';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';

const { PDFDocument } = require('pdf-lib');
const { montarRelatorio, desenharPdf } = require('../backend/servicos/mercado-painel');
const { LACUNA } = require('../backend/servicos/declaracao');

function painelDeExemplo({ vencendo = 3, atas = 2, concorrentes = 3 } = {}) {
  return {
    recorte: { area: 'Saúde', segmento: 'Medicamentos', uf: 'RS', dias: 90, vence: 90 },
    frase: 'Nos últimos 90 dias foram assinados 12 contratos de Saúde › Medicamentos em RS, somando R$ 1.000.000.',
    totais: { contratos: 12, valor: 1000000, orgaos: 5, fornecedores: 7 },
    compradores: [{ cnpj: '1', nome: 'MUNICIPIO DE A', contratos: 4, valor: 400000 }],
    desconto: { mediano: 0.38, amostra: 36 },
    vencendo: {
      total: vencendo,
      valor: 123456.7,
      dados: Array.from({ length: vencendo }, (_, i) => ({
        id: i, orgao_nome: `ORGAO ${i}`, municipio: 'Porto Alegre', uf: 'RS', objeto: `Aquisição de medicamentos lote ${i} ${'detalhe '.repeat(30)}`,
        valor_global: i === 0 ? null : 1000 * (i + 1), fornecedor_nome: i === 1 ? null : `FORNECEDOR ${i}`, vigencia_fim: '2026-12-05', dias: 15,
      })),
    },
    atas: {
      total: atas,
      dados: Array.from({ length: atas }, (_, i) => ({ id: i, orgao_nome: `ORGAO ${i}`, municipio: 'Canoas', uf: 'RS', objeto: 'Registro de preços', vigencia_fim: '2027-01-10', dias: 51 })),
    },
    concorrentes: Array.from({ length: concorrentes }, (_, i) => ({
      cnpj: `0000000000000${i}`, empresa: `EMPRESA ${i}`, contratos: 3, valor: 90000, participacao: 0.09, orgaos: 2, ufs: 'RS,SC',
    })),
  };
}

test('relatório: título, período e números formatados em português', () => {
  const r = montarRelatorio(painelDeExemplo(), { hoje: '2026-11-20' });
  assert.equal(r.titulo, 'Painel de mercado — Saúde / Medicamentos em RS');
  assert.match(r.frase, /de Saúde \/ Medicamentos em RS/); // sem o "›", que a fonte do PDF não tem
  assert.match(r.periodo, /Gerado em 20\/11\/2026/);
  assert.deepEqual(r.numeros[0], ['Contratos', '12']);
  assert.match(r.numeros[1][1], /^R\$\s?1\.000\.000,00$/);
  assert.deepEqual(r.numeros[4], ['Desconto típico (pregão)', '38,0%']);
  assert.match(r.compradores[0], /MUNICIPIO DE A — 4 contrato\(s\)/);
});

test('lacuna visível onde falta dado: valor ou fornecedor do contrato, e sempre na ata (o PNCP não publica)', () => {
  const r = montarRelatorio(painelDeExemplo());
  assert.equal(r.vencendo.linhas[0][3], LACUNA); // valor ausente
  assert.equal(r.vencendo.linhas[1][4], LACUNA); // fornecedor ausente
  assert.equal(r.vencendo.linhas[0][0], '05/12/2026 (em 15 dias)');
  for (const linha of r.atas.linhas) assert.equal(linha[3], LACUNA);
});

test('sem desconto medido, o relatório mostra a lacuna e não um zero', () => {
  const p = painelDeExemplo();
  p.desconto = null;
  assert.equal(montarRelatorio(p).numeros[4][1], LACUNA);
});

test('limites: 25 vencimentos, 15 atas, 20 concorrentes — e o subtítulo diz que cortou', () => {
  const r = montarRelatorio(painelDeExemplo({ vencendo: 60, atas: 40, concorrentes: 30 }));
  assert.equal(r.vencendo.linhas.length, 25);
  assert.match(r.vencendo.subtitulo, /60 contrato\(s\).*os 25 que vencem primeiro/);
  assert.equal(r.atas.linhas.length, 15);
  assert.match(r.atas.subtitulo, /40 ata\(s\).*as 15 que vencem primeiro/);
  assert.equal(r.concorrentes.length, 20);
});

test('recorte vazio: frases de "nenhum", sem tabela', () => {
  const r = montarRelatorio(painelDeExemplo({ vencendo: 0, atas: 0, concorrentes: 0 }));
  assert.match(r.vencendo.subtitulo, /Nenhum contrato deste recorte termina/);
  assert.match(r.atas.subtitulo, /Nenhuma ata vigente com adesão/);
  assert.equal(r.vencendo.linhas.length + r.atas.linhas.length + r.concorrentes.length, 0);
});

test('o PDF sai de verdade: cabeçalho %PDF, e muitas linhas viram mais de uma página', async () => {
  const curto = await desenharPdf(montarRelatorio(painelDeExemplo()));
  assert.equal(curto.subarray(0, 5).toString(), '%PDF-');
  assert.ok(curto.length > 1500);
  const longo = await desenharPdf(montarRelatorio(painelDeExemplo({ vencendo: 60, atas: 40, concorrentes: 30 })));
  const paginas = async (b) => (await PDFDocument.load(b)).getPageCount();
  const [pc, pl] = [await paginas(curto), await paginas(longo)];
  assert.ok(pc >= 1);
  assert.ok(pl > pc, `curto ${pc} pág., longo ${pl} pág.`);
});

test('caractere de controle ou emoji no texto do PNCP não derruba o PDF (caso real: U+0096)', async () => {
  const { seguro } = require('../backend/servicos/pacote');
  assert.equal(seguro('Aquisi\u0096o \u0085de itens \u{1F600} ok'), 'Aquisio de itens  ok');
  const p = painelDeExemplo();
  p.vencendo.dados[0].objeto = 'Compra \u0096 de medicamentos \u0085 \u{1F600}';
  p.concorrentes[0].empresa = 'EMPRESA \u0096 LTDA';
  const pdf = await desenharPdf(montarRelatorio(p));
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
});
