// Exclusão e exportação de dados sob pedido — LGPD (Seção 17 do PLANO_SAAS_CONLICITACAO.md).
// As decisões que erram calado, sem banco: quem pode pedir, o que confirma o
// pedido, quando a exclusão vence e o que nunca sai na exportação.

// Quem pede a exclusão é o dono. Há carência: tempo de se arrepender (ou de o
// dono perceber que um colega pediu). Passada a carência, o worker executa.
const DIAS_DE_CARENCIA = 7;

const path = require('path');
const { ehOperadora } = require('../servicos/escopo');

// Colunas que nunca saem na exportação: senha, segredo de integração, hash de token,
// chave de push. São credenciais, não dado do cliente — e exportá-las seria um
// vazamento disfarçado de transparência. Por ser regra por nome, a exportação lista
// no aviso as colunas que omitiu: quem lê vê o que ficou de fora, e uma coluna de
// dado legítimo que case por engano aparece ali em vez de sumir calada.
const COLUNA_SECRETA = /(senha|segredo|secret|token_hash|^token$|api_?key|p256dh|^chave_auth$|_hash$)/i;

// Tabelas por organização que ficam fora da exportação: só credenciais. A trilha
// de auditoria entra, porque é dado sobre as pessoas da equipe.
const TABELAS_FORA_DA_EXPORTACAO = new Set(['tokens_api', 'notificacoes_push']);

// Teto de linhas por tabela na exportação (a resposta é montada em memória).
const LINHAS_POR_TABELA = 50000;

const normalizar = (t) =>
  String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** O dono digitou o nome da organização igual (sem ligar para caixa, acento e espaços)? */
function confirmacaoConfere(nomeOrganizacao, digitado) {
  const alvo = normalizar(nomeOrganizacao);
  return Boolean(alvo) && alvo === normalizar(digitado);
}

function dataDaExclusao(pedidaEm = new Date()) {
  return new Date(new Date(pedidaEm).getTime() + DIAS_DE_CARENCIA * 86400000);
}

/**
 * Pode pedir a exclusão? `{ papel, organizacaoId, cobrancaRecorrente }` vêm do
 * banco. Só a cobrança recorrente num gateway barra: apagar a organização sem
 * cancelá-la deixaria o gateway cobrando uma conta que não existe. Plano pago por
 * ativação manual (Pix, boleto) não barra — o direito de apagar não pode depender
 * de a operadora ter cancelado nada, e aqui não há o que cancelar.
 */
function podePedirExclusao({ papel, organizacaoId, cobrancaRecorrente }) {
  if (papel !== 'dono') return { ok: false, motivo: 'Só o dono da organização pode pedir a exclusão dos dados.' };
  if (ehOperadora(organizacaoId)) {
    return { ok: false, motivo: 'A organização da operadora do painel não pode ser excluída por aqui.' };
  }
  if (cobrancaRecorrente) {
    return { ok: false, motivo: 'Há uma cobrança recorrente no gateway de pagamento. Abra uma solicitação ao suporte pedindo o cancelamento e a exclusão.' };
  }
  return { ok: true };
}

/** Tira de uma linha as colunas secretas (a exportação e o teste usam a mesma regra). */
function semSegredos(linha, omitidas = null) {
  const saida = {};
  for (const [chave, valor] of Object.entries(linha || {})) {
    if (COLUNA_SECRETA.test(chave)) {
      if (omitidas) omitidas.add(chave);
    } else {
      saida[chave] = valor;
    }
  }
  return saida;
}

/**
 * O arquivo é da organização? Só se estiver DENTRO de `org/<id>/` — o cofre, os
 * anexos, as propostas e os pacotes gravam todos aí. Qualquer outro caminho (a raiz
 * do volume, a pasta de outra organização, os editais compartilhados do catálogo)
 * não se apaga por causa da exclusão desta, mesmo que uma linha do banco aponte para
 * lá. Devolve o caminho relativo normalizado, ou `null`.
 */
function arquivoDaOrganizacao(relativo, organizacaoId) {
  if (!relativo) return null;
  const pasta = path.posix.join('org', String(Number(organizacaoId)));
  const alvo = path.posix.normalize(String(relativo).replace(/\\/g, '/'));
  return alvo.startsWith(`${pasta}/`) && alvo.length > pasta.length + 1 ? alvo : null;
}

/** Já passou a carência? */
const vencida = (agendadaEm, agora = new Date()) => Boolean(agendadaEm) && new Date(agendadaEm).getTime() <= new Date(agora).getTime();

module.exports = {
  DIAS_DE_CARENCIA, COLUNA_SECRETA, TABELAS_FORA_DA_EXPORTACAO, LINHAS_POR_TABELA,
  confirmacaoConfere, dataDaExclusao, podePedirExclusao, semSegredos, arquivoDaOrganizacao, vencida,
};
