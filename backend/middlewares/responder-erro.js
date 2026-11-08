// Padrão de erro da seção 13: { "erro": "mensagem em português", "detalhe": "técnico,
// só em log" }. O CLAUDE.md repete a mesma regra. Antes desta revisão, 89 respostas em
// backend/rotas/*.js mandavam `erro.message` direto no corpo JSON — inclusive na rota de
// login, que não exige token, então qualquer um recebia nome de usuário do MySQL, nome
// do banco e o texto cru do driver. Um ponto só, para não repetir o erro em 25 arquivos.
const { ambiente } = require('../config/ambiente');

/**
 * Responde um erro de rota: sempre grava o técnico no log do serviço, e só devolve
 * `detalhe` no corpo da resposta fora de produção — onde ele ajuda quem está
 * desenvolvendo e não vaza nada para quem usa o painel de verdade.
 *
 * @param {import('express').Response} res
 * @param {number} status
 * @param {string} mensagem - em português, para quem usa o painel (seção 13).
 * @param {Error} [erro] - o erro original; vai para o log sempre, para a resposta só em dev.
 * @param {string} [detalheExtra] - texto técnico adicional (ex.: a mensagem do GRANT que
 *   falta), tratado da mesma forma que `erro.message`: log sempre, resposta só fora de prod.
 */
function responderErro(res, status, mensagem, erro, detalheExtra) {
  const detalhe = detalheExtra || erro?.message || '';
  if (erro) {
    console.error(mensagem, '—', erro.code || '', detalhe);
  } else if (detalhe) {
    console.error(mensagem, '—', detalhe);
  }

  const corpo = { erro: mensagem };
  if (ambiente !== 'production' && detalhe) {
    corpo.detalhe = detalhe;
  }
  return res.status(status).json(corpo);
}

module.exports = { responderErro };
