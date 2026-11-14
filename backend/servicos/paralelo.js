// Trabalho em paralelo com teto (usado pela entrega de webhooks, Seção 14b, e pelo aviso aos
// interessados em serviço, Seção 18b): um destino lento não segura os outros, e o teto evita
// abrir centenas de conexões ao mesmo tempo.

/** Roda `fn(item, posição)` com no máximo `limite` ao mesmo tempo; espera todos. `fn` não deve lançar. */
async function emParalelo(itens, limite, fn) {
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < itens.length) {
      const i = proximo;
      proximo += 1;
      await fn(itens[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
}

module.exports = { emParalelo };
