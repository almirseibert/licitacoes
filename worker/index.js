// Entrada do worker de filas. No EasyPanel: npm run worker
// Mesma imagem da API, só muda o comando (seção 2.1).
//
// Dois relógios, porque a seção 14 pede dois:
//
//   · a cada 30 min — `alertas_prazo` e `monitorar`. São os dois em que meia
//     hora importa: um prazo que vence e um edital que mudou não esperam a
//     hora cheia.
//   · a cada hora   — a coleta e tudo o que pende dela, mais os jobs diários,
//     semanais e mensais, cada um com seu horário.
//
// O worker guarda só o dia (ou o mês) da última execução de cada job com
// horário: reiniciar o container no meio da tarde não dispara uma varredura
// fora de hora, nem repete a do dia.
const { fila: cfgFila } = require('../backend/config/ambiente');
const ajustes = require('../backend/servicos/configuracoes');
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
const limpar = require('../backend/jobs/limpar');
const sancoesMensais = require('../backend/jobs/sancoes-mensais');

const sinal = { parar: false };

const MEIA_HORA = 30 * 60 * 1000;
const UMA_HORA = 60 * 60 * 1000;

// Horários da seção 14.
const HORA_DAS_ENCERRADAS = 3; // varredura larga, de madrugada (seção 5.4)
const HORA_DA_LIMPEZA = 4; // depois das encerradas, antes das estratégicas
const HORA_DAS_ESTRATEGICAS = 5; // lê o que a coleta das 03h trouxe
const HORA_DAS_VALIDADES = 7; // documento vencendo
const HORA_DOS_CONTRATOS = 7; // marco de contrato
const HORA_DOS_AVISOS = 8; // recorrência e prazo de questionamento

const ultimaVez = {
  coleta: 0, // carimbo de tempo: a coleta é de hora em hora, sem horário fixo
  encerradas: null,
  limpeza: null,
  estrategicas: null,
  validades: null,
  contratos: null,
  recorrenciaAviso: null,
  prazosQuestionamento: null,
  deteccaoSemanal: null,
  agregacaoMensal: null,
  sancoesMensais: null,
};

function hojeLocal() {
  return new Date().toLocaleDateString('en-CA'); // AAAA-MM-DD
}

function mesAtual() {
  const agora = new Date();
  return `${agora.getFullYear()}-${agora.getMonth() + 1}`;
}

function semanaAtual() {
  const agora = new Date();
  const inicio = new Date(agora.getFullYear(), 0, 1);
  return `${agora.getFullYear()}-${Math.floor((agora - inicio) / 604800000)}`;
}

/** Já passou da hora marcada e ainda não rodou hoje? */
function naHoraDiaria(nome, hora) {
  const agora = new Date();
  if (agora.getHours() < hora) return false;
  if (ultimaVez[nome] === hojeLocal()) return false;
  ultimaVez[nome] = hojeLocal();
  return true;
}

/**
 * A coleta automática só roda dentro da janela configurada na tela
 * (seção 11.13). Padrão 0–23, isto é, sempre. Janela que atravessa a
 * meia-noite (22 às 6) também vale.
 */
async function dentroDaJanelaDeColeta() {
  const inicio = await ajustes.numero('coleta_hora_inicio', 0);
  const fim = await ajustes.numero('coleta_hora_fim', 23);
  const hora = new Date().getHours();
  return inicio <= fim ? hora >= inicio && hora <= fim : hora >= inicio || hora <= fim;
}

function registrarTodos() {
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
  limpar.registrarNaFila();
  sancoesMensais.registrarNaFila();
}

