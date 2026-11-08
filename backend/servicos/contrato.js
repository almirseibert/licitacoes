// Contratos e marcos de execução (seção 28).
//
// O que entra aqui é o que tem multa se atrasar. O contrato nasce quando o card
// vai para "Ganhamos" — com o checklist da seção 28.3 já montado — e dali em
// diante é você que preenche: o painel não lê contrato de portal nenhum, nem
// inventa data que o edital é quem fixa.
const pool = require('../config/db');
const regras = require('../regras/contrato');
const feriadosServico = require('./feriados');
const perfilEmpresa = require('./perfil');

// Campos que a tela pode gravar. Lista fechada pelo mesmo motivo de sempre:
// corpo de requisição não escolhe coluna.
const CAMPOS = {
  numero: 'numero',
  numero_empenho: 'numero_empenho',
  assinado_em: 'assinado_em',
  vigencia_inicio: 'vigencia_inicio',
  vigencia_fim: 'vigencia_fim',
  valor: 'valor',
  valor_executado: 'valor_executado',
  gestor_nome: 'gestor_nome',
  gestor_contato: 'gestor_contato',
  garantia_exigida: 'garantia_exigida',
  garantia_entregue_em: 'garantia_entregue_em',
  situacao: 'situacao',
  observacao: 'observacao',
};

const SITUACOES = ['aguardando_assinatura', 'vigente', 'encerrado', 'rescindido', 'prorrogado'];

const CAMPOS_MARCO = {
  titulo: 'titulo',
  previsto_para: 'previsto_para',
  concluido_em: 'concluido_em',
  valor: 'valor',
  observacao: 'observacao',
};

/** Data pura para o MySQL, ou null. Nunca `String(Date)`, que o MySQL recusa. */
function comoDia(valor) {
  const dia = regras.diaDe(valor);
  if (!dia) return null;
  return `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`;
}

/**
 * Abre o contrato de uma licitação ganha, com o checklist da seção 28.3.
 *
 * Idempotente: chamada de novo, não recria nada e não mexe no que você já
 * preencheu. É o índice único em `licitacao_id` que garante isso, e é o que
 * permite o card entrar em "Ganhamos", sair e voltar sem duplicar contrato.
 *
 * @param {Date|string} convocadoEm a data da convocação; na falta, hoje.
 */
async function abrir(licitacaoId, { convocadoEm = null } = {}) {
  const [[licitacao]] = await pool.query(
    `SELECT id, objeto, orgao_nome, uf, municipio, valor_final, valor_proposto, valor_estimado
       FROM licitacoes WHERE id = ?`,
    [licitacaoId]
  );
  if (!licitacao) throw new Error('Licitação não encontrada.');

  const [[existente]] = await pool.query('SELECT * FROM contratos WHERE licitacao_id = ?', [licitacaoId]);
  if (existente) {
    const marcos = await garantirMarcos(existente.id);
    return { contrato: existente, criado: false, marcos_criados: marcos.criados };
  }

  // O valor do contrato é o valor final adjudicado. Na falta dele, o proposto —
  // que é o que você mandou e normalmente é o que foi homologado. Estimado não
  // entra: é o número do órgão, não o seu.
  const valor = licitacao.valor_final || licitacao.valor_proposto || null;

  const [r] = await pool.query(
    `INSERT INTO contratos (licitacao_id, valor, situacao) VALUES (?, ?, 'aguardando_assinatura')`,
    [licitacaoId, valor]
  );

  const marcos = await garantirMarcos(r.insertId, { convocadoEm });
  const [[contrato]] = await pool.query('SELECT * FROM contratos WHERE id = ?', [r.insertId]);
  return { contrato, criado: true, marcos_criados: marcos.criados };
}

/**
 * Cria os marcos automáticos que ainda faltam.
 *
 * Nunca sobrescreve marco existente — nem a data, nem a conclusão. Quem
 * preencheu foi você, e a seção 5.2 vale aqui também: decisão do usuário fica
 * de fora de todo update automático.
 */
