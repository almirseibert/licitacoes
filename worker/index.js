// Entrada do worker de filas. No EasyPanel: npm run worker
// Mesma imagem da API, só muda o comando (seção 2.1).
const { fila: cfgFila } = require('../backend/config/ambiente');
const fila = require('../backend/servicos/fila');
const coletar = require('../backend/jobs/coletar');
const baixar = require('../backend/jobs/baixar');

const sinal = { parar: false };

// Agenda interna: `coletar_fontes` a cada hora, respeitando o intervalo de cada
// fonte (seção 14). Quando a fila virar bullmq, isto passa a ser um job repetido.
const UMA_HORA = 60 * 60 * 1000;

async function principal() {
  coletar.registrarNaFila();
  baixar.registrarNaFila();

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
