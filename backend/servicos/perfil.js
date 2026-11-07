// O perfil da empresa que assina (seção 4.7).
//
// Mora num módulo próprio porque três serviços precisam dele — envio,
// declaração e proposta — e deixá-lo dentro de `envio.js` fazia `envio` e
// `proposta` se exigirem em círculo: a tela "Montar envio" oferece a proposta
// no bloco 3, e a proposta precisa saber quem assina.
const pool = require('../config/db');

/** O perfil pedido, ou o padrão. Sem perfil não há o que assinar. */
async function padrao(perfilId) {
  const [linhas] = perfilId
    ? await pool.query('SELECT * FROM empresa_perfis WHERE id = ?', [perfilId])
    : await pool.query('SELECT * FROM empresa_perfis ORDER BY padrao DESC, id ASC LIMIT 1');
  if (!linhas.length) throw new Error('Cadastre o perfil da empresa antes de montar um envio.');
  return linhas[0];
}

module.exports = { padrao };
