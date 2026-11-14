// O perfil da empresa que assina (seção 4.7).
//
// Mora num módulo próprio porque três serviços precisam dele — envio,
// declaração e proposta — e deixá-lo dentro de `envio.js` fazia `envio` e
// `proposta` se exigirem em círculo: a tela "Montar envio" oferece a proposta
// no bloco 3, e a proposta precisa saber quem assina.
const pool = require('../config/db');

/** O perfil pedido, ou o padrão. Sem perfil não há o que assinar. */
async function padrao(organizacaoId, perfilId) {
  const [linhas] = perfilId
    ? await pool.query('SELECT * FROM empresa_perfis WHERE id = ? AND organizacao_id = ?', [perfilId, organizacaoId])
    : await pool.query('SELECT * FROM empresa_perfis WHERE organizacao_id = ? ORDER BY padrao DESC, id ASC LIMIT 1', [
        organizacaoId,
      ]);
  if (!linhas.length) throw new Error('Cadastre o perfil da empresa antes de montar um envio.');
  return linhas[0];
}

/**
 * O CNPJ da empresa, só dígitos, ou null quando o perfil ainda não o tem.
 *
 * É por ele que o monitor decide se ganhamos ou perdemos (seção 21.3). Null
 * não é detalhe: sem CNPJ o painel não tem como comparar com o vencedor, e
 * prefere deixar o card parado a chutar.
 */
async function cnpjDaEmpresa(organizacaoId, perfilId) {
  const perfil = await padrao(organizacaoId, perfilId).catch(() => null);
  const digitos = String((perfil && perfil.cnpj) || '').replace(/\D/g, '');
  return digitos.length === 14 ? digitos : null;
}

module.exports = { padrao, cnpjDaEmpresa };
