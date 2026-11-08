// Testes do cliente HTTP (seção 5.4) — a conduta da coleta.
//
// Estes dois testes existem porque os dois defeitos que eles cobrem estavam no
// código e passaram por toda a revisão: o semáforo deixava passar mais que
// HTTP_CONCORRENCIA requisições, e o intervalo por domínio não valia quando
// duas chamadas saíam juntas. Nenhum dos dois quebra nada visível — só faz o
// painel bater mais rápido do que prometeu no portal de terceiro, que é
// exatamente o que a seção 5.4 proíbe.
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { http: cfg } = require('../backend/config/ambiente');
const { internos } = require('../backend/servicos/http');

test('o semáforo nunca concede mais vagas que HTTP_CONCORRENCIA', async () => {
  const teto = cfg.concorrencia;
  let simultaneas = 0;
  let pico = 0;

  // Mais pedidos que o teto, todos ao mesmo tempo — o cenário em que o defeito
  // aparecia: o recém-chegado passava na frente de quem esperava e os dois
  // contavam como um.
  const tarefas = [];
  for (let i = 0; i < teto * 3; i += 1) {
    tarefas.push(
      (async () => {
        await internos.obterVaga();
        simultaneas += 1;
        pico = Math.max(pico, simultaneas);
        // Devolve a vaga só depois de um tique do laço de eventos, para que as
        // outras tenham chance de entrar junto se o semáforo permitir.
        await new Promise((r) => setImmediate(r));
        simultaneas -= 1;
        internos.liberarVaga();
      })()
    );
  }

  await Promise.all(tarefas);

  assert.ok(pico <= teto, `pico de ${pico} requisições simultâneas, teto é ${teto}`);
  assert.equal(internos.emVoo(), 0, 'sobrou vaga concedida depois de todas devolvidas');
});

test('duas chamadas ao mesmo domínio ficam a HTTP_INTERVALO_DOMINIO_MS de distância', async () => {
  const dominio = `teste-${Date.now()}.exemplo`;
  internos.ultimoAcesso.delete(dominio);

  const inicio = Date.now();
  // Juntas de propósito: antes da correção as duas liam o mesmo "último acesso",
  // dormiam o mesmo tanto e saíam no mesmo instante.
  await Promise.all([internos.respeitarIntervalo(dominio), internos.respeitarIntervalo(dominio)]);
  const decorrido = Date.now() - inicio;

  // Folga de 100 ms para o relógio do laço de eventos.
  assert.ok(
    decorrido >= cfg.intervaloDominioMs - 100,
    `as duas saíram em ${decorrido} ms; o intervalo mínimo é ${cfg.intervaloDominioMs} ms`
  );
});

test('domínios diferentes não esperam um pelo outro', async () => {
  const inicio = Date.now();
  await Promise.all([
    internos.respeitarIntervalo(`a-${Date.now()}.exemplo`),
    internos.respeitarIntervalo(`b-${Date.now()}.exemplo`),
  ]);
  assert.ok(Date.now() - inicio < 200, 'a primeira visita a um domínio não deve esperar');
});
