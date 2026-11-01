// Carga inicial: fontes da seção 5.5 e palavras-chave validadas da seção 4.2.
// Idempotente — roda quantas vezes quiser, não duplica e não sobrescreve o que
// o usuário já editou na tela (só insere o que falta).
//   npm run semear
const pool = require('../config/db');

const FONTES = [
  {
    nome: 'PNCP',
    adaptador: 'pncp',
    url_base: 'https://pncp.gov.br',
    config: { status: 'recebendo_proposta', tipos_documento: 'edital', tam_pagina: 100, paginas_max: 3 },
    ativa: 1,
    intervalo_horas: 6,
    prioridade: 1,
    observacao: 'Base obrigatória: cobre federal, estadual e municipal (Lei 14.133).',
  },
  {
    nome: 'Compras.gov.br',
    adaptador: 'comprasgov',
    url_base: 'https://cnetmobile.estaleiro.serpro.gov.br',
    config: {},
    ativa: 0,
    intervalo_horas: 12,
    prioridade: 2,
    observacao: 'Propostas, concorrentes e resultado detalhado. Adaptador entra na Fase 7.',
  },
  {
    nome: 'Portal de Compras Públicas',
    adaptador: 'generico_html',
    url_base: 'https://www.portaldecompraspublicas.com.br',
    config: {},
    ativa: 0,
    intervalo_horas: 12,
    prioridade: 10,
    observacao: 'Muitos municípios do RS e SC. Adaptador genérico entra na Fase 14.',
  },
  {
    nome: 'BLL Compras',
    adaptador: 'generico_html',
    url_base: 'https://bllcompras.com',
    config: {},
    ativa: 0,
    intervalo_horas: 12,
    prioridade: 11,
    observacao: 'Municípios do PR e SC.',
  },
  {
    nome: 'Licitanet',
    adaptador: 'generico_html',
    url_base: 'https://licitanet.com.br',
    config: {},
    ativa: 0,
    intervalo_horas: 12,
    prioridade: 12,
    observacao: 'Municípios menores.',
  },
  {
    nome: 'BNC — Bolsa Nacional de Compras',
    adaptador: 'generico_html',
    url_base: 'https://bnc.org.br',
    config: {},
    ativa: 0,
    intervalo_horas: 12,
    prioridade: 13,
    observacao: 'Municípios do interior.',
  },
  {
    nome: 'Compras RS (CELIC)',
    adaptador: 'generico_html',
    url_base: 'https://compras.rs.gov.br',
    config: {},
    ativa: 0,
    intervalo_horas: 12,
    prioridade: 14,
    observacao: 'Governo do Estado do RS.',
  },
];

// Pesos: a soma máxima da regra 1 é 40 e casar no título dobra o valor, então
// um peso 20 já satura a faixa quando o termo aparece no começo do objeto.
const PALAVRAS = [
  // Serviços digitais
  ['site institucional', 'Serviços digitais', 20],
  ['portal institucional', 'Serviços digitais', 18],
  ['hospedagem de site', 'Serviços digitais', 16],
  ['desenvolvimento de software', 'Serviços digitais', 20],
  ['aplicativo', 'Serviços digitais', 14],
  ['chatbot', 'Serviços digitais', 18],
  ['whatsapp', 'Serviços digitais', 14],
  ['marketing digital', 'Serviços digitais', 16],
  ['redes sociais', 'Serviços digitais', 14],
  ['inteligência artificial', 'Serviços digitais', 16],
  ['locação de software', 'Serviços digitais', 18],
  ['licença de uso', 'Serviços digitais', 12],
  ['software como serviço', 'Serviços digitais', 18],
  ['saas', 'Serviços digitais', 14],
  ['landing page', 'Serviços digitais', 16],
  ['manutenção de site', 'Serviços digitais', 18],

  // Frota e rastreamento
  ['rastreamento veicular', 'Frota e rastreamento', 20],
  ['monitoramento veicular', 'Frota e rastreamento', 20],
  ['telemetria', 'Frota e rastreamento', 16],
  ['gestão de frota', 'Frota e rastreamento', 18],
  ['rastreador', 'Frota e rastreamento', 16],
  ['m2m', 'Frota e rastreamento', 12],

  // Informática e itens
  ['material de informática', 'Informática e itens', 16],
  ['materiais de informática', 'Informática e itens', 16],
  ['suprimentos de informática', 'Informática e itens', 16],
  ['toner', 'Informática e itens', 12],
  ['cartucho', 'Informática e itens', 12],
  ['nobreak', 'Informática e itens', 12],
  ['webcam', 'Informática e itens', 10],
  ['periféricos', 'Informática e itens', 10],
  ['cabo de rede', 'Informática e itens', 10],
  ['pen drive', 'Informática e itens', 10],
  ['mouse', 'Informática e itens', 8],
  ['teclado', 'Informática e itens', 8],
  ['monitor', 'Informática e itens', 8],
  ['switch', 'Informática e itens', 10],
];

// Corta o ruído mais comum do PNCP para o nosso perfil.
const EXCLUIDAS = [
  'merenda',
  'medicamento',
  'obra civil',
  'pavimentação',
  'gênero alimentício',
  'combustível',
  'material de construção',
  'material hospitalar',
  'locação de veículo',
  'serviço funerário',
  'uniforme escolar',
];

async function semearFontes() {
  let inseridas = 0;
  for (const fonte of FONTES) {
    const [r] = await pool.query(
      `INSERT INTO fontes (nome, adaptador, url_base, config, ativa, intervalo_horas, prioridade, observacao)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE id = id`,
      [
        fonte.nome,
        fonte.adaptador,
        fonte.url_base,
        JSON.stringify(fonte.config || {}),
        fonte.ativa,
        fonte.intervalo_horas,
        fonte.prioridade,
        fonte.observacao,
      ]
    );
    if (r.affectedRows === 1) inseridas += 1;
  }
  return inseridas;
}

async function semearPalavras() {
  let inseridas = 0;
  for (const [termo, grupo, peso] of PALAVRAS) {
    const [r] = await pool.query(
      `INSERT INTO palavras_chave (termo, grupo, peso, usar_aspas, ativa)
       VALUES (?, ?, ?, 1, 1)
       ON DUPLICATE KEY UPDATE id = id`,
      [termo, grupo, peso]
    );
    if (r.affectedRows === 1) inseridas += 1;
  }
  return inseridas;
}

async function semearExcluidas() {
  let inseridas = 0;
  for (const termo of EXCLUIDAS) {
    const [r] = await pool.query(
      `INSERT INTO palavras_excluidas (termo, ativa) VALUES (?, 1)
       ON DUPLICATE KEY UPDATE id = id`,
      [termo]
    );
    if (r.affectedRows === 1) inseridas += 1;
  }
  return inseridas;
}

async function principal() {
  const fontes = await semearFontes();
  const palavras = await semearPalavras();
  const excluidas = await semearExcluidas();

  console.log(`Fontes inseridas: ${fontes} (de ${FONTES.length}).`);
  console.log(`Palavras-chave inseridas: ${palavras} (de ${PALAVRAS.length}).`);
  console.log(`Palavras excluídas inseridas: ${excluidas} (de ${EXCLUIDAS.length}).`);
  console.log('Seed concluído. O que já existia foi preservado.');
  await pool.end();
}

principal().catch(async (erro) => {
  console.error('Falha no seed:', erro.sqlMessage || erro.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
