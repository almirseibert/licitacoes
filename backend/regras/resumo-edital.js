// Resumo do Edital 2.0 (Seção 11 do plano SaaS) — regras puras, sem banco e sem rede.
//
// A leitura assistida da seção 23 devolve um resumo curto. Esta é a ficha
// completa, campo a campo, e a regra que manda em tudo aqui é uma só: **toda
// afirmação cita o trecho**. O modelo recebe o edital em blocos rotulados
// [T1]..[Tn] (os mesmos do Pergunte ao Edital) e, para cada campo, devolve o
// valor, o rótulo do bloco e uma frase copiada dele. Campo cuja frase não está,
// letra a letra, no bloco citado é **descartado** — vira "Não informado" na
// tela, nunca palpite. Arquivo e página vêm do nosso bloco, nunca do modelo.
//
// Testado em testes/resumo-edital.test.js.

const { indexarBlocos, pontuarBlocos, pareceInstrucao } = require('./busca-edital');
const { textoLimpo, citacaoLiteral, confiancaValida } = require('./ia-schema');
const { normalizarPalavras: normalizar } = require('./texto');

const NAO_INFORMADO = 'Não informado';

/**
 * O catálogo da ficha, na ordem em que ela aparece. `busca` são as palavras
 * que escolhem os blocos do edital enviados ao modelo para aquele grupo.
 */
const GRUPOS = [
  {
    chave: 'cabecalho',
    titulo: 'Cabeçalho',
    busca: 'valor estimado total modalidade pregão concorrência sessão pública data hora abertura',
    campos: [
      ['valor_estimado', 'Valor estimado'],
      ['modalidade', 'Modalidade'],
      ['data_sessao', 'Data e hora da sessão'],
    ],
  },
  {
    chave: 'identificacao',
    titulo: 'Identificação',
    busca: 'número edital processo administrativo objeto contratação',
    campos: [
      ['numero_edital', 'Número do edital'],
      ['processo', 'Processo'],
      ['objeto', 'Objeto'],
    ],
  },
  {
    chave: 'sessao',
    titulo: 'Sessão pública',
    busca: 'modo disputa aberto fechado lances intervalo mínimo diferença entre lances plataforma sistema eletrônico',
    campos: [
      ['modo_disputa', 'Modo de disputa'],
      ['intervalo_lances', 'Intervalo mínimo entre lances'],
      ['plataforma', 'Plataforma'],
    ],
  },
  {
    chave: 'orgao',
    titulo: 'Órgão',
    busca: 'município prefeitura secretaria órgão gerenciador endereço unidade',
    campos: [
      ['orgao_nome', 'Órgão'],
      ['orgao_local', 'Local e contato'],
    ],
  },
  {
    chave: 'detalhes',
    titulo: 'Detalhes',
    busca:
      'local execução entrega microempresa pequeno porte exclusiva cota visita técnica vistoria amostra critério julgamento menor preço regionalidade sede prova conceito',
    campos: [
      ['execucao', 'Execução'],
      ['me_epp', 'ME/EPP'],
      ['visita_tecnica', 'Visita técnica'],
      ['amostra', 'Amostra'],
      ['criterio_julgamento', 'Critério de julgamento'],
      ['regionalidade', 'Regionalidade'],
      ['prova_conceito', 'Prova de conceito'],
    ],
  },
  {
    chave: 'garantias',
    titulo: 'Garantias',
    busca: 'garantia proposta garantia contratual adicional seguro garantia retomada caução fiança percentual',
    campos: [
      ['garantia_proposta', 'Garantia da proposta'],
      ['garantia_contrato', 'Garantia do contrato'],
      ['garantia_adicional', 'Garantia adicional'],
      ['garantia_retomada', 'Cláusula de retomada'],
    ],
  },
  {
    chave: 'prazos',
    titulo: 'Prazos',
    busca: 'prazo esclarecimento impugnação dias úteis entrega vigência contrato meses',
    campos: [
      ['prazo_esclarecimento', 'Esclarecimento'],
      ['prazo_impugnacao', 'Impugnação'],
      ['prazo_entrega', 'Entrega ou execução'],
      ['vigencia', 'Vigência'],
    ],
  },
  {
    chave: 'proposta',
    titulo: 'Proposta',
    busca: 'validade proposta dias desempate empate ficto preferência',
    campos: [
      ['validade_proposta', 'Validade'],
      ['desempate', 'Desempate'],
    ],
  },
  {
    chave: 'pagamento',
    titulo: 'Pagamento',
    busca: 'pagamento nota fiscal dias liquidação atestado recebimento',
    campos: [
      ['prazo_pagamento', 'Prazo de pagamento'],
      ['condicao_pagamento', 'Condição'],
    ],
  },
  {
    chave: 'analise',
    titulo: 'Análise crítica',
    busca: 'subcontratação reajuste índice IPCA renovação prorrogação minuta contrato divergência',
    campos: [
      ['subcontratacao', 'Subcontratação'],
      ['reajuste', 'Reajuste'],
      ['renovacao', 'Renovação'],
      ['conflito_edital_minuta', 'Conflito entre edital e minuta'],
    ],
  },
];

