// Job `alertas_contrato` (seções 14 e 28) — avisa antes de cada marco.
//
// Diário, 08h, junto com os outros avisos datados. Perder prazo contratual
// custa mais caro do que perder a licitação, e ainda gera sanção que atrapalha
// as próximas: o aviso sai com antecedência e volta a sair quando o marco
// atrasa, porque marco atrasado é o único que já custa dinheiro.
const pool = require('../config/db');
const fila = require('../servicos/fila');
const alertas = require('../servicos/alertas');
const servico = require('../servicos/contrato');
const regras = require('../regras/contrato');

// Quantos dias antes cada tipo de marco avisa. Assinatura e garantia são os
// que inabilitam: avisam mais cedo e com nível mais alto. Renovação já nasce
// 90 dias antes do fim da vigência, então o aviso dela é no dia.
const ANTECEDENCIA = {
  assinatura: 3,
  empenho: 3,
  garantia: 5,
  entrega: 7,
  aceite: 3,
  nota_fiscal: 3,
  pagamento: 3,
  renovacao: 0,
  medicao: 3,
};

// Marco que inabilita ou rescinde é vermelho (seção 21.3): não pode passar
// batido. Os outros são atenção.
const VERMELHOS = new Set(['assinatura', 'garantia']);

const ANTECEDENCIA_PADRAO = 3;

function resumir(texto, tamanho = 80) {
  if (!texto) return 'contrato sem objeto';
  const limpo = String(texto).replace(/\s+/g, ' ').trim();
  return limpo.length > tamanho ? `${limpo.slice(0, tamanho)}…` : limpo;
}

/**
 * Cria o alerta de cada marco que entra na janela de antecedência, e de cada
 * marco já atrasado.
 *
 * A chave inclui o dia previsto: marco cuja data você corrigir volta a avisar,
 * em vez de ficar calado porque já avisou uma vez na data antiga.
 */
async function avisarMarcos({ agora = new Date() } = {}) {
  const [linhas] = await pool.query(
    `SELECT m.id, m.contrato_id, m.tipo, m.titulo, m.previsto_para, m.valor,
            c.licitacao_id, c.numero, c.situacao,
            l.objeto, l.orgao_nome
       FROM contrato_marcos m
       JOIN contratos c ON c.id = m.contrato_id
       JOIN licitacoes l ON l.id = c.licitacao_id
      WHERE m.concluido_em IS NULL
        AND m.previsto_para IS NOT NULL
        AND c.situacao NOT IN ('encerrado','rescindido')`
  );

  const hoje = regras.diaDe(agora);
  let criados = 0;
  let atrasados = 0;

  for (const m of linhas) {
    const dia = regras.diaDe(m.previsto_para);
    if (!dia) continue;

    const dias = Math.round((dia.getTime() - hoje.getTime()) / 86400000);
    const janela = ANTECEDENCIA[m.tipo] === undefined ? ANTECEDENCIA_PADRAO : ANTECEDENCIA[m.tipo];
    const atrasado = dias < 0;

    if (!atrasado && dias > janela) continue;
    if (atrasado) atrasados += 1;

    const quando = regras.diaDe(m.previsto_para);
    const identificacao = m.numero ? `contrato ${m.numero}` : `contrato da licitação ${m.licitacao_id}`;

    const criado = await alertas.criar({
      tipo: 'marco_contrato',
      // Atrasado é vermelho qualquer que seja o tipo: aí já custa dinheiro.
      nivel: atrasado || VERMELHOS.has(m.tipo) ? 'vermelho' : 'atencao',
      chave: `marco_contrato:${m.id}:${servico.comoDia(m.previsto_para)}${atrasado ? ':atrasado' : ''}`,
      licitacaoId: m.licitacao_id,
      quando,
      mensagem:
        (atrasado
          ? `Marco atrasado há ${Math.abs(dias)} dia(s): `
          : dias === 0
            ? 'Marco é hoje: '
            : `Faltam ${dias} dia(s) para: `) +
        `${m.titulo} — ${identificacao}, ${resumir(m.objeto)} (${m.orgao_nome || 'órgão não informado'}).` +
        (m.valor ? ` Valor: R$ ${Number(m.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.` : ''),
    });
    if (criado) criados += 1;
  }

  return { marcos_abertos: linhas.length, criados, atrasados };
}

