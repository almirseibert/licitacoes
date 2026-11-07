// Motivos de descarte e o que cada bloqueio custa para resolver (seção 20).
//
// A lista é fechada de propósito. Campo de texto livre aqui produz, em seis
// meses, trinta grafias de "atestado" e nenhuma soma possível — e o valor desta
// tabela está justamente em somar: é ela que diz à empresa o que resolver
// primeiro.

/**
 * Os dez motivos da seção 20.1, na ordem em que a tela de descarte os oferece.
 *
 * `pedeCodigo` marca os dois que, sozinhos, não dizem nada: saber que uma
 * exigência barrou não ajuda se não se sabe qual. Nesses casos o painel cobra o
 * código do catálogo da seção 8.2, e é esse campo que faz o diagnóstico existir.
 */
const MOTIVOS = [
  { chave: 'valor_baixo', rotulo: 'Valor não compensa o esforço' },
  { chave: 'valor_alto', rotulo: 'Valor grande demais para a empresa entregar' },
  { chave: 'exigencia_impossivel', rotulo: 'Exigência que não atendo', pedeCodigo: true },
  { chave: 'documento_faltando', rotulo: 'Documento que eu não tenho', pedeCodigo: true },
  { chave: 'prazo_curto', rotulo: 'Prazo curto demais para montar' },
  { chave: 'fora_do_escopo', rotulo: 'Objeto fora do que a empresa faz' },
  { chave: 'exige_presenca', rotulo: 'Exige presença física (visita ou entrega)' },
  { chave: 'concorrencia_alta', rotulo: 'Concorrência pesada demais' },
  { chave: 'margem_insuficiente', rotulo: 'Margem insuficiente no preço estimado' },
  { chave: 'outro', rotulo: 'Outro motivo' },
];

/**
 * O motivo da seção 20.4: prazo venceu sem ninguém olhar. Não é escolha do
 * usuário — é o job que grava — então fica fora da lista oferecida na tela, mas
 * é motivo válido no banco.
 *
 * Ele não entra no ranking de bloqueios (não barrou nada: ninguém chegou a
 * analisar), e aparece à parte, porque conta outra história: volume demais
 * chegando, ou corte mal calibrado.
 */
const NAO_ANALISADA = { chave: 'nao_analisada', rotulo: 'Prazo venceu sem análise', automatico: true };

const TODOS = [...MOTIVOS, NAO_ANALISADA];
const POR_CHAVE = new Map(TODOS.map((m) => [m.chave, m]));

/**
 * A tabela da seção 20.3: ao lado do número, o que fazer e quanto custa. Sem
 * isto o ranking é só uma lamentação; com isto, é uma lista de compras.
 *
 * A chave é o código do catálogo da seção 8.2 quando o bloqueio é documental, e
 * a chave do motivo quando o bloqueio é da licitação, não da empresa.
 */
const COMO_RESOLVER = {
  atestado: {
    resolver: 'Fechar um contrato pequeno (inclusive por dispensa) e pedir o atestado ao final',
    custo: 'baixo',
    nota: 'Só tempo — e o primeiro atestado destrava todos os próximos.',
  },
  objeto_social: {
    resolver: 'Incluir o CNAE na próxima alteração contratual',
    custo: 'baixo',
    nota: 'Pontual: sai junto de qualquer outra alteração.',
  },
  conselho: {
    resolver: 'Depende do conselho; às vezes resolve com parceria ou profissional contratado',
    custo: 'alto',
  },
  profissional: {
    resolver: 'Contratar ou credenciar o profissional habilitado no quadro',
    custo: 'alto',
  },
  pl_minimo: {
    resolver: 'Aumento de capital em alteração contratual',
    custo: 'medio',
  },
  balanco: {
    resolver: 'Fechar o balanço com o contador e registrá-lo',
    custo: 'baixo',
    nota: 'Obrigação que já existe: o custo é de prazo, não de dinheiro.',
  },
  indices: {
    resolver: 'Depende do balanço: índice ruim se corrige com capital ou com redução de passivo',
    custo: 'medio',
  },
  garantia_proposta: {
    resolver: 'Seguro-garantia ou carta de fiança, em vez de caução em dinheiro',
    custo: 'baixo',
    nota: 'Baixo por licitação — não imobiliza caixa.',
  },
  garantia_contrato: {
    resolver: 'Seguro-garantia ou carta de fiança, em vez de caução em dinheiro',
    custo: 'baixo',
  },
  visita: { resolver: 'Parceria local ou recusar a região', custo: 'variavel' },
  amostra_poc: { resolver: 'Produzir a amostra; vale quando o valor em jogo paga a produção', custo: 'medio' },
  sicaf_crc: { resolver: 'Cadastro no SICAF — gratuito, só trabalho de reunir documento', custo: 'baixo' },
  alvara: { resolver: 'Alvará na prefeitura da sede', custo: 'baixo' },
  anatel: { resolver: 'Homologação é do fabricante: exigir dele a documentação', custo: 'baixo' },
  inpi_abes: { resolver: 'Registro do software no INPI ou na ABES', custo: 'medio' },
  fabricante: { resolver: 'Pedir carta ao fabricante ou distribuidor', custo: 'baixo' },
  assinatura_digital: { resolver: 'Certificado digital e-CNPJ A1', custo: 'baixo' },

  // Bloqueios que não são da empresa: nada a comprar, só a decidir onde não ir.
  exige_presenca: { resolver: 'Parceria local ou recusar a região', custo: 'variavel' },
  prazo_curto: {
    resolver: 'Não há o que comprar: é olhar o radar mais cedo',
    custo: 'nenhum',
    nota: 'Prazo curto que repete significa coleta chegando tarde, não edital apertado.',
  },
  concorrencia_alta: { resolver: 'Escolher outros nichos ou disputar preço com custo menor', custo: 'variavel' },
  valor_baixo: { resolver: 'Subir o corte de valor na pontuação para não ver mais essas', custo: 'nenhum' },
  valor_alto: { resolver: 'Consórcio ou subcontratação, quando o edital permitir', custo: 'variavel' },
  fora_do_escopo: {
    resolver: 'Ajustar palavras-chave: objeto fora do escopo que repete é filtro mal calibrado',
    custo: 'nenhum',
  },
  margem_insuficiente: { resolver: 'Rever custo de aquisição ou abandonar a família de itens', custo: 'variavel' },
  outro: { resolver: null, custo: 'desconhecido' },
};

const CUSTOS = {
  baixo: 'Baixo',
  medio: 'Médio',
  alto: 'Alto',
  variavel: 'Variável',
  nenhum: 'Nenhum',
  desconhecido: 'Não sei',
};

function existe(chave) {
  return POR_CHAVE.has(chave);
}

/**
 * Motivo que a tela pode oferecer. `nao_analisada` é válido no banco e não
 * aqui: quem grava aquele é o job da seção 20.4, nunca o usuário.
 */
function ofertado(chave) {
  return MOTIVOS.some((m) => m.chave === chave);
}

function pedeCodigo(chave) {
  const motivo = POR_CHAVE.get(chave);
  return Boolean(motivo && motivo.pedeCodigo);
}

module.exports = { MOTIVOS, NAO_ANALISADA, TODOS, POR_CHAVE, COMO_RESOLVER, CUSTOS, existe, ofertado, pedeCodigo };
