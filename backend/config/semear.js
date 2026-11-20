// Carga inicial: fontes da seção 5.5, palavras-chave validadas da seção 4.2 e o
// perfil padrão da empresa com os CNAEs da seção 4.7.
// Idempotente — roda quantas vezes quiser, não duplica e não sobrescreve o que
// o usuário já editou na tela (só insere o que falta).
//   npm run semear
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const { garantirAdmin } = require('../servicos/admin-inicial');
const perfilPadrao = require('./dados/perfil-padrao');
const kitsPadrao = require('./dados/kits-padrao');
const modelosDeclaracao = require('./dados/modelos-declaracao');
const encerradas = require('../jobs/encerradas');
const regrasPreco = require('../regras/preco');

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
    observacao:
      'Completa as propostas de uma licitação que o PNCP já trouxe. O portal carrega o quadro por JavaScript atrás de CAPTCHA: o painel não força e mostra o link para abrir à mão.',
  },
  {
    nome: 'Compras RS (CELIC)',
    adaptador: 'compras_rs',
    url_base: 'https://www.compras.rs.gov.br',
    config: { dias_publicacao: 180, tam_pagina: 50, paginas_max: 3 },
    ativa: 0,
    intervalo_horas: 12,
    prioridade: 10,
    observacao:
      'Governo do Estado do RS. Verificado em 15/11/2026 com requisição real: não é generico_html porque a lista não vem no HTML — ' +
      '/editais/pesquisar entrega a tabela vazia e o POST em /editais/pesquisa.json devolve o JSON sem login e sem CAPTCHA. ' +
      'Ganhou adaptador próprio (compras_rs.js) por isso. "Testar agora" traz resultado real; ative quando revisar.',
  },
  {
    nome: 'Portal de Compras Públicas',
    adaptador: 'generico_html',
    url_base: 'https://www.portaldecompraspublicas.com.br',
    // Sem url_busca de propósito: /processos é uma SPA Angular que entrega só a casca. A lista vem de uma API
    // JavaScript privada (compras.api.portaldecompraspublicas.com.br), que não é documentada — ler o que o app
    // do portal chama por baixo seria engenharia reversa, e a seção 5.3 decidiu não fazer isso. Em 20/11/2026
    // a casca e o bundle principal foram reconferidos (2 requisições): nada mudou.
    config: {},
    ativa: 0,
    intervalo_horas: 12,
    prioridade: 11,
    observacao:
      'Muitos municípios do RS e SC. Coberta pelo PNCP: a Lei 14.133 obriga a publicação lá, então o que este portal anuncia chega ' +
      'pela varredura do PNCP (campo "plataforma de disputa" mostra que veio daqui). Reconferido em 20/11/2026: /processos é uma SPA que ' +
      'entrega só a casca e a lista vem de uma API privada sem documentação; a seção 5.3 decidiu não simular o app nem usar navegador headless.',
  },
  {
    nome: 'BLL Compras',
    adaptador: 'generico_html',
    url_base: 'https://bllcompras.com',
    config: {},
    ativa: 0,
    intervalo_horas: 12,
    prioridade: 12,
    observacao:
      'Municípios do PR e SC. Verificado em 15/11/2026: todo caminho em bllcompras.com redireciona para /Home/Login — não achamos ' +
      'nenhuma página de consulta pública sem login. Sem configuração que resolva; fica sem url_busca até alguém achar a página certa.',
  },
  {
    nome: 'Licitanet',
    adaptador: 'generico_html',
    url_base: 'https://licitanet.com.br',
    config: {},
    ativa: 0,
    intervalo_horas: 12,
    prioridade: 13,
    observacao:
      'Municípios menores. Verificado em 15/11/2026: o portal bloqueia com 403 tudo, inclusive o robots.txt — nem manualmente dá ' +
      'para abrir fora do navegador comum. Sem configuração possível hoje.',
  },
  {
    nome: 'BNC — Bolsa Nacional de Compras',
    adaptador: 'generico_html',
    url_base: 'https://bnc.org.br',
    config: {},
    ativa: 0,
    intervalo_horas: 12,
    prioridade: 14,
    observacao:
      'Municípios do interior. Verificado em 15/11/2026: bnc.org.br é só o site institucional (WordPress) — a plataforma de disputa ' +
      'em si fica noutro endereço que não identificamos. Sem configuração até achar o domínio certo da plataforma.',
  },
  {
    nome: 'Negócios Públicos',
    adaptador: 'generico_html',
    url_base: 'https://negociospublicos.com.br',
    config: {},
    ativa: 0,
    intervalo_horas: 12,
    prioridade: 15,
    observacao:
      'Verificado em 15/11/2026: não é uma plataforma de licitação — é a editora da revista "Negócios Públicos" (capacitação e ' +
      'eventos do setor). Cadastrada aqui por engano de escopo; não há lista de editais para coletar deste domínio.',
  },
  {
    nome: 'Licitar Digital',
    adaptador: 'generico_html',
    url_base: 'https://licitardigital.com.br',
    config: {},
    ativa: 0,
    intervalo_horas: 12,
    prioridade: 16,
    observacao: 'Verificado em 15/11/2026: todo o domínio responde "Acesso Restrito" — não há página pública para configurar.',
  },
  {
    nome: 'BEC/SP — Bolsa Eletrônica de Compras do Estado de SP',
    adaptador: 'generico_html',
    url_base: 'https://www.bec.sp.gov.br',
    config: {},
    ativa: 0,
    intervalo_horas: 12,
    prioridade: 17,
    observacao:
      'Verificado em 15/11/2026: o domínio não respondeu (pode ter saído do ar — relatos de terceiros dizem que o BEC deixou de ' +
      'ser a porta padrão de novas disputas desde 2024). Sem configuração até confirmar o endereço atual.',
  },
  {
    nome: 'Licitações-e (Banco do Brasil)',
    adaptador: 'generico_html',
    url_base: 'https://licitacoes-e2.bb.com.br',
    config: {},
    ativa: 0,
    intervalo_horas: 12,
    prioridade: 18,
    observacao:
      'Verificado em 15/11/2026: o domínio está atrás de um desafio do Cloudflare. A seção 5.4 proíbe contornar bloqueio de portal ' +
      '— isto não é robots.txt, é desafio anti-automação —, então a fonte fica sem configuração por decisão, não por falta dela.',
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
    // Fonte já existente com config vazia (`{}` ou NULL) nunca foi configurada por
    // ninguém — é seguro atualizar adaptador/url_base/config/observação para
    // a pesquisa mais recente (ex.: Compras RS ganhando adaptador próprio em
    // 15/11/2026). Fonte que já tem config de verdade é decisão de quem
    // configurou pela tela; o seed não sobrescreve isso, só a linha "virgem".
    // Não comparar a coluna JSON com a string '{}': no MySQL 8 isso é sempre falso
    // (a string vira um JSON string, não um objeto vazio) e o seed nunca atualizava
    // nada em produção. `JSON_LENGTH(...) = 0` vale no MySQL 8 e no MariaDB.
    const [r] = await pool.query(
      `INSERT INTO fontes (nome, adaptador, url_base, config, ativa, intervalo_horas, prioridade, observacao)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         adaptador   = IF((config IS NULL OR JSON_LENGTH(config) = 0), VALUES(adaptador), adaptador),
         url_base    = IF((config IS NULL OR JSON_LENGTH(config) = 0), VALUES(url_base), url_base),
         observacao  = IF((config IS NULL OR JSON_LENGTH(config) = 0), VALUES(observacao), observacao),
         config      = IF((config IS NULL OR JSON_LENGTH(config) = 0), VALUES(config), config)`,
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
    // Em ON DUPLICATE KEY UPDATE, `affectedRows` vem 1 nos dois casos; quem
    // distingue é o insertId, que fica 0 quando a linha já existia.
    if (r.insertId) inseridas += 1;
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
    // Em ON DUPLICATE KEY UPDATE, `affectedRows` vem 1 nos dois casos; quem
    // distingue é o insertId, que fica 0 quando a linha já existia.
    if (r.insertId) inseridas += 1;
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
    // Em ON DUPLICATE KEY UPDATE, `affectedRows` vem 1 nos dois casos; quem
    // distingue é o insertId, que fica 0 quando a linha já existia.
    if (r.insertId) inseridas += 1;
  }
  return inseridas;
}