/** Listas da ficha: muitas afirmações, cada uma com a sua citação. */
const LISTAS = [
  { chave: 'itens', titulo: 'Itens', busca: 'item lote quantidade unidade descrição especificação' },
  {
    chave: 'habilitacao',
    titulo: 'Habilitação',
    busca: 'habilitação atestado capacidade técnica balanço certidão regularidade fiscal trabalhista qualificação',
  },
  { chave: 'legislacao', titulo: 'Legislação', busca: 'lei 14.133 decreto complementar 123 regido legislação' },
  { chave: 'penalidades', titulo: 'Penalidades e multas', busca: 'multa sanção penalidade inexecução atraso impedimento licitar' },
];

const QUESTIONAMENTOS = { busca: 'exigência restritiva exclusivamente marca específica comprovação experiência mínima prazo' };

const TIPOS_QUESTIONAMENTO = ['esclarecimento', 'impugnacao'];

const CHAVES_CAMPO = new Map(GRUPOS.flatMap((g) => g.campos.map(([chave, rotulo]) => [chave, rotulo])));

// Citação: limites de `ia-schema` (os mesmos do Pergunte ao Edital).
const LIMITES = {
  valor: 400,
  porLista: 15,
  questionamentos: 8,
  ponto: 400,
  lei: 160,
  trechosPorGrupo: 4,
  abertura: 3, // os primeiros blocos sempre vão: é onde estão número, órgão e objeto
};

/**
 * Os blocos do edital que vão ao modelo: os primeiros (cabeçalho) e os que
 * mais falam de cada grupo, sem repetir, na ordem do documento e dentro do
 * teto de caracteres. Rotulados T1..Tn — é o rótulo que o modelo cita. O
 * edital é cortado e normalizado uma vez só; cada grupo só pontua o índice.
 *
 * @param {Array} paginas  saída de `paginasDoArquivo`, de todos os arquivos
 * @param {number} maxCaracteres
 */
function selecionarTrechos(paginas, maxCaracteres) {
  const indice = indexarBlocos(paginas);

  // A prioridade é a ordem desta lista: se o teto cortar, corta o que veio por último.
  const escolhidos = new Map(); // ordem no documento -> bloco
  const incluir = ({ bloco, ordem }) => {
    if (!escolhidos.has(ordem)) escolhidos.set(ordem, bloco);
  };
  indice.slice(0, LIMITES.abertura).forEach(incluir);
  for (const fonte of [...GRUPOS, ...LISTAS, QUESTIONAMENTOS]) {
    pontuarBlocos(indice, fonte.busca, { max: LIMITES.trechosPorGrupo }).forEach(incluir);
  }

  const dentro = [];
  let total = 0;
  for (const [ordem, b] of escolhidos) {
    if (total + b.texto.length > maxCaracteres) continue;
    total += b.texto.length;
    dentro.push([ordem, b]);
  }
  return dentro
    .sort((a, b) => a[0] - b[0])
    .map(([, b], i) => ({ id: `T${i + 1}`, arquivoId: b.arquivoId, arquivo: b.arquivo, pagina: b.pagina, texto: b.texto }));
}

