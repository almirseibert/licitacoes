// Trilha de auditoria (Seção 17 do PLANO_SAAS_CONLICITACAO.md) — o que merece
// registro e o que entra no detalhe, sem banco.
//
// Decisão: a trilha diz QUEM fez O QUÊ e EM QUÊ, nunca o conteúdo. Corpo de
// requisição não vai para o banco (tem senha, texto de proposta, segredo de
// webhook); só os poucos campos de controle listados em `CAMPOS_DO_DETALHE`,
// e só os que a regra pede.

const ID = '(\\d+)';

// [método, caminho (sem /api e sem query), ação, entidade, campos do corpo que entram no detalhe]
const REGRAS = [
  ['POST', '^/auth/convites$', 'convidou', 'equipe', ['papel']],
  ['DELETE', `^/auth/convites/${ID}$`, 'cancelou_convite', 'equipe', []],
  ['PATCH', `^/auth/equipe/${ID}$`, 'mudou_papel', 'equipe', ['papel', 'ativo']],
  ['DELETE', `^/auth/equipe/${ID}$`, 'removeu_membro', 'equipe', []],

  ['POST', '^/empresa/documentos$', 'subiu_documento', 'documento', ['codigo']],
  ['PATCH', `^/empresa/documentos/${ID}$`, 'alterou_documento', 'documento', ['valido_ate', 'ativo']],
  ['DELETE', `^/empresa/documentos/${ID}$`, 'removeu_documento', 'documento', []],
  ['POST', `^/empresa/documentos/${ID}/revisado$`, 'revisou_documento', 'documento', []],

  ['POST', '^/empresa/perfis$', 'criou_perfil_empresa', 'empresa', []],
  ['PATCH', `^/empresa/perfis/${ID}$`, 'alterou_perfil_empresa', 'empresa', []],

  ['POST', '^/gestao/tarefas$', 'criou_tarefa', 'tarefa', ['status', 'prazo']],
  ['PATCH', `^/gestao/tarefas/${ID}$`, 'alterou_tarefa', 'tarefa', ['status', 'prazo', 'responsavel_id']],
  ['DELETE', `^/gestao/tarefas/${ID}$`, 'removeu_tarefa', 'tarefa', []],

  ['PATCH', `^/licitacoes/${ID}$`, 'alterou_licitacao', 'licitacao', ['etapa', 'favorito', 'descartada']],

  ['POST', '^/servicos/pedidos$', 'pediu_servico', 'servico', ['servico']],
  ['POST', `^/servicos/pedidos/${ID}/cancelar$`, 'cancelou_pedido_servico', 'servico', []],

  ['POST', '^/admin/parceiros$', 'cadastrou_parceiro', 'parceiro', []],
  ['PATCH', `^/admin/parceiros/${ID}$`, 'alterou_parceiro', 'parceiro', ['ativo']],
  ['POST', `^/admin/servicos/pedidos/${ID}$`, 'atualizou_pedido_servico', 'servico', ['status']],
  ['POST', `^/admin/servicos/pedidos/${ID}/reenviar$`, 'reenviou_pedido_servico', 'servico', []],

  ['POST', '^/integracoes/tokens$', 'criou_token_api', 'integracao', []],
  ['DELETE', `^/integracoes/tokens/${ID}$`, 'revogou_token_api', 'integracao', []],
  ['POST', '^/integracoes/webhooks$', 'criou_webhook', 'integracao', []],
  ['DELETE', `^/integracoes/webhooks/${ID}$`, 'removeu_webhook', 'integracao', []],
];

const COMPILADAS = REGRAS.map(([metodo, padrao, acao, entidade, campos]) => ({
  metodo, re: new RegExp(padrao, 'i'), acao, entidade, campos,
}));

/** O id de quem foi criado: está na raiz da resposta (`{ id }`) ou num objeto dentro dela (`{ tarefa: { id } }`). */
function idDaResposta(resposta) {
  if (!resposta || typeof resposta !== 'object') return null;
  if (resposta.id !== undefined && resposta.id !== null) return String(resposta.id);
  const dentro = Object.values(resposta).find((v) => v && typeof v === 'object' && !Array.isArray(v) && v.id !== undefined && v.id !== null);
  return dentro ? String(dentro.id) : null;
}