// O perfil só é criado se ainda não houver nenhum: a partir daí os CNAEs são
// editados pela tela de Configurações e o seed não encosta mais neles.
async function semearPerfil() {
  const [existentes] = await pool.query('SELECT id FROM empresa_perfis LIMIT 1');
  if (existentes.length) return false;

  await pool.query(
    `INSERT INTO empresa_perfis (nome, natureza, regime, capital_social, cnaes, padrao)
     VALUES (?, ?, ?, ?, CAST(? AS JSON), 1)`,
    [
      perfilPadrao.nome,
      perfilPadrao.natureza,
      perfilPadrao.regime,
      perfilPadrao.capital_social,
      JSON.stringify(perfilPadrao.cnaes),
    ]
  );
  return true;
}

// Kits da seção 17.3. Só cria o que falta: kit que o usuário editou fica como está.
async function semearKits() {
  const [perfis] = await pool.query('SELECT id FROM empresa_perfis ORDER BY padrao DESC, id ASC LIMIT 1');
  if (!perfis.length) return 0;
  const perfilId = perfis[0].id;

  let criados = 0;
  for (const kit of kitsPadrao) {
    const [r] = await pool.query(
      `INSERT INTO documento_kits (perfil_id, nome, descricao, padrao)
       VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = id`,
      [perfilId, kit.nome, kit.descricao, kit.padrao || 0]
    );
    if (!r.insertId) continue; // já existia — não mexe nos itens
    criados += 1;

    let ordem = 1;
    for (const item of kit.itens) {
      await pool.query(
        `INSERT INTO documento_kit_itens (kit_id, codigo, ordem, obrigatorio, so_se_exigido)
         VALUES (?, ?, ?, ?, ?)`,
        [r.insertId, item.codigo, ordem, item.obrigatorio ?? 1, item.so_se_exigido ?? 0]
      );
      ordem += 1;
    }
  }
  return criados;
}