async function garantirMarcos(contratoId, { convocadoEm = null } = {}) {
  const [[contrato]] = await pool.query(
    `SELECT c.*, l.uf, l.municipio, l.etapa_em
       FROM contratos c JOIN licitacoes l ON l.id = c.licitacao_id
      WHERE c.id = ?`,
    [contratoId]
  );
  if (!contrato) throw new Error('Contrato não encontrado.');

  // A convocação não vem de portal: o que se sabe é quando o card entrou em
  // "Ganhamos", e é dali que a contagem parte até você corrigir.
  const convocacao = convocadoEm || contrato.etapa_em || new Date();

  await feriadosServico.garantirAnos({}).catch(() => []);
  const feriados = await feriadosServico.listar({});

  const checklist = regras.montarChecklist(
    {
      convocado_em: convocacao,
      assinado_em: contrato.assinado_em,
      vigencia_inicio: contrato.vigencia_inicio,
      vigencia_fim: contrato.vigencia_fim,
      valor: contrato.valor,
      garantia_exigida: contrato.garantia_exigida,
      uf: contrato.uf,
      municipio: contrato.municipio,
    },
    feriados
  );

  let criados = 0;
  let preenchidos = 0;

  for (const m of checklist) {
    const [r] = await pool.query(
      `INSERT INTO contrato_marcos (contrato_id, tipo, titulo, previsto_para, valor, ordem, origem, observacao)
       VALUES (?, ?, ?, ?, ?, ?, 'automatico', ?)
       ON DUPLICATE KEY UPDATE id = id`,
      [contratoId, m.tipo, m.titulo, m.previsto_para, m.valor, m.ordem, m.nota || null]
    );
    if (r.insertId) {
      criados += 1;
      continue;
    }

    // O marco já existia. Nada do que você preencheu é sobrescrito — mas marco
    // que nasceu sem data porque a data de que ele depende ainda não existia
    // precisa recebê-la quando ela aparece. Sem isto, "Entregar ou iniciar a
    // execução" ficava em branco para sempre, mesmo depois de a vigência ser
    // informada, e marco sem data não gera alerta nenhum: o prazo com multa
    // ficaria invisível. A condição é a que distingue lacuna de decisão: só
    // entra onde está nulo, no automático, e no que ainda não foi concluído.
    // Uma coluna por vez, cada uma com a sua própria condição de lacuna: numa
    // só consulta, exigir as duas nulas deixaria de preencher a data do marco
    // de garantia sempre que o valor dele já estivesse lá.
    let mexeu = false;
    for (const [coluna, valor] of [['previsto_para', m.previsto_para], ['valor', m.valor]]) {
      if (!valor) continue;
      const [u] = await pool.query(
        `UPDATE contrato_marcos
            SET ${coluna} = ?
          WHERE contrato_id = ? AND tipo = ? AND titulo = ?
            AND origem = 'automatico' AND concluido_em IS NULL
            AND ${coluna} IS NULL`,
        [valor, contratoId, m.tipo, m.titulo]
      );
      if (u.affectedRows) mexeu = true;
    }
    if (mexeu) preenchidos += 1;
  }

  return { criados, preenchidos, previstos: checklist.length };
}

/** Um contrato com os marcos, a faixa da LC 123 e o que falta. */
async function ver(contratoId) {
  const [[contrato]] = await pool.query(
    `SELECT c.*, l.objeto, l.orgao_nome, l.orgao_cnpj, l.uf, l.municipio, l.modalidade,
            l.numero_compra, l.etapa, l.link_portal
       FROM contratos c JOIN licitacoes l ON l.id = c.licitacao_id
      WHERE c.id = ?`,
    [contratoId]
  );
  if (!contrato) return null;

  const [marcos] = await pool.query(
    'SELECT * FROM contrato_marcos WHERE contrato_id = ? ORDER BY ordem ASC, previsto_para ASC, id ASC',
    [contratoId]
  );

  return { contrato, marcos, proximo: proximoMarco(marcos) };
}

/**
 * O próximo marco a vencer: o primeiro não concluído com data, ou, não havendo
 * nenhum com data, o primeiro não concluído da ordem.
 */
