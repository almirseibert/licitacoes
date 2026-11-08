// O funil da seção 10: oito etapas fixas, cada uma com o que pede e o que
// dispara ao entrar.
//
// A ordem importa: é a ordem das colunas do Kanban e a ordem natural da
// disputa. `pede` são os campos que a tela cobra ao soltar o card ali — é o que
// faz o histórico ter valor depois (preço, vencedor, motivo).

const descarte = require('./descarte');

const ETAPAS = [
  {
    chave: 'Triagem',
    descricao: 'Entrou pela coleta, ainda não olhei',
    cor: 'texto-suave',
    pede: [],
  },
  {
    chave: 'Analisando',
    descricao: 'Baixei o edital, estou lendo',
    cor: 'texto',
    pede: [],
    // Automação da seção 10: entrar aqui dispara o download da documentação.
    aoEntrar: 'baixar_edital',
  },
  {
    chave: 'Vou disputar',
    descricao: 'Decidi participar',
    cor: 'voltagem',
    pede: [],
    // Cria os alertas de 48 h e 2 h antes do fim das propostas.
    aoEntrar: 'alertar_prazo',
  },
  {
    chave: 'Proposta enviada',
    descricao: 'Mandei a proposta no portal',
    cor: 'voltagem',
    pede: ['proposta_em', 'valor_proposto'],
  },
  {
    chave: 'Em disputa',
    descricao: 'Sessão acontecendo',
    cor: 'atencao',
    pede: [],
    destacaLink: true,
  },
  {
    chave: 'Ganhamos',
    descricao: 'Adjudicada para a Studio Mythos',
    cor: 'ok',
    pede: ['valor_final'],
    // Abre o contrato com o checklist da seção 28.3. Ganhar é metade: a outra
    // metade tem prazos com multa, e é aqui que eles passam a ser vigiados.
    aoEntrar: 'abrir_contrato',
  },
  {
    chave: 'Perdemos',
    descricao: 'Outro venceu',
    cor: 'erro',
    pede: ['vencedor', 'valor_final'],
  },
  {
    chave: 'Descartada',
    descricao: 'Não compensa',
    cor: 'texto-suave',
    pede: ['motivo_descarte'],
  },
];

const CHAVES = ETAPAS.map((e) => e.chave);
const POR_CHAVE = new Map(ETAPAS.map((e) => [e.chave, e]));

// Os motivos de descarte moram em regras/descarte.js, na lista fechada da
// seção 20.1. Ficam reexportados aqui porque é o funil que os cobra: a etapa
// "Descartada" pede motivo, e quando for exigência ou documento, qual código
// barrou. É isso que permite, meses depois, somar e descobrir qual exigência
// mais barra a empresa — o diagnóstico da seção 20.
const MOTIVOS_DESCARTE = descarte.MOTIVOS;

// O mapa inclui `nao_analisada`, que o job grava e a tela não oferece.
const MOTIVOS_POR_CHAVE = descarte.POR_CHAVE;

/** Campos que a etapa exige preenchidos. Devolve o que faltou. */
function faltandoPara(etapa, dados = {}) {
  const definicao = POR_CHAVE.get(etapa);
  if (!definicao) return [];
  return definicao.pede.filter((campo) => {
    const valor = dados[campo];
    return valor === null || valor === undefined || valor === '';
  });
}

function existe(etapa) {
  return POR_CHAVE.has(etapa);
}

module.exports = { ETAPAS, CHAVES, POR_CHAVE, MOTIVOS_DESCARTE, MOTIVOS_POR_CHAVE, faltandoPara, existe };