// Modelos de declaração da seção 18.2. São do sistema: o usuário duplica e
// edita a cópia, e o original segue intacto para a próxima disputa.
async function semearModelos() {
  let criados = 0;
  for (const modelo of modelosDeclaracao) {
    // Sem ON DUPLICATE KEY: desde a 017 o índice único leva `organizacao_id`, que
    // é NULL no modelo do sistema — e NULL nunca colide, então cada seed duplicava
    // os onze (achado na Seção 10; a 025 apaga as cópias).
    const [r] = await pool.query(
      `INSERT INTO modelos_declaracao (codigo, titulo, corpo, padrao_sistema, ativo)
       SELECT ?, ?, ?, 1, 1 FROM DUAL
        WHERE NOT EXISTS (SELECT 1 FROM modelos_declaracao
                           WHERE organizacao_id IS NULL AND padrao_sistema = 1 AND codigo = ?)`,
      [modelo.codigo, modelo.titulo, modelo.corpo, modelo.codigo]
    );
    criados += r.affectedRows;
  }
  return criados;
}

// Login próprio (Fase 15). Só cria se não houver NENHUM usuário — depois
// disso é a tela de "Equipe" que manda, o seed nunca mais toca em senha.
// Sem ADMIN_SENHA_PADRAO no .env, o seed avisa e não cria ninguém: subir um
// painel sem um primeiro login não serve, mas uma senha padrão fixa no
// código seria pior. Quando o seed não cria, devolve o motivo (antes saía em
// silêncio) e `npm run admin` conserta mesmo com outros usuários no banco.
async function semearAdmin() {
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM usuarios');
  if (Number(n) > 0) {
    return { criado: null, motivo: `já há ${n} usuário(s) no banco, então o seed não mexeu em login — para criar ou consertar o administrador das variáveis, rode \`npm run admin\`` };
  }
  const resultado = await garantirAdmin({
    pool,
    email: process.env.ADMIN_EMAIL_PADRAO,
    senha: process.env.ADMIN_SENHA_PADRAO,
  });
  if (resultado.acao === 'sem_variaveis') {
    return { criado: null, motivo: 'ADMIN_EMAIL_PADRAO/ADMIN_SENHA_PADRAO não estão definidas neste serviço — defina os dois, implante e rode `npm run admin`' };
  }
  return { criado: resultado.email, motivo: null };
}