/** Afirmação = valor + citação literal. Sem as duas, não entra. */
function afirmacao(item, onde, ctx, limite = LIMITES.valor) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    ctx.descartados.push(`${onde}: não é objeto`);
    return null;
  }
  const valor = textoLimpo(item.valor, limite);
  if (!valor) return null; // o modelo disse que o edital não trata disso
  const c = citacaoLiteral(item, ctx.porId, ctx.normalizados);
  if (c.erro || !c.literal) {
    ctx.descartados.push(`${onde}: ${c.erro || `a frase citada não está em ${c.id}`}`);
    return null;
  }
  const { id, trecho, frase } = c;
  return { valor, citacao: { trecho: id, arquivo_id: trecho.arquivoId || null, arquivo: trecho.arquivo || null, pagina: trecho.pagina || null, texto: frase } };
}

/**
 * Valida o resumo devolvido pelo modelo (seção 23.4). Só sobrevive o que está
 * no catálogo e cita literalmente um dos blocos enviados.
 *
 * @param {object} bruto    JSON do modelo
 * @param {Array<{id,arquivoId,arquivo,pagina,texto}>} trechos  os enviados
 * @returns {{ok, dados, descartados, motivo}}
 */
function validarResumo(bruto, trechos = []) {
  const descartados = [];
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) {
    return { ok: false, dados: null, descartados, motivo: 'a resposta não é um objeto JSON' };
  }
  const ctx = {
    descartados,
    porId: new Map(trechos.map((t) => [t.id, t])),
    normalizados: new Map(trechos.map((t) => [t.id, normalizar(t.texto)])),
  };

  const campos = bruto.campos && typeof bruto.campos === 'object' && !Array.isArray(bruto.campos) ? bruto.campos : {};
  for (const chave of Object.keys(campos)) {
    if (!CHAVES_CAMPO.has(chave)) descartados.push(`campos: ${chave} fora do catálogo`);
  }

  const grupos = GRUPOS.map((g) => ({
    chave: g.chave,
    titulo: g.titulo,
    campos: g.campos.map(([chave, rotulo]) => {
      const a = Object.prototype.hasOwnProperty.call(campos, chave) ? afirmacao(campos[chave], chave, ctx) : null;
      return { chave, rotulo, valor: a ? a.valor : null, citacao: a ? a.citacao : null };
    }),
  }));

  const listas = LISTAS.map((l) => {
    const entrada = Array.isArray(bruto[l.chave]) ? bruto[l.chave] : [];
    const itens = [];
    for (const [i, item] of entrada.slice(0, LIMITES.porLista).entries()) {
      const a = afirmacao(item, `${l.chave}[${i}]`, ctx);
      if (a) itens.push(a);
    }
    if (entrada.length > LIMITES.porLista) descartados.push(`${l.chave}: acima de ${LIMITES.porLista} itens`);
    return { chave: l.chave, titulo: l.titulo, itens };
  });

  const questionamentos = [];
  for (const [i, item] of (Array.isArray(bruto.questionamentos) ? bruto.questionamentos : [])
    .slice(0, LIMITES.questionamentos)
    .entries()) {
    const ponto = afirmacao(item && { ...item, valor: item.ponto }, `questionamentos[${i}]`, ctx, LIMITES.ponto);
    if (!ponto) continue;
    const tipo = TIPOS_QUESTIONAMENTO.includes(item.tipo) ? item.tipo : 'esclarecimento';
    // A lei é do modelo, não do edital: só entra se parecer uma norma, e a
    // tela diz que é para conferir.
    const lei = textoLimpo(item.lei, LIMITES.lei);
    const leiValida = lei && /\b(lei|art\.?|artigo|decreto|constitui|s[uú]mula|ac[oó]rd[aã]o|in\b|instru[cç][aã]o)/i.test(lei) ? lei : null;
    if (lei && !leiValida) descartados.push(`questionamentos[${i}].lei: não parece uma norma`);
    questionamentos.push({ ponto: ponto.valor, tipo, lei: leiValida, citacao: ponto.citacao });
  }

  const confianca = confiancaValida(bruto.confianca, descartados);


  return {
    ok: true,
    motivo: null,
    descartados,
    dados: {
      grupos,
      listas,
      questionamentos,
      confianca,
      // Bloco com texto dirigido à IA: a tela avisa (o schema já é a defesa).
      suspeitos: trechos.filter((t) => pareceInstrucao(t.texto)).map((t) => ({ trecho: t.id, arquivo: t.arquivo, pagina: t.pagina })),
    },
  };
}