// ---------------------------------------------------------------------------
// A cada 30 min (seção 14): prazo e monitor.
// ---------------------------------------------------------------------------
async function rodarFrequente() {
  if (sinal.parar) return;
  try {
    // Prazos do que decidi disputar: o aviso de 48 h e 2 h (seção 10).
    const prazo = await prazos.verificarPrazos();
    if (prazo.criados) {
      const porEmail = prazo.email && prazo.email.enviado ? ' e enviados por e-mail' : '';
      const porWhats = prazo.whatsapp && prazo.whatsapp.enviado ? ' e por WhatsApp' : '';
      console.log(`${prazo.criados} alerta(s) de prazo criados${porEmail}${porWhats}.`);
    }
    await prazos.avisarPrioridadeAlta({});

    // Monitor (seção 21.2): a cadência de cada licitação está gravada em
    // `monitoramentos.proxima_checagem`; aqui só se pergunta quem venceu. O
    // limite por rodada existe porque cada checagem são de duas a quatro
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

    // Vencidas sem análise (seção 20.4): é barato — um UPDATE filtrado — e
    // mantém o Radar limpo sem que ninguém precise descartar na mão.
    const vencidas = await descartarVencidas.descartarVencidas({});
    if (vencidas.descartadas) {
      console.log(`${vencidas.descartadas} licitação(ões) descartadas por prazo vencido sem análise.`);
    }
  } catch (erro) {
    console.error('Falha na rodada de 30 minutos:', erro.message);
  }
}