function proximoMarco(marcos) {
  const abertos = marcos.filter((m) => !m.concluido_em);
  if (!abertos.length) return null;

  const comData = abertos
    .filter((m) => m.previsto_para)
    .sort((a, b) => String(comoDia(a.previsto_para)).localeCompare(String(comoDia(b.previsto_para))));

  const escolhido = comData[0] || abertos[0];
  const dia = regras.diaDe(escolhido.previsto_para);

  if (!dia) return { ...escolhido, dias_restantes: null, atrasado: false };

  const hoje = regras.diaDe(new Date());
  const dias = Math.round((dia.getTime() - hoje.getTime()) / 86400000);
  return { ...escolhido, dias_restantes: dias, atrasado: dias < 0 };
}

async function listar({ situacao = null } = {}) {
  const condicoes = [];
  const valores = [];
  if (situacao) {
    condicoes.push('c.situacao = ?');
    valores.push(situacao);
  }

  const [contratos] = await pool.query(
    `SELECT c.*, l.objeto, l.orgao_nome, l.uf, l.numero_compra, l.modalidade
       FROM contratos c JOIN licitacoes l ON l.id = c.licitacao_id
      ${condicoes.length ? `WHERE ${condicoes.join(' AND ')}` : ''}
      ORDER BY FIELD(c.situacao, 'vigente', 'aguardando_assinatura', 'prorrogado', 'encerrado', 'rescindido'),
               c.vigencia_fim IS NULL, c.vigencia_fim ASC, c.id DESC`,
    valores
  );
  if (!contratos.length) return [];

  // Os marcos de todos os contratos numa consulta: a tela mostra o próximo
  // marco de cada linha, e uma consulta por contrato seria uma por linha.
  const ids = contratos.map((c) => c.id);
  const [marcos] = await pool.query(
    `SELECT * FROM contrato_marcos WHERE contrato_id IN (${ids.map(() => '?').join(',')})
      ORDER BY ordem ASC, previsto_para ASC, id ASC`,
    ids
  );

  const porContrato = new Map(ids.map((id) => [id, []]));
  for (const m of marcos) porContrato.get(m.contrato_id).push(m);

  return contratos.map((c) => {
    const lista = porContrato.get(c.id) || [];
    return {
      ...c,
      marcos_total: lista.length,
      marcos_concluidos: lista.filter((m) => m.concluido_em).length,
      proximo: proximoMarco(lista),
    };
  });
}

async function salvar(contratoId, corpo = {}) {
  const partes = [];
  const valores = [];

  for (const [campo, coluna] of Object.entries(CAMPOS)) {
    if (corpo[campo] === undefined) continue;

    let valor = corpo[campo];
    if (campo === 'situacao' && !SITUACOES.includes(valor)) {
      throw new Error(`Situação inválida: ${valor}.`);
    }
    if (campo.endsWith('_em') || campo.startsWith('vigencia')) valor = comoDia(valor);
    if (campo === 'garantia_exigida') valor = valor ? 1 : 0;
    // Campo de texto vazio é ausência de dado, não string vazia: a lacuna
    // visível da seção 18 depende do null para saber que falta.
    if (valor === '') valor = null;

    partes.push(`${coluna} = ?`);
    valores.push(valor);
  }

  if (!partes.length) throw new Error('Nada para atualizar.');
  await pool.query(`UPDATE contratos SET ${partes.join(', ')} WHERE id = ?`, [...valores, contratoId]);

  // Mudou data de assinatura, vigência, valor ou a exigência de garantia: os
  // marcos automáticos que ainda não existiam passam a existir — a garantia,
  // por exemplo, só nasce depois de você marcar que o edital a exige.
  const recalcula = ['assinado_em', 'vigencia_inicio', 'vigencia_fim', 'valor', 'garantia_exigida'];
  if (recalcula.some((c) => corpo[c] !== undefined)) {
    await garantirMarcos(contratoId);
  }

  return ver(contratoId);
}

async function salvarMarco(marcoId, corpo = {}) {
  const partes = [];
  const valores = [];

  for (const [campo, coluna] of Object.entries(CAMPOS_MARCO)) {
    if (corpo[campo] === undefined) continue;
    let valor = corpo[campo];
    if (campo === 'previsto_para' || campo === 'concluido_em') valor = comoDia(valor);
    if (valor === '') valor = null;
    partes.push(`${coluna} = ?`);
    valores.push(valor);
  }
  if (!partes.length) throw new Error('Nada para atualizar.');

  await pool.query(`UPDATE contrato_marcos SET ${partes.join(', ')} WHERE id = ?`, [...valores, marcoId]);

  const [[marco]] = await pool.query('SELECT * FROM contrato_marcos WHERE id = ?', [marcoId]);
  return marco;
}