/** "Arquivo · página N" de uma citação, para e-mail, .docx e impressão. */
function onde(citacao) {
  if (!citacao) return '';
  return `${citacao.arquivo || 'edital'} · ${citacao.pagina ? `página ${citacao.pagina}` : 'página não identificada'}`;
}

/**
 * O resumo como linhas de checklist: [seção, item, o que o edital diz, onde].
 * Uma fonte só para e-mail, .docx e impressão — as três saídas dizem o mesmo.
 */
function linhasDoChecklist(dados, consideracoes = '') {
  const linhas = [];
  for (const g of dados.grupos || []) {
    for (const c of g.campos) linhas.push([g.titulo, c.rotulo, c.valor || NAO_INFORMADO, c.valor ? `"${c.citacao.texto}" (${onde(c.citacao)})` : '']);
  }
  for (const l of dados.listas || []) {
    if (!l.itens.length) linhas.push([l.titulo, '—', NAO_INFORMADO, '']);
    l.itens.forEach((a, i) => linhas.push([l.titulo, String(i + 1), a.valor, `"${a.citacao.texto}" (${onde(a.citacao)})`]));
  }
  (dados.questionamentos || []).forEach((q, i) =>
    linhas.push([
      'Possíveis questionamentos',
      `${i + 1} · ${q.tipo === 'impugnacao' ? 'impugnação' : 'esclarecimento'}`,
      q.lei ? `${q.ponto} — ${q.lei} (lei sugerida pela IA: confira)` : q.ponto,
      `"${q.citacao.texto}" (${onde(q.citacao)})`,
    ])
  );
  if (consideracoes && consideracoes.trim()) linhas.push(['Considerações do licitante', '—', consideracoes.trim(), '']);
  return linhas;
}

/** Texto do e-mail: o checklist, com a data e o aviso sempre no topo. */
function textoDoEmail({ titulo, geradoEm, dados, consideracoes }) {
  const corpo = [`${titulo}`, `Gerado pela IA em ${geradoEm}. A IA pode errar: confira cada item no trecho citado do edital.`, ''];
  let secao = null;
  for (const [s, item, valor, de] of linhasDoChecklist(dados, consideracoes)) {
    if (s !== secao) {
      corpo.push('', s.toUpperCase());
      secao = s;
    }
    corpo.push(`[ ] ${item}: ${valor}${de ? `\n    ${de}` : ''}`);
  }
  return corpo.join('\n');
}

/**
 * O parágrafo do pedido montado a partir de um possível questionamento:
 * troca a primeira lacuna do modelo (seção 25.2) pelo trecho citado. O resto
 * das lacunas fica — o argumento é de quem assina, não da IA.
 */
function preencherQuestionamento(texto, { ponto, citacao }) {
  if (!citacao || !citacao.texto) return texto;
  const local = onde(citacao);
  const trocas = [
    [/O item ____________ do edital estabelece que ____________\./, `O edital estabelece (${local}): "${citacao.texto}".`],
    [/O item ____________ do edital exige ____________\./, `O edital exige (${local}): "${citacao.texto}".`],
    [/O item ____________ do termo de referência especifica ____________\./, `O edital especifica (${local}): "${citacao.texto}".`],
  ];
  let saida = texto;
  for (const [padrao, troca] of trocas) saida = saida.replace(padrao, troca);
  if (ponto) saida = saida.replace(/Resta dúvida quanto a ____________/, `Resta dúvida quanto ao seguinte ponto: ${ponto.replace(/\.$/, '')}`);
  return saida;
}

module.exports = {
  GRUPOS,
  NAO_INFORMADO,
  selecionarTrechos,
  validarResumo,
  linhasDoChecklist,
  textoDoEmail,
  preencherQuestionamento,
};
