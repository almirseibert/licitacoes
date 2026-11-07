// Entrada do worker de filas. No EasyPanel: npm run worker
// Mesma imagem da API, só muda o comando (seção 2.1).
const { fila: cfgFila } = require('../backend/config/ambiente');
const fila = require('../backend/servicos/fila');
const coletar = require('../backend/jobs/coletar');
const baixar = require('../backend/jobs/baixar');
const lerEdital = require('../backend/jobs/ler-edital');
const validades = require('../backend/jobs/validades');
const prazos = require('../backend/jobs/prazos');
const encerradas = require('../backend/jobs/encerradas');
const descartarVencidas = require('../backend/jobs/descartar-vencidas');
const monitorar = require('../backend/jobs/monitorar');
const estrategicas = require('../backend/jobs/estrategicas');

const sinal = { parar: false };

// Agenda interna: `coletar_fontes` a cada hora, respeitando o intervalo de cada
// fonte (seção 14). Quando a fila virar bullmq, isto passa a ser um job repetido.
const UMA_HORA = 60 * 60 * 1000;

// `coletar_encerradas` é diário, às 03h (seção 14): varredura larga, de
// madrugada, na janela de coleta preferencial da seção 5.4. O worker só guarda
// o dia da última: reiniciar o container no meio da tarde não dispara uma
// varredura fora de hora.
const HORA_DAS_ENCERRADAS = 3;
let diaDaUltimaVarreduraDeEncerradas = null;

// `varrer_estrategicas` é diário, às 05h (seção 14): roda depois da coleta de
// encerradas das 03h, porque é dela que saem as desertas que a varredura lê.
const HORA_DAS_ESTRATEGICAS = 5;
let diaDaUltimaVarreduraDeEstrategicas = null;

function hojeLocal() {
  return new Date().toLocaleDateString('en-CA'); // AAAA-MM-DD
}

async function principal() {
  coletar.registrarNaFila();
  baixar.registrarNaFila();
  lerEdital.registrarNaFila();
  validades.registrarNaFila();
  prazos.registrarNaFila();
  encerradas.registrarNaFila();
  descartarVencidas.registrarNaFila();
  monitorar.registrarNaFila();
  estrategicas.registrarNaFila();

  console.log(`Worker de licitações iniciado. Driver da fila: ${cfgFila.driver}.`);

  const agendarVarredura = async () => {
    if (sinal.parar) return;
    try {
      const resultado = await coletar.coletarFontes({});
      if (resultado.enfileiradas.length) {
        console.log(`Varredura agendada: ${resultado.enfileiradas.join(', ')}`);
      }
      if (resultado.semAdaptador.length) {
        console.log(`Fontes sem adaptador implementado (ignoradas): ${resultado.semAdaptador.join(', ')}`);
      }

      // Documentação das licitações que valem a pena (seção 14): entra atrás da
      // coleta na fila, com prioridade menor, para nunca atrasar o Radar.
      const documentos = await baixar.baixarEditais({ limite: 20 });
      if (documentos.enfileiradas) {
        console.log(`Download de documentação enfileirado para ${documentos.enfileiradas} licitações.`);
      }

      // Leitura do edital: só mexe em arquivo já baixado, nunca vai à internet.
      const leituras = await lerEdital.lerEditais({ limite: 20 });
      if (leituras.enfileiradas) {
        console.log(`Leitura de edital enfileirada para ${leituras.enfileiradas} licitações.`);
      }

      // Prazos do que decidi disputar: o aviso de 48 h e 2 h (seção 10).
      const prazo = await prazos.verificarPrazos();
      if (prazo.criados) {
        console.log(`${prazo.criados} alerta(s) de prazo criados${prazo.email && prazo.email.enviado ? ' e enviados por e-mail' : ''}.`);
      }
      await prazos.avisarPrioridadeAlta({});

      // Amostra de preço: contratações encerradas, uma vez por dia (seção 12).
      const agora = new Date();
      if (agora.getHours() >= HORA_DAS_ENCERRADAS && diaDaUltimaVarreduraDeEncerradas !== hojeLocal()) {
        diaDaUltimaVarreduraDeEncerradas = hojeLocal();
        await fila.enfileirar('coletar_encerradas', {}, { prioridade: 20, chaveUnica: `encerradas:${hojeLocal()}` });
        console.log('Coleta de encerradas enfileirada para hoje.');
      }

      // Monitor (seção 21.2): a cadência de cada licitação está gravada em
      // `monitoramentos.proxima_checagem`; aqui só se pergunta quem venceu.
      // O limite por rodada existe porque cada checagem são de duas a quatro
      // requisições ao portal, e a seção 5.4 manda andar devagar.
      const monitorado = await monitorar.monitorar({ limite: 25 });
      if (monitorado.checadas) {
        console.log(
          `Monitor: ${monitorado.checadas} licitação(ões) checadas, ${monitorado.eventos} evento(s), ` +
            `${monitorado.alertas} alerta(s), ${monitorado.encerrados} monitoramento(s) encerrados.`
        );
      }
      if (monitorado.erros.length) {
        console.log(`Monitor com erro em ${monitorado.erros.length}: ${monitorado.erros[0]}`);
      }

      // Vencidas sem análise (seção 20.4): entra no mesmo relógio de hora em
      // hora. É barato — um UPDATE filtrado — e mantém o Radar limpo sem que
      // ninguém precise descartar na mão.
      const vencidas = await descartarVencidas.descartarVencidas({});
      if (vencidas.descartadas) {
        console.log(`${vencidas.descartadas} licitação(ões) descartadas por prazo vencido sem análise.`);
      }

      // Estratégicas: desertas, fracassadas e reaberturas, uma vez por dia
      // (seção 22.3). Não vai à internet — lê o que a coleta já trouxe.
      if (agora.getHours() >= HORA_DAS_ESTRATEGICAS && diaDaUltimaVarreduraDeEstrategicas !== hojeLocal()) {
        diaDaUltimaVarreduraDeEstrategicas = hojeLocal();
        const varridas = await estrategicas.varrerEstrategicas({});
        console.log(
          `Estratégicas: ${varridas.aguardando} oportunidade(s) aguardando` +
            (varridas.reaberturas.ligadas ? `, ${varridas.reaberturas.ligadas} reabertura(s)` : '') + '.'
        );
      }

      // Validade dos documentos do cofre (seção 9.2).
      const validade = await validades.verificarValidades();
      if (validade.alertas) {
        console.log(`${validade.alertas} alerta(s) de validade criados (${validade.vencidos} documento(s) vencidos).`);
      }
    } catch (erro) {
      console.error('Falha ao agendar a varredura:', erro.message);
    }
  };

  await agendarVarredura();
  const relogio = setInterval(agendarVarredura, UMA_HORA);

  const encerrar = (nome) => {
    console.log(`\n${nome} recebido. Encerrando o worker...`);
    sinal.parar = true;
    clearInterval(relogio);
    setTimeout(() => process.exit(0), 2000);
  };
  process.on('SIGTERM', () => encerrar('SIGTERM'));
  process.on('SIGINT', () => encerrar('SIGINT'));

  await fila.processar({ sinal });
  process.exit(0);
}

principal().catch((erro) => {
  console.error('Worker parou:', erro);
  process.exit(1);
});