/** Marco acrescentado à mão — medição mensal, por exemplo. */
async function criarMarco(contratoId, { tipo, titulo, previsto_para, valor, observacao } = {}) {
  const tipos = ['assinatura', 'empenho', 'garantia', 'entrega', 'aceite', 'nota_fiscal', 'pagamento', 'renovacao', 'medicao'];
  if (!tipos.includes(tipo)) throw new Error(`Tipo de marco inválido: ${tipo}.`);
  if (!titulo) throw new Error('Dê um título ao marco.');

  const [r] = await pool.query(
    `INSERT INTO contrato_marcos (contrato_id, tipo, titulo, previsto_para, valor, ordem, origem, observacao)
     VALUES (?, ?, ?, ?, ?, 50, 'manual', ?)`,
    [contratoId, tipo, String(titulo).slice(0, 160), comoDia(previsto_para), valor || null, observacao || null]
  );
  const [[marco]] = await pool.query('SELECT * FROM contrato_marcos WHERE id = ?', [r.insertId]);
  return marco;
}

async function removerMarco(marcoId) {
  // Marco automático não se apaga: ele volta no próximo `garantirMarcos`, e
  // apagar um prazo com multa por engano é o tipo de coisa que o painel existe
  // para evitar. Para tirá-lo da frente, conclua-o.
  const [r] = await pool.query("DELETE FROM contrato_marcos WHERE id = ? AND origem = 'manual'", [marcoId]);
  return r.affectedRows > 0;
}

/**
 * Faturado nos últimos 12 meses (seção 28.3).
 *
 * Dois números, e a tela mostra os dois: o que passou pelo painel — soma de
 * `valor_executado` dos contratos — e o que o contador informou, em
 * `empresa_perfis.receita_12m`. A faixa é calculada sobre o do contador quando
 * ele existe, porque é ele que vale para a declaração; sem ele, sobre o do
 * painel, dizendo que é parcial.
 */
async function receita12m(perfilId = null) {
  const [[somado]] = await pool.query(
    `SELECT COALESCE(SUM(valor_executado), 0) AS executado, COUNT(*) AS contratos
       FROM contratos
      WHERE valor_executado > 0
        AND (
          -- O que foi executado no período: vigência que alcança os últimos 12
          -- meses, ou contrato assinado dentro deles.
          (vigencia_fim IS NOT NULL AND vigencia_fim >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH))
          OR (assinado_em IS NOT NULL AND assinado_em >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH))
        )`
  );

  const perfil = await perfilEmpresa.padrao(perfilId).catch(() => null);
  const doContador = perfil && Number(perfil.receita_12m) > 0 ? Number(perfil.receita_12m) : null;
  const doPainel = Number(somado.executado);

  const base = doContador !== null ? doContador : doPainel;
  const faixa = regras.faixaDe(base);

  return {
    ...faixa,
    // Qual número a faixa usou, para a tela nunca apresentar um pelo outro.
    origem: doContador !== null ? 'contador' : 'painel',
    receita_painel: doPainel,
    receita_contador: doContador,
    contratos_somados: somado.contratos,
    apurada_em: perfil ? perfil.receita_12m_apurada_em : null,
    natureza_declarada: perfil ? perfil.natureza : null,
    // Divergência entre o que a empresa declara e a faixa calculada: a
    // declaração precisa acompanhar a realidade (seção 28.3).
    declaracao_desatualizada: Boolean(
      perfil && ['ME', 'EPP'].includes(perfil.natureza) && faixa.faixa !== perfil.natureza
    ),
    ressalva:
      doContador !== null
        ? 'A faixa usa a receita informada pelo contador. O painel só soma o que passou por ele.'
        : 'Este número é só o que passou pelo painel, não a contabilidade da empresa. Informe a receita do contador em Configurações.',
  };
}

module.exports = {
  abrir,
  garantirMarcos,
  ver,
  listar,
  salvar,
  salvarMarco,
  criarMarco,
  removerMarco,
  receita12m,
  proximoMarco,
  comoDia,
  SITUACOES,
};
