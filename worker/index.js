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
const recorrencias = require('../backend/jobs/recorrencias');
const iaResumos = require('../backend/jobs/ia-resumos');
const questionamentos = require('../backend/jobs/questionamentos');
const dossies = require('../backend/jobs/dossies');
const contratos = require('../backend/jobs/contratos');

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

// `detectar_recorrencias` é semanal, no domingo, e `alertas_recorrencia` é
// diário às 08h (seção 14). A detecção varre a base inteira e não muda de uma
// hora para outra; o alerta precisa sair todo dia para não perder o marco.
const HORA_DAS_RECORRENCIAS = 8;
// `prazos_questionamento` também é diário às 08h (seção 14), e `agregar_dossies`
// é mensal, no dia 1 — junto com o recálculo de preços.
let diaDoUltimoCalculoDePrazos = null;
let mesDaUltimaAgregacao = null;
let diaDoUltimoAvisoDeRecorrencia = null;
let diaDoUltimoAvisoDeContrato = null;
let semanaDaUltimaDeteccao = null;

function semanaAtual() {
  const agora = new Date();
  const inicio = new Date(agora.getFullYear(), 0, 1);
  return `${agora.getFullYear()}-${Math.floor((agora - inicio) / 604800000)}`;
}

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
  recorrencias.registrarNaFila();
  iaResumos.registrarNaFila();
  questionamentos.registrarNaFila();
  dossies.registrarNaFila();
  contratos.registrarNaFila();

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

      // Recorrências (seção 24): detecção semanal, aviso diário às 08h.
      if (agora.getDay() === 0 && semanaDaUltimaDeteccao !== semanaAtual()) {
        semanaDaUltimaDeteccao = semanaAtual();
        const detectadas = await recorrencias.detectarRecorrencias({});
        console.log(`Recorrências: ${detectadas.recorrencias} em ${detectadas.orgaos} órgãos.`);
      }
      if (agora.getHours() >= HORA_DAS_RECORRENCIAS && diaDoUltimoAvisoDeRecorrencia !== hojeLocal()) {
        diaDoUltimoAvisoDeRecorrencia = hojeLocal();
        const avisados = await recorrencias.avisarRecorrencias({});
        if (avisados.criados) console.log(`${avisados.criados} alerta(s) de recorrência criados.`);
      }

      // Prazos de esclarecimento e impugnação (seção 25), diário às 08h.
      if (agora.getHours() >= HORA_DAS_RECORRENCIAS && diaDoUltimoCalculoDePrazos !== hojeLocal()) {
        diaDoUltimoCalculoDePrazos = hojeLocal();
        const prazos = await questionamentos.rodar({});
        console.log(
          `Prazos de questionamento: ${prazos.calculados} calculados` +
            (prazos.criados ? `, ${prazos.criados} alerta(s) de último dia` : '') + '.'
        );
      }

      // Marcos de contrato (seção 28), diário às 08h. Perder prazo contratual
      // custa mais caro do que perder a licitação: o aviso sai com antecedência
      // e volta a sair enquanto o marco estiver atrasado.
      if (agora.getHours() >= HORA_DAS_RECORRENCIAS && diaDoUltimoAvisoDeContrato !== hojeLocal()) {
        diaDoUltimoAvisoDeContrato = hojeLocal();
        const marcos = await contratos.rodar({});
        if (marcos.criados || marcos.viraram_vigentes || marcos.encerrados) {
          console.log(
            `Contratos: ${marcos.criados} alerta(s) de marco` +
              (marcos.atrasados ? ` (${marcos.atrasados} atrasado(s))` : '') +
              `, ${marcos.viraram_vigentes} vigente(s), ${marcos.encerrados} encerrado(s).`
          );
        }
      }

      // Dossiês de concorrente e órgão (seções 26 e 27), mensal no dia 1.
      const mes = `${agora.getFullYear()}-${agora.getMonth() + 1}`;
      if (agora.getDate() === 1 && mesDaUltimaAgregacao !== mes) {
        mesDaUltimaAgregacao = mes;
        const agregados = await dossies.agregarDossies();
        console.log(`Dossiês: ${agregados.concorrentes} concorrente(s) e ${agregados.orgaos} órgão(s).`);
      }

      // Leitura assistida (seção 23.3): só entra na fila quem vale o token, e
      // só se a chave estiver configurada. Sem IA, isto é um no-op barato.
      const lidas = await iaResumos.enfileirarResumos({ limite: 10 });
      if (lidas.enfileiradas) {
        console.log(`Leitura assistida enfileirada para ${lidas.enfileiradas} licitações.`);
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