// ---------------------------------------------------------------------------
// A cada hora: a coleta e o que pende dela, mais os jobs com horário.
// ---------------------------------------------------------------------------
async function rodarDeHoraEmHora() {
  if (sinal.parar) return;
  // Tolerância de um minuto: o relógio de 30 min nunca cai no milissegundo, e
  // sem a folga a rodada horária escorregaria para 90 min.
  if (Date.now() - ultimaVez.coleta < UMA_HORA - 60000) return;
  ultimaVez.coleta = Date.now();

  try {
    if (await dentroDaJanelaDeColeta()) {
      const resultado = await coletar.coletarFontes({});
      if (resultado.enfileiradas.length) {
        console.log(`Varredura agendada: ${resultado.enfileiradas.join(', ')}`);
      }
      if (resultado.semAdaptador.length) {
        console.log(`Fontes sem adaptador implementado (ignoradas): ${resultado.semAdaptador.join(', ')}`);
      }
    } else {
      console.log('Fora da janela de coleta configurada: nada enfileirado nesta hora.');
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

    // Leitura assistida (seção 23.3): só entra na fila quem vale o token, e só
    // se a chave estiver configurada. Sem IA, isto é um no-op barato.
    const lidas = await iaResumos.enfileirarResumos({ limite: 10 });
    if (lidas.enfileiradas) {
      console.log(`Leitura assistida enfileirada para ${lidas.enfileiradas} licitações.`);
    }

    // Amostra de preço: contratações encerradas, uma vez por dia (seção 12).
    if (naHoraDiaria('encerradas', HORA_DAS_ENCERRADAS)) {
      await fila.enfileirar('coletar_encerradas', {}, { prioridade: 20, chaveUnica: `encerradas:${hojeLocal()}` });
      console.log('Coleta de encerradas enfileirada para hoje.');
    }

    // Higiene do volume (seção 14): `.tmp` velho e documentação de licitação
    // descartada há mais de 180 dias.
    if (naHoraDiaria('limpeza', HORA_DA_LIMPEZA)) {
      const limpeza = await limpar.rodar();
      const mb = Math.round((limpeza.temporarios.bytes + limpeza.descartadas.bytes) / 1048576);
      if (limpeza.temporarios.apagados || limpeza.descartadas.arquivos) {
        console.log(
          `Limpeza: ${limpeza.temporarios.apagados} temporário(s), ` +
            `${limpeza.descartadas.arquivos} arquivo(s) de ${limpeza.descartadas.licitacoes} descartada(s), ` +
            `${mb} MB livres.`
        );
      }
      for (const erro of [...limpeza.temporarios.erros, ...limpeza.descartadas.erros].slice(0, 3)) {
        console.log(`Limpeza com erro: ${erro}`);
      }
    }

    // Estratégicas: desertas, fracassadas e reaberturas, uma vez por dia
    // (seção 22.3). Não vai à internet — lê o que a coleta já trouxe.
    if (naHoraDiaria('estrategicas', HORA_DAS_ESTRATEGICAS)) {
      const varridas = await estrategicas.varrerEstrategicas({});
      console.log(
        `Estratégicas: ${varridas.aguardando} oportunidade(s) aguardando` +
          (varridas.reaberturas.ligadas ? `, ${varridas.reaberturas.ligadas} reabertura(s)` : '') + '.'
      );
    }

    // Validade dos documentos do cofre (seção 9.2), diário às 07h.
    if (naHoraDiaria('validades', HORA_DAS_VALIDADES)) {
      const validade = await validades.verificarValidades();
      if (validade.alertas) {
        console.log(`${validade.alertas} alerta(s) de validade criados (${validade.vencidos} documento(s) vencidos).`);
      }
    }

    // Marcos de contrato (seção 28), diário às 07h. Perder prazo contratual
    // custa mais caro do que perder a licitação: o aviso sai com antecedência
    // e volta a sair enquanto o marco estiver atrasado.
    if (naHoraDiaria('contratos', HORA_DOS_CONTRATOS)) {
      const marcos = await contratos.rodar({});
      if (marcos.criados || marcos.viraram_vigentes || marcos.encerrados) {
        console.log(
          `Contratos: ${marcos.criados} alerta(s) de marco` +
            (marcos.atrasados ? ` (${marcos.atrasados} atrasado(s))` : '') +
            `, ${marcos.viraram_vigentes} vigente(s), ${marcos.encerrados} encerrado(s).`
        );
      }
    }

    // Recorrências (seção 24): detecção semanal no domingo, aviso diário às 08h.
    const agora = new Date();
    if (agora.getDay() === 0 && ultimaVez.deteccaoSemanal !== semanaAtual()) {
      ultimaVez.deteccaoSemanal = semanaAtual();
      const detectadas = await recorrencias.detectarRecorrencias({});
      console.log(`Recorrências: ${detectadas.recorrencias} em ${detectadas.orgaos} órgãos.`);
    }
    if (naHoraDiaria('recorrenciaAviso', HORA_DOS_AVISOS)) {
      const avisados = await recorrencias.avisarRecorrencias({});
      if (avisados.criados) console.log(`${avisados.criados} alerta(s) de recorrência criados.`);
    }

    // Prazos de esclarecimento e impugnação (seção 25), diário às 08h.
    if (naHoraDiaria('prazosQuestionamento', HORA_DOS_AVISOS)) {
      const calculados = await questionamentos.rodar({});
      console.log(
        `Prazos de questionamento: ${calculados.calculados} calculados` +
          (calculados.criados ? `, ${calculados.criados} alerta(s) de último dia` : '') + '.'
      );
    }

    // Dossiês de concorrente e órgão (seções 26 e 27), mensal no dia 1.
    if (agora.getDate() === 1 && ultimaVez.agregacaoMensal !== mesAtual()) {
      ultimaVez.agregacaoMensal = mesAtual();
      const agregados = await dossies.agregarDossies();
      console.log(`Dossiês: ${agregados.concorrentes} concorrente(s) e ${agregados.orgaos} órgão(s).`);
    }

    // CEIS/CNEP do próprio CNPJ e dos concorrentes recorrentes (seção 26.3),
    // mensal no dia 1, depois da agregação — é dela que sai quem é recorrente.
    if (agora.getDate() === 1 && ultimaVez.sancoesMensais !== mesAtual()) {
      ultimaVez.sancoesMensais = mesAtual();
      const checadas = await sancoesMensais.rodar({});
      if (!checadas.ligado) {
        console.log(`Sanções: desligado (${checadas.motivo}).`);
      } else {
        console.log(
          `Sanções: ${checadas.consultados} consulta(s)` +
            (checadas.sancionados.length
              ? `, com registro: ${checadas.sancionados.join(', ')}`
              : ', nenhum registro') + '.'
        );
      }
    }
  } catch (erro) {
    console.error('Falha na rodada de hora em hora:', erro.message);
  }
}

async function principal() {
  registrarTodos();
  console.log(`Worker de licitações iniciado. Driver da fila: ${cfgFila.driver}.`);

  await rodarDeHoraEmHora();
  await rodarFrequente();

  // Um relógio só, de 30 min: a rodada horária se controla pelo próprio carimbo
  // de tempo. Dois `setInterval` desalinhados fariam as duas rodadas caírem
  // juntas de vez em quando, e aí o monitor brigaria com a coleta pelas quatro
  // vagas de requisição da seção 5.4.
  const relogio = setInterval(async () => {
    await rodarFrequente();
    await rodarDeHoraEmHora();
  }, MEIA_HORA);

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