// Coordenadas dos 5.570 municípios do IBGE, para o filtro de raio do Radar
// (Seção 7 do plano SaaS). Fonte: kelvins/municipios-brasileiros (licença MIT),
// reduzida a código, nome, UF, latitude e longitude. Catálogo compartilhado:
// regravar é idempotente.
async function semearMunicipios() {
  const arquivo = path.join(__dirname, 'dados', 'municipios.csv');
  const linhas = fs.readFileSync(arquivo, 'utf8').trim().split('\n').slice(1);
  const registros = linhas.map((linha) => {
    const [codigo, nome, uf, latitude, longitude] = linha.split(',');
    return [Number(codigo), nome, uf, Number(latitude), Number(longitude)];
  });
  for (let i = 0; i < registros.length; i += 500) {
    await pool.query(
      `INSERT INTO municipios (codigo_ibge, nome, uf, latitude, longitude) VALUES ?
       ON DUPLICATE KEY UPDATE nome = VALUES(nome), uf = VALUES(uf),
         latitude = VALUES(latitude), longitude = VALUES(longitude)`,
      [registros.slice(i, i + 500)]
    );
  }
  return registros.length;
}

async function principal() {
  const admin = await semearAdmin();
  const fontes = await semearFontes();
  const palavras = await semearPalavras();
  const excluidas = await semearExcluidas();
  const perfil = await semearPerfil();
  const kits = await semearKits();
  const modelos = await semearModelos();
  const precos = await encerradas.semearEstudo();
  const municipios = await semearMunicipios();

  console.log(
    admin.criado
      ? `Usuário administrador criado: ${admin.criado} (organização Studio Mythos, papel dono).`
      : `Usuário administrador: nenhum criado — ${admin.motivo}.`
  );
  console.log(`Municípios com coordenadas: ${municipios}.`);
  console.log(`Fontes inseridas: ${fontes} (de ${FONTES.length}).`);
  console.log(`Palavras-chave inseridas: ${palavras} (de ${PALAVRAS.length}).`);
  console.log(`Palavras excluídas inseridas: ${excluidas} (de ${EXCLUIDAS.length}).`);
  console.log(
    perfil
      ? `Perfil da empresa criado: ${perfilPadrao.nome} (${perfilPadrao.cnaes.length} CNAEs).`
      : 'Perfil da empresa já existia — preservado como está.'
  );
  console.log(`Kits de documentos criados: ${kits} (de ${kitsPadrao.length}).`);
  console.log(`Modelos de declaração criados: ${modelos} (de ${modelosDeclaracao.length}).`);
  console.log(
    `Preços de referência do levantamento de 10/10/2026: ${precos} (de ${regrasPreco.ESTUDO.length}).`
  );
  console.log('Seed concluído. O que já existia foi preservado.');
  await pool.end();
}

principal().catch(async (erro) => {
  console.error('Falha no seed:', erro.sqlMessage || erro.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