// Valores curtos e de controle; qualquer coisa maior ou estruturada fica de fora.
function valorDeControle(v) {
  if (v === null || typeof v === 'boolean' || typeof v === 'number') return v;
  if (typeof v === 'string' && v.length <= 60) return v;
  return undefined;
}

/** A rota é uma das auditadas? Só método e caminho — barato, para o middleware decidir antes de embrulhar a resposta. */
function reconhece(metodo, caminho) {
  const limpo = String(caminho || '').split('?')[0].replace(/\/+$/, '') || '/';
  const m = String(metodo || '').toUpperCase();
  return COMPILADAS.some((r) => r.metodo === m && r.re.test(limpo));
}

/**
 * O que fazer com uma requisição que deu certo. `null` = não é auditada.
 * @param {string} metodo
 * @param {string} caminho   o que vem depois de /api, com ou sem query
 * @param {object} [corpo]
 * @param {object} [resposta] corpo JSON da resposta (para o id de quem foi criado)
 */
function classificar(metodo, caminho, corpo, resposta) {
  const limpo = String(caminho || '').split('?')[0].replace(/\/+$/, '') || '/';
  const m = String(metodo || '').toUpperCase();
  for (const regra of COMPILADAS) {
    if (regra.metodo !== m) continue;
    const achou = regra.re.exec(limpo);
    if (!achou) continue;

    const entrada = corpo && typeof corpo === 'object' ? corpo : {};
    const detalhe = {};
    for (const campo of regra.campos) {
      if (!(campo in entrada)) continue;
      const v = valorDeControle(entrada[campo]);
      if (v !== undefined) detalhe[campo] = v;
    }

    let acao = regra.acao;
    // Mexer na etapa do funil é o que o cliente quer achar na trilha: vira ação própria.
    if (acao === 'alterou_licitacao' && 'etapa' in detalhe) acao = 'mudou_etapa';

    // PATCH da licitação sem nenhum dos campos de controle (anotação de prazo etc.) não é auditado.
    if (regra.acao === 'alterou_licitacao' && !Object.keys(detalhe).length) return null;

    const idDaRota = achou[1] || null;
    const idCriado = idDaResposta(resposta);
    return {
      acao,
      entidade: regra.entidade,
      entidade_id: (idDaRota || idCriado || '').slice(0, 40) || null,
      detalhe: Object.keys(detalhe).length ? detalhe : null,
    };
  }
  return null;
}

// Rótulos que a tela mostra (ação interna → frase). Ação sem rótulo aparece como veio.
const ROTULOS = {
  entrou: 'Entrou no painel',
  criou_conta: 'Criou a conta',
  aceitou_termos: 'Aceitou os termos de uso',
  concluiu_assistente: 'Concluiu o assistente de primeiro acesso',
  convidou: 'Convidou alguém para a equipe',
  cancelou_convite: 'Cancelou um convite',
  mudou_papel: 'Mudou o papel de um membro',
  removeu_membro: 'Removeu um membro da equipe',
  subiu_documento: 'Subiu um documento no cofre',
  alterou_documento: 'Alterou um documento do cofre',
  removeu_documento: 'Removeu um documento do cofre',
  revisou_documento: 'Marcou um documento como revisado',
  criou_perfil_empresa: 'Criou um perfil de empresa',
  alterou_perfil_empresa: 'Alterou o perfil da empresa',
  criou_tarefa: 'Criou uma tarefa',
  alterou_tarefa: 'Alterou uma tarefa',
  removeu_tarefa: 'Removeu uma tarefa',
  mudou_etapa: 'Mudou a etapa de uma licitação',
  alterou_licitacao: 'Alterou uma licitação',
  criou_token_api: 'Criou um token de API',
  revogou_token_api: 'Revogou um token de API',
  criou_webhook: 'Criou um webhook',
  removeu_webhook: 'Removeu um webhook',
  pediu_exclusao: 'Pediu a exclusão dos dados da organização',
  cancelou_exclusao: 'Cancelou o pedido de exclusão dos dados',
  exportou_dados: 'Exportou os dados da organização',
  abriu_solicitacao: 'Abriu uma solicitação ao suporte',
};

const rotulo = (acao) => ROTULOS[acao] || acao;

const ENTIDADES = [...new Set([...REGRAS.map((r) => r[3]), 'sessao', 'conta', 'lgpd', 'suporte'])];

module.exports = { classificar, reconhece, rotulo, ROTULOS, ENTIDADES };