/**
 * O aviso de 80% da faixa da LC 123 (seção 28.3).
 *
 * A chave carrega o mês: o aviso volta uma vez por mês enquanto a receita
 * estiver perto do teto, em vez de aparecer uma única vez e nunca mais — o
 * enquadramento declarado precisa acompanhar a realidade.
 */
async function avisarFaixa({ agora = new Date() } = {}) {
  const r = await servico.receita12m().catch(() => null);
  if (!r) return { avisou: false, motivo: 'sem perfil de empresa cadastrado' };

  const mes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
  let criados = 0;

  if (r.perto_do_teto) {
    const criado = await alertas.criar({
      tipo: 'faixa_receita',
      nivel: 'atencao',
      chave: `faixa_receita:${r.faixa}:${mes}`,
      mensagem:
        `Receita de 12 meses em ${(r.usado_da_faixa * 100).toFixed(0)}% do teto de ${r.faixa} ` +
        `(R$ ${Number(r.teto).toLocaleString('pt-BR')}). Faltam ` +
        `R$ ${Number(r.falta_para_proxima).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} para ` +
        `${r.proxima || 'sair da faixa'}. ${r.ressalva}`,
    });
    if (criado) criados += 1;
  }

  // Enquadramento declarado que não bate com a faixa calculada: a declaração
  // de ME/EPP acompanha cada proposta, e declarar faixa errada é declaração
  // falsa. Vermelho, porque não é coisa de deixar para depois.
  if (r.declaracao_desatualizada) {
    const criado = await alertas.criar({
      tipo: 'faixa_receita',
      nivel: 'vermelho',
      chave: `enquadramento:${r.faixa}:${mes}`,
      mensagem:
        `O perfil declara ${r.natureza_declarada}, mas a receita de 12 meses ` +
        `(R$ ${Number(r.receita).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}, ${r.origem}) ` +
        `cai em ${r.rotulo}. Confira com o contador: a declaração de enquadramento vai em cada proposta.`,
    });
    if (criado) criados += 1;
  }

  return { avisou: criados > 0, criados, faixa: r.faixa, usado: r.usado_da_faixa, origem: r.origem };
}

/**
 * Mantém a situação dos contratos em dia pelo calendário.
 *
 * Só dois movimentos, os dois sem ambiguidade: assinado com vigência começada
 * passa a vigente, e vigência terminada passa a encerrado. Rescindido e
 * prorrogado são decisão sua e o job não toca neles — nem desfaz uma situação
 * que você escolheu à mão (seção 5.2).
 */
async function atualizarSituacoes() {
  const [paraVigente] = await pool.query(
    `UPDATE contratos
        SET situacao = 'vigente'
      WHERE situacao = 'aguardando_assinatura'
        AND assinado_em IS NOT NULL
        AND vigencia_inicio IS NOT NULL
        AND vigencia_inicio <= CURDATE()
        AND (vigencia_fim IS NULL OR vigencia_fim >= CURDATE())`
  );

  const [paraEncerrado] = await pool.query(
    `UPDATE contratos
        SET situacao = 'encerrado'
      WHERE situacao IN ('vigente','prorrogado')
        AND vigencia_fim IS NOT NULL
        AND vigencia_fim < CURDATE()`
  );

  return { viraram_vigentes: paraVigente.affectedRows, encerrados: paraEncerrado.affectedRows };
}

async function rodar(payload = {}) {
  const situacoes = await atualizarSituacoes();
  const marcos = await avisarMarcos(payload);
  const faixa = await avisarFaixa(payload);
  return { ...situacoes, ...marcos, faixa };
}

function registrarNaFila() {
  fila.registrar('alertas_contrato', (payload) => rodar(payload || {}));
}

module.exports = { avisarMarcos, avisarFaixa, atualizarSituacoes, rodar, registrarNaFila, ANTECEDENCIA };
