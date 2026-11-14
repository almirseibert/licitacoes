// Serviços complementares por parceria (Seção 18 do PLANO_SAAS_CONLICITACAO.md).
//
// O painel encaminha o pedido do cliente a um parceiro cadastrado pela operadora. Não
// há parceiro "de fábrica": sem parceiro ativo o serviço aparece como "sem parceiro
// habilitado" e o cliente só registra interesse (nada sai do painel). Nenhuma
// afirmação aqui promete preço, prazo ou resultado — isso é do parceiro.

/** Versão do termo de vínculo. Mudou o texto de TERMO_VINCULO ou os campos enviados → sobe. */
const VERSAO_TERMO_PARCEIRO = '2026-11-14';

const SERVICOS = {
  seguro_garantia: {
    rotulo: 'Seguro garantia',
    descricao:
      'Cotação de seguro garantia (de proposta ou de execução do contrato) com corretora parceira. ' +
      'O painel só encaminha o seu pedido: não emite apólice nem faz a corretagem.',
    usaLicitacao: true,
  },
  assessoria_cadastral: {
    rotulo: 'Assessoria cadastral (CRC)',
    descricao:
      'Cadastro e renovação em órgãos e portais de compras, feitos por assessoria parceira. ' +
      'Serviço humano: o painel não acessa portal em nome da sua empresa.',
    usaLicitacao: false,
  },
  cursos: {
    rotulo: 'Cursos e capacitação',
    descricao: 'Cursos sobre licitações e compras públicas oferecidos por parceiros.',
    usaLicitacao: false,
  },
  clipping: {
    rotulo: 'Clipping',
    descricao: 'Acompanhamento de publicações oficiais por parceiro, além do que o Radar já coleta.',
    usaLicitacao: false,
  },
  bolsa_empregos: {
    rotulo: 'Bolsa de empregos',
    descricao: 'Vagas e profissionais do setor de licitações, por parceiro.',
    usaLicitacao: false,
  },
};

/** Texto que o cliente aceita antes de o painel mandar qualquer dado dele a um parceiro. */
const TERMO_VINCULO =
  'Autorizo o Painel de Licitações a enviar ao parceiro indicado os dados mostrados na prévia deste pedido, ' +
  'somente para que ele atenda a este pedido. O parceiro é o responsável pelo atendimento, ' +
  'pelo preço, pelas condições e pelo contrato — o painel não participa da contratação. ' +
  'Dado que já foi enviado fica com o parceiro: para excluí-lo, é preciso pedir também a ele.';

module.exports = { SERVICOS, VERSAO_TERMO_PARCEIRO, TERMO_VINCULO };
