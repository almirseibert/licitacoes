// Base jurídica do Consultor jurídico e da biblioteca "Jurídico Fácil" (Seção 16 do
// PLANO_SAAS_CONLICITACAO.md).
//
// CONTEÚDO NOSSO: cada resumo abaixo foi escrito para este painel, em linguagem de quem
// vai licitar — não é transcrição da lei. É MINUTA, SEM REVISÃO DE ADVOGADO: o revisor
// ainda não foi definido. Enquanto isso, a API devolve `revisado_por_advogado: false` e a
// tela mostra o aviso. Para publicar de verdade, quem revisar:
//   1. confere e corrige este arquivo (artigos, prazos, valores) e sobe `VERSAO_BASE`;
//   2. preenche JURIDICO_REVISOR_NOME, JURIDICO_REVISOR_OAB e JURIDICO_REVISADO_EM (AAAA-MM-DD)
//      no ambiente e põe JURIDICO_REVISADO=true — só com os quatro a base conta como revisada.
// Número de artigo em que a redação não foi conferida vem como faixa ("arts. 96 a 102") em vez de
// inciso — nada de inciso inventado. Valores em reais mudam por decreto: o texto manda conferir.
//
// Forma de cada artigo: `id` estável (é o que o chat cita), `lei`, `artigo` (rótulo), `titulo`,
// `tema`, `texto` (o resumo, é DAQUI que o modelo cita) e `termos` (palavras que o cliente usa
// e a lei não, para a busca achar).

const VERSAO_BASE = '2026-11-14';
const LEI = 'Lei 14.133/2021';
const LC = 'Lei Complementar 123/2006';

const TEMAS = {
  principios: 'Princípios e regras gerais',
  modalidades: 'Modalidades e fases',
  prazos: 'Prazos',
  proposta: 'Proposta e julgamento',
  habilitacao: 'Habilitação',
  me_epp: 'ME e EPP',
  recursos: 'Impugnação e recursos',
  contrato: 'Contrato',
  garantia: 'Garantias',
  pagamento: 'Pagamento e reequilíbrio',
  sancoes: 'Sanções',
  direta: 'Contratação direta',
  registro: 'Registro de preços',
};

const ARTIGOS = [
  // ----------------------------------------------------------- princípios
  {
    id: 'lei-art-5', lei: LEI, artigo: 'art. 5º', tema: 'principios', titulo: 'Princípios da licitação',
    texto: 'A licitação segue princípios como legalidade, impessoalidade, moralidade, publicidade, eficiência, igualdade entre os licitantes, planejamento, transparência, vinculação ao edital, julgamento objetivo, competitividade, proporcionalidade, razoabilidade, segurança jurídica e economicidade. Na prática: o órgão não pode favorecer ninguém e tem de cumprir o que o próprio edital estabeleceu.',
    termos: ['principio', 'vinculacao ao edital', 'igualdade', 'julgamento objetivo', 'isonomia'],
  },
  {
    id: 'lei-art-6', lei: LEI, artigo: 'art. 6º', tema: 'principios', titulo: 'Definições da lei',
    texto: 'O artigo 6º define os termos usados na lei: bens e serviços comuns (os que o mercado descreve por padrões objetivos), termo de referência, estudo técnico preliminar, pregão, concorrência, concurso, leilão, diálogo competitivo, agente de contratação, entre outros. Serve para saber se o objeto é "comum" (pregão) ou não.',
    termos: ['definicao', 'bem comum', 'servico comum', 'termo de referencia', 'estudo tecnico preliminar', 'etp'],
  },
  {
    id: 'lei-art-8', lei: LEI, artigo: 'art. 8º', tema: 'principios', titulo: 'Agente de contratação e pregoeiro',
    texto: 'A licitação é conduzida por um agente de contratação, servidor designado pela autoridade competente, que decide, acompanha o processo e dá andamento até a homologação. Na modalidade pregão, quem conduz o certame é o pregoeiro.',
    termos: ['pregoeiro', 'agente de contratacao', 'quem conduz'],
  },
  {
    id: 'lei-art-12', lei: LEI, artigo: 'art. 12, III', tema: 'principios', titulo: 'Falha apenas formal não elimina o licitante',
    texto: 'O desatendimento de exigência meramente formal, que não comprometa a verificação da qualificação do licitante nem a compreensão da proposta, não pode levar ao afastamento da licitação nem à invalidação do processo. Um erro de forma sanável não deveria desclassificar quem cumpre o fundo.',
    termos: ['formalismo', 'erro formal', 'vicio sanavel', 'desclassificar por detalhe', 'exigencia formal'],
  },
  {
    id: 'lei-art-14', lei: LEI, artigo: 'art. 14', tema: 'principios', titulo: 'Quem não pode participar',
    texto: 'O artigo 14 lista quem fica impedido de disputar a licitação, como o autor do projeto básico ou executivo da própria contratação, empresa que tenha ligação com ele, e quem foi condenado por trabalho infantil ou trabalho análogo ao de escravo nos anos anteriores ao edital. Confira o artigo inteiro antes de assinar a declaração de inexistência de impedimento.',
    termos: ['impedido', 'vedado participar', 'impedimento', 'declaracao de impedimento', 'conflito de interesse'],
  },
  {
    id: 'lei-art-183', lei: LEI, artigo: 'art. 183', tema: 'prazos', titulo: 'Prazos em dias úteis',
    texto: 'Os prazos em dias, na lei, contam-se em dias úteis: exclui-se o dia do começo e inclui-se o do vencimento. Isso vale para impugnação, recurso, contrarrazões e os prazos mínimos de publicação do edital.',
    termos: ['dia util', 'dias uteis', 'contagem de prazo', 'como contar prazo', 'prazo em dias'],
  },

  // ----------------------------------------------- modalidades e fases
  {
    id: 'lei-art-17', lei: LEI, artigo: 'art. 17', tema: 'modalidades', titulo: 'Fases da licitação',
    texto: 'O processo tem sete fases em ordem: preparatória, divulgação do edital, apresentação de propostas e lances, julgamento, habilitação, recursal e homologação. A habilitação pode vir antes das propostas e dos lances, mas só por decisão motivada do órgão, explicando as vantagens, e precisa constar do edital.',
    termos: ['fases', 'inversao de fases', 'habilitacao antes', 'etapas da licitacao', 'homologacao', 'ordem das fases'],
  },
  {
    id: 'lei-art-18', lei: LEI, artigo: 'art. 18', tema: 'modalidades', titulo: 'Fase preparatória',
    texto: 'A fase preparatória do órgão reúne o planejamento: estudo técnico preliminar, termo de referência, pesquisa de preços, matriz de riscos, orçamento e parecer jurídico. Falha grave de planejamento é um dos motivos que justificam esclarecimento ou impugnação do edital.',
    termos: ['planejamento', 'estudo tecnico', 'etp', 'termo de referencia', 'pesquisa de precos', 'matriz de riscos'],
  },
  {
    id: 'lei-art-24', lei: LEI, artigo: 'art. 24', tema: 'proposta', titulo: 'Orçamento estimado sigiloso',
    texto: 'O órgão pode manter o valor estimado da contratação em sigilo até a abertura das propostas, com justificativa. Quando o sigilo é adotado, o valor deve ficar disponível aos órgãos de controle. O sigilo não impede de questionar o edital sobre outros pontos.',
    termos: ['orcamento sigiloso', 'valor estimado', 'sigilo do orcamento', 'preco de referencia sigiloso'],
  },
  {
    id: 'lei-art-25', lei: LEI, artigo: 'art. 25', tema: 'modalidades', titulo: 'O que o edital deve conter',
    texto: 'O edital precisa trazer o objeto e as regras de convocação, julgamento, habilitação, recursos, penalidades, fiscalização e gestão do contrato, entrega do objeto e condições de pagamento. Quando o contrato exige reajuste, deve prever o índice. Ponto que o edital não traz pode ser pedido em esclarecimento.',
    termos: ['conteudo do edital', 'o que o edital precisa ter', 'edital omisso', 'edital sem'],
  },
  {
    id: 'lei-art-28', lei: LEI, artigo: 'art. 28', tema: 'modalidades', titulo: 'Modalidades de licitação',
    texto: 'As modalidades são cinco: pregão, concorrência, concurso, leilão e diálogo competitivo. É proibido criar modalidade nova ou combinar as existentes.',
    termos: ['modalidade', 'tipos de licitacao', 'pregao', 'concorrencia', 'leilao', 'concurso', 'dialogo competitivo'],
  },
  {
    id: 'lei-art-29', lei: LEI, artigo: 'art. 29', tema: 'modalidades', titulo: 'Pregão e concorrência',
    texto: 'Pregão e concorrência seguem o mesmo rito comum. O pregão é obrigatório para bens e serviços comuns e não serve para serviços técnicos especializados de natureza predominantemente intelectual nem para obras e serviços de engenharia, salvo os serviços comuns de engenharia.',
    termos: ['pregao', 'concorrencia', 'quando usar pregao', 'servico de engenharia', 'obra', 'diferenca pregao concorrencia'],
  },
  {
    id: 'lei-art-33', lei: LEI, artigo: 'art. 33', tema: 'proposta', titulo: 'Critérios de julgamento',
    texto: 'O vencedor é escolhido por um destes critérios: menor preço, maior desconto, melhor técnica ou conteúdo artístico, técnica e preço, maior lance (no leilão) ou maior retorno econômico. O critério vem no edital e não muda depois.',
    termos: ['criterio de julgamento', 'menor preco', 'maior desconto', 'tecnica e preco', 'como se escolhe o vencedor'],
  },
  {
    id: 'lei-art-41', lei: LEI, artigo: 'art. 41', tema: 'proposta', titulo: 'Marca, amostra e especificação',
    texto: 'Em regra o edital não deve indicar marca ou modelo. A indicação só é aceita com justificativa formal (padronização, compatibilidade, única capaz de atender ou marca como referência); no último caso o texto precisa trazer "ou equivalente", "ou similar" ou "de melhor qualidade". O órgão pode pedir amostra, em regra do licitante provisoriamente classificado em primeiro lugar.',
    termos: ['marca', 'direcionamento', 'amostra', 'modelo especifico', 'ou similar', 'ou equivalente', 'edital dirigido', 'exigir marca'],
  },
  {
    id: 'lei-art-54', lei: LEI, artigo: 'art. 54', tema: 'prazos', titulo: 'Publicidade do edital no PNCP',
    texto: 'O edital e seus anexos são publicados no inteiro teor no Portal Nacional de Contratações Públicas (PNCP). Pode haver divulgação em diário oficial e outros meios, mas a referência é o PNCP.',
    termos: ['pncp', 'onde o edital e publicado', 'publicacao', 'portal nacional'],
  },
  {
    id: 'lei-art-55', lei: LEI, artigo: 'art. 55', tema: 'prazos', titulo: 'Prazo mínimo entre a publicação e a abertura',
    texto: 'Entre a divulgação do edital e a abertura das propostas há um prazo mínimo, em dias úteis. Bens: 8 dias úteis quando o critério é menor preço ou maior desconto e 15 nos demais casos. Serviços comuns e obras e serviços comuns de engenharia: 10 dias úteis. Serviços e obras especiais: 25 dias úteis (especiais de engenharia incluídos). Contratação integrada: 60 dias úteis. Diálogo competitivo: 35 dias úteis. Confira as faixas completas no artigo; edital com prazo menor é motivo de impugnação.',
    termos: ['prazo minimo', 'prazo do edital', 'publicacao ate abertura', 'prazo para propostas', '8 dias uteis', '10 dias uteis', 'edital com prazo curto'],
  },
  {
    id: 'lei-art-56', lei: LEI, artigo: 'art. 56', tema: 'proposta', titulo: 'Modos de disputa',
    texto: 'A disputa pode ser aberta (lances públicos e sucessivos, crescentes ou decrescentes) ou fechada (propostas sigilosas até a data da abertura). O edital pode combinar os dois modos. O intervalo mínimo entre lances, quando existe, também vem no edital.',
    termos: ['lance', 'modo de disputa', 'disputa aberta', 'disputa fechada', 'intervalo minimo entre lances', 'lances'],
  },
  {
    id: 'lei-art-58', lei: LEI, artigo: 'art. 58', tema: 'garantia', titulo: 'Garantia da proposta',
    texto: 'O edital pode exigir garantia de proposta, até 1% do valor estimado da contratação, devolvida aos licitantes após o resultado. Quem se recusa a assinar o contrato pode perder a garantia. Exigência acima do limite é irregular.',
    termos: ['garantia de proposta', 'garantia para participar', 'caucao de proposta', '1%'],
  },
  {
    id: 'lei-art-59', lei: LEI, artigo: 'art. 59', tema: 'proposta', titulo: 'Desclassificação da proposta',
    texto: 'Será desclassificada a proposta com vícios insanáveis, que não obedeça às especificações técnicas do edital, com preço inexequível ou acima do orçamento estimado, cuja exequibilidade não seja demonstrada quando exigida, ou que descumpra outra exigência do edital de forma que não possa ser corrigida. Preço baixo só é inexequível se não puder ser demonstrado como viável — o órgão deve dar chance de demonstrar.',
    termos: ['desclassificacao', 'proposta desclassificada', 'inexequivel', 'inexequibilidade', 'preco muito baixo', 'acima do orcamento', 'por que fui desclassificado'],
  },
  {
    id: 'lei-art-60', lei: LEI, artigo: 'art. 60', tema: 'proposta', titulo: 'Desempate',
    texto: 'Persistindo o empate entre propostas, a lei manda decidir em ordem: disputa final entre os empatados, avaliação de desempenho contratual prévio, ações de equidade (como a reserva de vagas a mulheres vítimas de violência) e programa de integridade. Antes disso, aplica-se a preferência da ME e EPP prevista na Lei Complementar 123.',
    termos: ['desempate', 'empate', 'proposta igual', 'criterios de desempate', 'integridade'],
  },
  {
    id: 'lei-art-61', lei: LEI, artigo: 'art. 61', tema: 'proposta', titulo: 'Negociação com o primeiro colocado',
    texto: 'Definido o resultado do julgamento, o órgão pode negociar condições mais vantajosas com o primeiro colocado, inclusive redução do preço. A negociação é do órgão; o licitante não é obrigado a baixar acima do que a proposta permite.',
    termos: ['negociacao', 'negociar preco', 'contraproposta', 'reduzir preco depois dos lances'],
  },
  {
    id: 'lei-art-71', lei: LEI, artigo: 'art. 71', tema: 'modalidades', titulo: 'Revogação e anulação da licitação',
    texto: 'Terminadas as fases de julgamento e habilitação e esgotados os recursos, a autoridade superior pode devolver para saneamento, revogar por conveniência e oportunidade, anular por ilegalidade insanável (de ofício ou a pedido) ou adjudicar e homologar. Revogação e anulação exigem motivação e dão direito de manifestação ao interessado.',
    termos: ['revogar licitacao', 'anular licitacao', 'cancelamento da licitacao', 'homologacao', 'adjudicacao', 'licitacao cancelada'],
  },

  // ------------------------------------------------------ habilitação
  {
    id: 'lei-art-62', lei: LEI, artigo: 'art. 62', tema: 'habilitacao', titulo: 'Habilitação: o que se verifica',
    texto: 'A habilitação verifica quatro coisas: habilitação jurídica, qualificação técnica, regularidade fiscal, social e trabalhista e qualificação econômico-financeira. O edital define as condições; o órgão só pode exigir o que a lei autoriza e o objeto justifica.',
    termos: ['habilitacao', 'documentos de habilitacao', 'o que e habilitacao', 'inabilitado', 'inabilitacao'],
  },
  {
    id: 'lei-art-64', lei: LEI, artigo: 'art. 64', tema: 'habilitacao', titulo: 'Diligência: corrigir ou complementar documento',
    texto: 'Depois da abertura, o órgão pode aceitar a complementação de informações sobre documentos já apresentados, que atestem condição que já existia na data da proposta, e a atualização de documento cuja validade venceu depois do recebimento das propostas. Não se aceita documento novo que deveria ter sido entregue antes.',
    termos: ['diligencia', 'complementar documento', 'documento vencido', 'certidao vencida', 'corrigir documento', 'substituir documento', 'juntar documento depois'],
  },
  {
    id: 'lei-art-66', lei: LEI, artigo: 'art. 66', tema: 'habilitacao', titulo: 'Habilitação jurídica',
    texto: 'A habilitação jurídica comprova a existência da empresa e a capacidade de quem assina por ela: ato constitutivo, contrato social ou documento equivalente, inscrição no registro comercial e, quando o caso, autorização de funcionamento.',
    termos: ['habilitacao juridica', 'contrato social', 'ato constitutivo', 'registro comercial'],
  },
  {
    id: 'lei-art-67', lei: LEI, artigo: 'art. 67', tema: 'habilitacao', titulo: 'Qualificação técnica e atestados',
    texto: 'A qualificação técnica pode pedir atestados de capacidade técnico-profissional (do profissional da equipe) e técnico-operacional (da empresa), registro no conselho profissional e indicação de pessoal. As exigências de atestado se limitam às parcelas de maior relevância ou valor significativo do objeto; exigir quantitativo desproporcional ao que será contratado é restritivo.',
    termos: ['atestado', 'atestado de capacidade tecnica', 'qualificacao tecnica', 'capacidade tecnica', 'quantitativo minimo', 'registro no conselho', 'crea', 'cau', 'exigencia restritiva'],
  },
  {
    id: 'lei-art-68', lei: LEI, artigo: 'art. 68', tema: 'habilitacao', titulo: 'Regularidade fiscal, social e trabalhista',
    texto: 'A regularidade fiscal, social e trabalhista comprova inscrição no CNPJ, regularidade com a Fazenda federal, estadual e municipal, com o FGTS e a Seguridade Social, inexistência de débito trabalhista (CNDT) e o cumprimento da proibição de trabalho de menores.',
    termos: ['regularidade fiscal', 'certidao negativa', 'fgts', 'cndt', 'certidao trabalhista', 'cnd', 'certidoes', 'receita federal'],
  },
  {
    id: 'lei-art-69', lei: LEI, artigo: 'art. 69', tema: 'habilitacao', titulo: 'Qualificação econômico-financeira',
    texto: 'A qualificação econômico-financeira usa balanço patrimonial e demonstrações contábeis dos dois últimos exercícios, certidão negativa de falência e índices contábeis previstos no edital. O edital pode pedir patrimônio líquido ou capital mínimo, limitado a 10% do valor estimado; índice que o mercado não usa ou exigência acima disso é motivo de impugnação.',
    termos: ['balanco patrimonial', 'qualificacao economico-financeira', 'indice contabil', 'capital minimo', 'patrimonio liquido', 'falencia', 'liquidez'],
  },
  {
    id: 'lei-art-70', lei: LEI, artigo: 'art. 70', tema: 'habilitacao', titulo: 'Dispensa de documentos de habilitação',
    texto: 'Em certas contratações o edital pode dispensar, total ou parcialmente, documentos de habilitação — por exemplo as de menor valor, entrega imediata e pronta entrega. A dispensa deve estar prevista no edital ou no aviso, e quem dispensa não perde o dever de verificar o que for essencial.',
    termos: ['dispensa de documento', 'dispensa de habilitacao', 'sem documentos', 'pronta entrega'],
  },

  // -------------------------------------------------------- ME e EPP
  {
    id: 'lei-art-4', lei: LEI, artigo: 'art. 4º', tema: 'me_epp', titulo: 'ME e EPP na Lei 14.133',
    texto: 'Aplicam-se às licitações da Lei 14.133 os artigos 42 a 49 da Lei Complementar 123/2006, que dão tratamento diferenciado a microempresas e empresas de pequeno porte. Há exceções para obras e serviços de engenharia de valor acima da receita máxima da EPP e para licitações em que o edital não permita o benefício. Confira o artigo.',
    termos: ['me', 'epp', 'microempresa', 'pequeno porte', 'tratamento diferenciado', 'lc 123', 'simples nacional'],
  },
  {
    id: 'lc123-art-43', lei: LC, artigo: 'art. 43', tema: 'me_epp', titulo: 'ME e EPP: regularidade fiscal com restrição',
    texto: 'A ME e a EPP apresentam toda a documentação fiscal e trabalhista na licitação, mesmo com restrição. Se houver restrição, têm 5 dias úteis, a contar de quando forem declaradas vencedoras, para regularizar (pagar, parcelar, emitir certidão), prorrogáveis por igual período a critério do órgão. Não regularizar no prazo leva à decadência do direito à contratação, sem prejuízo das sanções.',
    termos: ['certidao com restricao', 'regularizar documento', '5 dias uteis', 'prazo para regularizar', 'divida fiscal', 'prorrogacao do prazo fiscal', 'parcelamento'],
  },
  {
    id: 'lc123-art-44', lei: LC, artigo: 'arts. 44 e 45', tema: 'me_epp', titulo: 'ME e EPP: empate ficto',
    texto: 'Há empate quando a proposta da ME ou EPP é igual ou até 10% superior à melhor proposta (no pregão, até 5%). A ME ou EPP mais bem classificada pode, então, apresentar proposta de preço inferior à vencedora e ficar com o objeto. Isso se aplica quando a primeira colocada não é ME nem EPP. Cada ME/EPP empatada é chamada em ordem de classificação.',
    termos: ['empate ficto', 'preferencia me epp', 'desempate me', '5%', '10%', 'cobrir a proposta', 'direito de preferencia'],
  },
  {
    id: 'lc123-art-48', lei: LC, artigo: 'art. 48', tema: 'me_epp', titulo: 'ME e EPP: itens exclusivos e cota',
    texto: 'O órgão deve reservar para ME e EPP os itens de contratação de valor até R$ 80 mil, pode exigir subcontratação de ME e EPP em obras e serviços e, em bens de natureza divisível, deve reservar cota de até 25% do objeto para ME e EPP. A lei traz exceções (como quando o tratamento não é vantajoso); confira o artigo e o edital.',
    termos: ['exclusivo para me', 'item exclusivo', 'cota reservada', '25%', '80 mil', 'subcontratacao me', 'cota de 25'],
  },

  // ------------------------------------------------- impugnação e recursos
  {
    id: 'lei-art-164', lei: LEI, artigo: 'art. 164', tema: 'recursos', titulo: 'Impugnação e pedido de esclarecimento',
    texto: 'Qualquer pessoa pode impugnar o edital por irregularidade na aplicação da lei ou pedir esclarecimento sobre ele. O pedido deve ser protocolado até 3 dias úteis antes da data de abertura do certame. A resposta é publicada no site oficial em até 3 dias úteis, limitada ao último dia útil anterior à abertura.',
    termos: ['impugnacao', 'impugnar edital', 'esclarecimento', 'pedido de esclarecimento', 'prazo para impugnar', 'questionar edital', 'questionamento'],
  },
  {
    id: 'lei-art-165', lei: LEI, artigo: 'art. 165', tema: 'recursos', titulo: 'Recurso administrativo',
    texto: 'Cabe recurso, em 3 dias úteis a partir da intimação ou da lavratura da ata, contra atos como o julgamento das propostas, a habilitação ou inabilitação e a anulação ou revogação da licitação. No recurso contra julgamento de proposta e habilitação, a intenção de recorrer deve ser manifestada imediatamente, sob pena de preclusão, e as razões vêm depois no prazo legal; os demais licitantes têm 3 dias úteis para as contrarrazões.',
    termos: ['recurso', 'recorrer', 'intencao de recurso', 'prazo do recurso', 'contrarrazoes', 'razoes do recurso', 'inabilitacao recurso', 'manifestar intencao'],
  },
  {
    id: 'lei-art-168', lei: LEI, artigo: 'art. 168', tema: 'recursos', titulo: 'Efeito suspensivo do recurso',
    texto: 'O recurso e o pedido de reconsideração têm efeito suspensivo: o ato ou a decisão recorrida fica suspensa até a decisão final da autoridade competente.',
    termos: ['efeito suspensivo', 'suspende a licitacao', 'recurso suspende', 'reconsideracao'],
  },

  // --------------------------------------------------------- contrato
  {
    id: 'lei-art-90', lei: LEI, artigo: 'art. 90', tema: 'contrato', titulo: 'Convocação para assinar o contrato',
    texto: 'O vencedor é convocado para assinar o contrato no prazo do edital; se não assinar, perde o direito à contratação e pode ser sancionado. O prazo pode ser prorrogado uma vez, por igual período, se o pedido for feito durante o prazo e o motivo for aceito. O órgão pode chamar os licitantes remanescentes.',
    termos: ['assinar contrato', 'convocacao', 'prazo para assinar', 'nao assinei o contrato', 'recusa em assinar', 'remanescentes', 'prorrogar prazo de assinatura'],
  },
  {
    id: 'lei-art-92', lei: LEI, artigo: 'art. 92', tema: 'contrato', titulo: 'Cláusulas necessárias do contrato',
    texto: 'O contrato precisa trazer, entre outros itens, o objeto, a vigência, o preço e as condições de pagamento, o critério e a data-base de reajuste, a garantia quando exigida, a forma de fiscalização, as penalidades e a matriz de riscos quando houver. É o roteiro para conferir uma minuta antes de assinar.',
    termos: ['clausulas do contrato', 'minuta de contrato', 'o que tem no contrato', 'clausulas necessarias', 'conferir contrato'],
  },
  {
    id: 'lei-art-94', lei: LEI, artigo: 'art. 94', tema: 'contrato', titulo: 'Publicação do contrato no PNCP',
    texto: 'A divulgação do contrato e de seus aditamentos no PNCP é condição indispensável para sua eficácia. O prazo é de 20 dias úteis, contado da assinatura, na licitação, e de 10 dias úteis na contratação direta.',
    termos: ['publicacao do contrato', 'pncp contrato', 'eficacia do contrato', 'aditivo publicado'],
  },
  {
    id: 'lei-art-106', lei: LEI, artigo: 'arts. 106 e 107', tema: 'contrato', titulo: 'Duração do contrato e prorrogação',
    texto: 'Serviços e fornecimentos contínuos podem ser contratados por até 5 anos, e prorrogados sucessivamente até o limite de 10 anos, se houver previsão no edital e a vantagem for atestada. O contrato com prazo menor que o do crédito orçamentário também é possível; o órgão pode extinguir sem ônus quando faltar crédito.',
    termos: ['prazo do contrato', 'vigencia', 'prorrogacao', '5 anos', '10 anos', 'servico continuo', 'duracao do contrato'],
  },
  {
    id: 'lei-art-117', lei: LEI, artigo: 'art. 117', tema: 'contrato', titulo: 'Fiscalização do contrato',
    texto: 'A execução do contrato é acompanhada e fiscalizada por um ou mais fiscais, designados pela Administração, que registram as ocorrências e comunicam os problemas. O contratado deve conhecer o fiscal e se comunicar por escrito.',
    termos: ['fiscal do contrato', 'fiscalizacao', 'gestor do contrato', 'acompanhamento do contrato'],
  },
  {
    id: 'lei-art-122', lei: LEI, artigo: 'art. 122', tema: 'contrato', titulo: 'Subcontratação',
    texto: 'O contratado pode subcontratar partes da obra, do serviço ou do fornecimento até o limite que a Administração autorizar, sem prejuízo das suas responsabilidades. O edital pode proibir ou limitar. A empresa subcontratada não pode estar impedida de licitar.',
    termos: ['subcontratar', 'subcontratacao', 'terceirizar parte', 'repassar parte do contrato'],
  },
  {
    id: 'lei-art-124', lei: LEI, artigo: 'arts. 124 e 125', tema: 'contrato', titulo: 'Alteração do contrato (aditivos)',
    texto: 'O contrato pode ser alterado por acordo ou unilateralmente pela Administração. Os acréscimos e supressões ficam limitados a 25% do valor inicial do contrato e, em reforma de edifício ou equipamento, a 50%. O restabelecimento do equilíbrio econômico-financeiro é motivo de alteração por acordo.',
    termos: ['aditivo', 'acrescimo', '25%', '50%', 'alterar contrato', 'aumentar quantidade', 'supressao', 'termo aditivo'],
  },
  {
    id: 'lei-art-137', lei: LEI, artigo: 'art. 137', tema: 'contrato', titulo: 'Extinção do contrato',
    texto: 'O contrato pode ser extinto por inadimplemento, por interesse da Administração ou por acordo. O contratado tem direito de pedir a extinção quando, por exemplo, a Administração suspende a execução por mais de 3 meses, atrasa os pagamentos por mais de 2 meses ou deixa de liberar o local ou objeto, além de supressões acima do limite legal. Em caso de calamidade, a extinção segue regras próprias.',
    termos: ['rescisao', 'extincao do contrato', 'encerrar contrato', 'atraso de pagamento', '2 meses', 'suspensao do contrato', 'cancelar contrato'],
  },
  {
    id: 'lei-art-140', lei: LEI, artigo: 'art. 140', tema: 'contrato', titulo: 'Recebimento do objeto',
    texto: 'O objeto é recebido em duas etapas: o recebimento provisório (pelo responsável pela fiscalização, mediante termo) e o recebimento definitivo (por servidor ou comissão, depois de verificar o cumprimento das exigências). O pagamento e a liberação da garantia dependem do recebimento nos termos do contrato.',
    termos: ['recebimento', 'recebimento provisorio', 'recebimento definitivo', 'termo de recebimento', 'entrega do objeto', 'aceite'],
  },

  // ----------------------------------------------- pagamento e reequilíbrio
  {
    id: 'lei-art-135', lei: LEI, artigo: 'arts. 134 e 135', tema: 'pagamento', titulo: 'Reajuste e repactuação',
    texto: 'Os preços do contrato são reajustados pelo índice previsto no contrato, depois de 1 ano contado da data do orçamento estimado. Nos serviços contínuos com mão de obra dedicada, a repactuação acompanha os custos de mão de obra, a partir da data do acordo, convenção ou dissídio coletivo. A correção da data-base é um dos pontos a conferir na minuta.',
    termos: ['reajuste', 'repactuacao', 'indice de reajuste', 'igpm', 'ipca', 'data-base', 'convencao coletiva', 'dissidio', 'reajustar preco'],
  },
  {
    id: 'lei-art-124-d', lei: LEI, artigo: 'art. 124, II, d', tema: 'pagamento', titulo: 'Reequilíbrio econômico-financeiro',
    texto: 'O contrato pode ser alterado por acordo para restabelecer a relação entre o encargo do contratado e a retribuição da Administração, quando fatos imprevisíveis ou previsíveis de consequências incalculáveis, ou força maior, alteram o custo. O pedido deve ser feito por escrito, com prova do impacto.',
    termos: ['reequilibrio', 'equilibrio economico-financeiro', 'desequilibrio', 'aumento de custo', 'fato imprevisivel', 'forca maior', 'revisao de preco'],
  },
  {
    id: 'lei-art-141', lei: LEI, artigo: 'art. 141', tema: 'pagamento', titulo: 'Ordem cronológica de pagamento',
    texto: 'Os pagamentos seguem a ordem cronológica de exigibilidade, por fonte de recurso e por categoria (bens, locações, serviços e obras). A ordem só pode ser alterada em hipóteses justificadas por escrito, como grave perturbação da ordem pública ou pagamento de pequeno valor. O órgão deve manter a lista pública no site.',
    termos: ['ordem cronologica', 'quando vou receber', 'pagamento', 'atraso no pagamento', 'fila de pagamento', 'prazo de pagamento'],
  },
  {
    id: 'lei-art-145', lei: LEI, artigo: 'art. 145', tema: 'pagamento', titulo: 'Pagamento antecipado',
    texto: 'Não se permite pagamento antecipado, total ou parcial, em compras, serviços e obras, salvo se o edital ou o contrato previr e o adiantamento for indispensável para obter o bem ou garantir o serviço, ou gerar economia relevante. Se a condição não for cumprida, o valor volta ao órgão.',
    termos: ['pagamento antecipado', 'adiantamento', 'sinal', 'pagar antes', 'entrada'],
  },

  // -------------------------------------------------------- garantias
  {
    id: 'lei-art-96', lei: LEI, artigo: 'arts. 96 a 102', tema: 'garantia', titulo: 'Garantia do contrato',
    texto: 'O edital pode exigir garantia de execução do contrato. O contratado escolhe entre caução em dinheiro ou títulos, seguro-garantia, fiança bancária ou título de capitalização. A garantia fica em regra em até 5% do valor inicial do contrato, podendo chegar a 10% com justificativa de complexidade e risco. Em obras e serviços de engenharia de grande vulto, pode ser exigido seguro-garantia com cláusula de retomada, em percentual maior. A garantia é devolvida ao fim do contrato, depois de cumpridas as obrigações. Os valores e os incisos exatos de cada regra devem ser conferidos nos artigos.',
    termos: ['garantia contratual', 'garantia do contrato', 'seguro garantia', 'fianca bancaria', 'caucao', 'titulo de capitalizacao', 'clausula de retomada', '5%', '10%', 'grande vulto', 'garantia de execucao'],
  },

  // -------------------------------------------------------- sanções
  {
    id: 'lei-art-155', lei: LEI, artigo: 'art. 155', tema: 'sancoes', titulo: 'Infrações administrativas',
    texto: 'O licitante ou contratado responde por infrações como dar causa à inexecução parcial ou total do contrato, não manter a proposta, não assinar o contrato, apresentar documento falso, fraudar a licitação, comportar-se de modo inidôneo e retardar a execução do objeto. Cada uma pode gerar sanção.',
    termos: ['infracao', 'infracoes administrativas', 'o que da multa', 'o que gera sancao', 'documento falso', 'nao manter a proposta', 'inexecucao'],
  },
  {
    id: 'lei-art-156', lei: LEI, artigo: 'art. 156', tema: 'sancoes', titulo: 'Sanções',
    texto: 'As sanções são: advertência, multa, impedimento de licitar e contratar e declaração de inidoneidade. A multa fica entre 0,5% e 30% do valor do contrato licitado ou contratado. O impedimento vale por até 3 anos no ente que aplicou a sanção. A declaração de inidoneidade vale de 3 a 6 anos, para toda a Administração. A sanção é proporcional: a mais grave só se não couber uma menor.',
    termos: ['sancao', 'multa', 'advertencia', 'impedimento de licitar', 'inidoneidade', 'declaracao de inidoneidade', 'penalidade', 'suspensao', 'punicao', '30%', 'quanto e a multa'],
  },
  {
    id: 'lei-art-157', lei: LEI, artigo: 'arts. 157 e 158', tema: 'sancoes', titulo: 'Defesa antes da sanção',
    texto: 'Antes de aplicar multa, o órgão deve intimar e dar defesa prévia em 15 dias úteis. Para impedimento e declaração de inidoneidade é obrigatório o processo de responsabilização, também com defesa de 15 dias úteis. A sanção não pode ser aplicada sem o contraditório.',
    termos: ['defesa previa', 'direito de defesa', 'contraditorio', '15 dias uteis', 'processo de responsabilizacao', 'me defender de multa'],
  },
  {
    id: 'lei-art-163', lei: LEI, artigo: 'art. 163', tema: 'sancoes', titulo: 'Reabilitação do licitante sancionado',
    texto: 'O licitante sancionado com impedimento ou inidoneidade pode pedir reabilitação perante a autoridade que aplicou a sanção, depois de reparar o dano, pagar a multa e cumprir o prazo mínimo da sanção; em certas infrações a lei exige ainda programa de integridade. Sem reabilitação a sanção segue valendo até o fim do prazo.',
    termos: ['reabilitacao', 'sair da lista de sancionados', 'limpar nome', 'cadastro de sancionados', 'ceis', 'cnep'],
  },

  // ---------------------------------------------------- contratação direta
  {
    id: 'lei-art-74', lei: LEI, artigo: 'art. 74', tema: 'direta', titulo: 'Inexigibilidade',
    texto: 'A licitação é inexigível quando for inviável a competição: fornecedor exclusivo, contratação de profissional do setor artístico, serviços técnicos especializados de natureza predominantemente intelectual com profissionais de notória especialização, credenciamento, entre outros casos do artigo. Não substitui licitação onde há concorrência possível.',
    termos: ['inexigibilidade', 'fornecedor exclusivo', 'notoria especializacao', 'inviabilidade de competicao', 'credenciamento', 'contratacao sem licitacao'],
  },
  {
    id: 'lei-art-75', lei: LEI, artigo: 'art. 75', tema: 'direta', titulo: 'Dispensa de licitação',
    texto: 'A licitação é dispensável nas hipóteses do artigo 75, entre elas as contratações de pequeno valor: no caso de obras, serviços de engenharia e manutenção de veículos, o limite original é R$ 100 mil e nos demais serviços e compras R$ 50 mil, valores atualizados por decreto e que se somam por tipo de objeto no exercício, para evitar fracionamento. Há ainda dispensa por emergência, licitação deserta ou fracassada e outras hipóteses. Confira o valor vigente.',
    termos: ['dispensa', 'dispensa de licitacao', 'pequeno valor', '50 mil', '100 mil', 'emergencia', 'licitacao deserta', 'licitacao fracassada', 'fracionamento', 'sem licitacao', 'dispensa eletronica'],
  },

  // ------------------------------------------------------ registro de preços
  {
    id: 'lei-art-82', lei: LEI, artigo: 'arts. 82 a 86', tema: 'registro', titulo: 'Sistema de Registro de Preços',
    texto: 'No registro de preços, o órgão registra em ata os preços e as condições de fornecimento e contrata, conforme a necessidade, sem obrigação de comprar tudo. A ata de registro de preços vale por 1 ano, prorrogável por igual período. Quem registra o preço assume o compromisso de atender os pedidos pelo prazo da ata; a ata não é contrato nem garantia de compra.',
    termos: ['registro de precos', 'srp', 'ata de registro', 'ata de registro de precos', 'carona', 'adesao a ata', 'quantidade registrada', 'vigencia da ata'],
  },
  {
    id: 'lei-art-95', lei: LEI, artigo: 'art. 95', tema: 'contrato', titulo: 'Contrato escrito, nota de empenho e instrumento equivalente',
    texto: 'O contrato escrito pode ser substituído por outro instrumento hábil — carta-contrato, nota de empenho, autorização de compra ou ordem de serviço — nas dispensas e nas compras com entrega imediata e integral e sem obrigações futuras. A substituição segue as regras da lei e do edital.',
    termos: ['nota de empenho', 'carta contrato', 'ordem de servico', 'instrumento equivalente', 'contrato sem termo', 'autorizacao de fornecimento'],
  },
];

const POR_ID = new Map(ARTIGOS.map((a) => [a.id, a]));
const rotulo = (a) => `${a.lei}, ${a.artigo}`;

// ---------------------------------------------------------------------------
// "Jurídico Fácil": guias curtos por tema. Escrevemos nós; cada guia aponta para
// os artigos da base (campo `artigos`) — o leitor vê de onde vem cada afirmação.
// ---------------------------------------------------------------------------
const GUIAS = [
  {
    id: 'como-impugnar', tema: 'recursos', titulo: 'Como impugnar um edital — e até quando',
    resumo: 'Prazo de 3 dias úteis antes da abertura e o que costuma dar certo.',
    corpo: [
      'Qualquer pessoa pode impugnar o edital. O pedido precisa ser protocolado até 3 dias úteis antes da data de abertura do certame — conte em dias úteis, sem o dia do começo e com o do vencimento.',
      'Impugne o que realmente prejudica: exigência restritiva (atestado desproporcional, marca sem "ou similar"), prazo menor que o mínimo legal, especificação contraditória, índice contábil incomum ou falta de informação essencial. Cite o artigo da lei em que se apoia.',
      'Se a dúvida é só entender um ponto, o caminho é o pedido de esclarecimento, com o mesmo prazo. A resposta sai em até 3 dias úteis e é publicada no site oficial.',
    ],
    artigos: ['lei-art-164', 'lei-art-183', 'lei-art-41', 'lei-art-55', 'lei-art-67'],
    termos: ['impugnar', 'impugnacao', 'esclarecimento', 'questionar edital'],
  },
  {
    id: 'prazo-recurso', tema: 'recursos', titulo: 'Fui desclassificado ou inabilitado: como recorrer',
    resumo: 'Intenção imediata, 3 dias úteis para as razões e efeito suspensivo.',
    corpo: [
      'No pregão e na concorrência, a intenção de recorrer contra julgamento de proposta ou habilitação deve ser manifestada logo na sessão. Quem deixa para depois perde o direito de recorrer.',
      'Manifestada a intenção, as razões são apresentadas em 3 dias úteis, e os demais licitantes têm o mesmo prazo para as contrarrazões.',
      'O recurso suspende o ato ou a decisão recorrida até a decisão final. O acolhimento só invalida o que não pode ser aproveitado.',
    ],
    artigos: ['lei-art-165', 'lei-art-168', 'lei-art-59', 'lei-art-62'],
    termos: ['recurso', 'recorrer', 'desclassificado', 'inabilitado'],
  },
  {
    id: 'documento-vencido', tema: 'habilitacao', titulo: 'Posso corrigir um documento depois da abertura?',
    resumo: 'O que a diligência aceita e o que ela não aceita.',
    corpo: [
      'A lei permite a diligência para complementar informação de documento já apresentado, quando ele atesta uma condição que já existia, e para atualizar documento cuja validade venceu depois do recebimento das propostas.',
      'Não vale documento novo que deveria ter sido entregue junto: a diligência não serve para suprir o que faltou. Falha só de forma, que não impede ver a qualificação, não deve tirar o licitante da disputa.',
      'ME e EPP têm uma regra à parte para restrição fiscal e trabalhista: 5 dias úteis para regularizar depois de declaradas vencedoras.',
    ],
    artigos: ['lei-art-64', 'lei-art-12', 'lc123-art-43'],
    termos: ['diligencia', 'certidao vencida', 'documento'],
  },
  {
    id: 'empate-me-epp', tema: 'me_epp', titulo: 'Empate ficto: quando a ME e a EPP cobrem a proposta',
    resumo: 'Faixa de 10% (5% no pregão) e quem pode usar.',
    corpo: [
      'Quando a melhor proposta é de uma empresa que não é ME nem EPP, a ME ou EPP com proposta até 10% maior (no pregão, até 5%) pode apresentar um novo preço, menor que o da primeira colocada, e ficar com o objeto.',
      'Se houver mais de uma ME ou EPP na faixa, elas são chamadas em ordem de classificação. Quem usa o direito deve estar com a documentação de ME/EPP em dia.',
      'A faixa só vale se o edital não tiver reservado o item para ME e EPP — itens exclusivos até R$ 80 mil e a cota de 25% têm regra própria.',
    ],
    artigos: ['lc123-art-44', 'lc123-art-48', 'lei-art-4', 'lei-art-60'],
    termos: ['empate ficto', 'me', 'epp', 'preferencia'],
  },
  {
    id: 'quanto-garantia', tema: 'garantia', titulo: 'Garantia: quanto podem exigir de mim',
    resumo: 'Garantia da proposta (até 1%) e do contrato (até 5%, em regra).',
    corpo: [
      'A garantia da proposta, quando exigida no edital, tem teto de 1% do valor estimado e é devolvida depois do resultado.',
      'A garantia do contrato é em regra de até 5% do valor inicial, com possibilidade de 10% quando o órgão justifica a complexidade e o risco. Você escolhe a modalidade: caução, seguro-garantia, fiança bancária ou título de capitalização.',
      'Em obras e serviços de engenharia de grande vulto, o seguro-garantia pode vir com cláusula de retomada e percentual maior. Confira o edital e os artigos antes de pedir a cotação ao corretor.',
    ],
    artigos: ['lei-art-58', 'lei-art-96'],
    termos: ['garantia', 'seguro garantia', 'fianca'],
  },
  {
    id: 'sancoes-explicadas', tema: 'sancoes', titulo: 'Atraso e inexecução: as sanções em linguagem simples',
    resumo: 'Do aviso à declaração de inidoneidade, com prazos e valores.',
    corpo: [
      'São quatro as sanções: advertência, multa, impedimento de licitar e contratar e declaração de inidoneidade. A multa vai de 0,5% a 30% do valor do contrato. O impedimento vale até 3 anos no ente que sancionou; a inidoneidade, de 3 a 6 anos, para toda a Administração.',
      'Antes de aplicar, o órgão tem de abrir prazo de defesa de 15 dias úteis. Multa e sanção sem defesa podem ser anuladas.',
      'Sanção aplicada aparece em cadastros públicos (CEIS e CNEP). Para sair do impedimento antes do fim, existe o pedido de reabilitação, que exige reparar o dano, pagar a multa e cumprir o prazo mínimo.',
    ],
    artigos: ['lei-art-155', 'lei-art-156', 'lei-art-157', 'lei-art-163'],
    termos: ['multa', 'sancao', 'inidoneidade', 'atraso'],
  },
  {
    id: 'preco-inexequivel', tema: 'proposta', titulo: 'Preço baixo demais: o que é inexequibilidade',
    resumo: 'O órgão pode pedir que você demonstre que o preço fecha.',
    corpo: [
      'Proposta com preço inexequível é desclassificada, mas o órgão deve dar a oportunidade de demonstrar a viabilidade quando o edital previr essa demonstração.',
      'Monte a prova antes: composição de custos, notas de compra, contratos anteriores com preço parecido e margem real. Sem demonstração, a proposta cai.',
      'Do outro lado, se você acha que o concorrente ofertou preço que não fecha, pode pedir a diligência na sessão e recorrer se a decisão ignorar o pedido.',
    ],
    artigos: ['lei-art-59', 'lei-art-61'],
    termos: ['inexequivel', 'preco baixo', 'composicao de custos'],
  },
  {
    id: 'atestado-tecnico', tema: 'habilitacao', titulo: 'Atestado de capacidade técnica: o que pode ser exigido',
    resumo: 'Parcelas de maior relevância, não o objeto inteiro.',
    corpo: [
      'O órgão pode exigir atestado técnico-profissional (da equipe) e técnico-operacional (da empresa), mas limitado às parcelas de maior relevância ou valor significativo do objeto.',
      'Quantidades mínimas devem ter relação com o que será contratado. Exigir muito mais que o objeto, ou experiência em atividade não relevante, é restritivo e pode ser impugnado.',
      'Guarde seus atestados no cofre do painel e confira a validade antes de cada licitação.',
    ],
    artigos: ['lei-art-67', 'lei-art-62', 'lei-art-164'],
    termos: ['atestado', 'capacidade tecnica', 'quantitativo'],
  },
  {
    id: 'revogacao-anulacao', tema: 'modalidades', titulo: 'A licitação foi revogada ou anulada: o que muda para mim',
    resumo: 'Motivação, contraditório e o que fazer.',
    corpo: [
      'A autoridade superior pode revogar por conveniência e oportunidade, anular por ilegalidade insanável ou devolver para saneamento. Em qualquer caso a decisão precisa ser motivada, e o interessado pode se manifestar.',
      'Você pode recorrer da anulação ou revogação em 3 dias úteis.',
      'Fique atento: uma nova licitação do mesmo objeto costuma sair com outro número, e o painel mostra se houve reabertura.',
    ],
    artigos: ['lei-art-71', 'lei-art-165', 'lei-art-168'],
    termos: ['revogada', 'anulada', 'cancelada', 'revogacao'],
  },
  {
    id: 'reajuste-reequilibrio', tema: 'pagamento', titulo: 'Reajuste, repactuação e reequilíbrio: qual é qual',
    resumo: 'Quando usar cada instrumento e o que provar.',
    corpo: [
      'Reajuste é a correção periódica do preço por índice previsto no contrato, depois de 1 ano da data do orçamento. É automático nos termos do contrato, e é feito por apostila.',
      'Repactuação vale para serviços contínuos com mão de obra dedicada e acompanha acordo, convenção ou dissídio coletivo.',
      'Reequilíbrio é o pedido por acordo, quando fato imprevisível ou de consequência incalculável, ou força maior, muda o custo do contrato. Exige pedido por escrito, prova do impacto e o órgão pode negar.',
    ],
    artigos: ['lei-art-135', 'lei-art-124-d', 'lei-art-92'],
    termos: ['reajuste', 'repactuacao', 'reequilibrio'],
  },
  {
    id: 'quando-recebo', tema: 'pagamento', titulo: 'Quando vou receber: ordem cronológica e atraso',
    resumo: 'A fila de pagamento do órgão e o que fazer se atrasar.',
    corpo: [
      'O órgão paga em ordem cronológica de exigibilidade, por fonte e por categoria. A fila é pública. Pagamento antecipado, em regra, não existe, salvo previsão no edital.',
      'Se o atraso passa de 2 meses, o contratado tem direito de pedir a extinção ou de optar por suspender o cumprimento das obrigações até a normalização.',
      'Guarde a nota fiscal, o termo de recebimento e os e-mails: são a prova do prazo.',
    ],
    artigos: ['lei-art-141', 'lei-art-145', 'lei-art-137', 'lei-art-140'],
    termos: ['pagamento', 'atraso de pagamento', 'ordem cronologica'],
  },
  {
    id: 'pregao-ou-concorrencia', tema: 'modalidades', titulo: 'Pregão ou concorrência: qual usar para quê',
    resumo: 'Bens e serviços comuns vão a pregão; o resto, a concorrência.',
    corpo: [
      'O pregão é a modalidade obrigatória para bens e serviços comuns — os que o mercado descreve por padrões objetivos. Ele não serve para serviços técnicos especializados predominantemente intelectuais nem para obras e serviços de engenharia, exceto os comuns.',
      'A concorrência segue o mesmo rito do pregão e cobre o que não é comum. O prazo mínimo entre a publicação e a abertura é maior, conforme o objeto.',
      'Se o edital usa a modalidade errada, é motivo de esclarecimento ou impugnação.',
    ],
    artigos: ['lei-art-28', 'lei-art-29', 'lei-art-6', 'lei-art-55'],
    termos: ['pregao', 'concorrencia', 'modalidade'],
  },
  {
    id: 'registro-precos', tema: 'registro', titulo: 'Ata de registro de preços: o que ela garante',
    resumo: 'Preço registrado não é compra garantida.',
    corpo: [
      'No sistema de registro de preços, o órgão registra preços e condições e compra conforme a necessidade. A ata vale por 1 ano e pode ser prorrogada por igual período.',
      'Estar na ata dá o direito de ser chamado, mas não a garantia de compra de todo o quantitativo. Atenda os pedidos pelo prazo da ata, ou seja, pelo preço registrado.',
      'O painel acompanha as atas do mercado e a vigência das suas, em Atas.',
    ],
    artigos: ['lei-art-82', 'lei-art-95'],
    termos: ['ata', 'registro de precos', 'srp'],
  },
  {
    id: 'contratacao-direta', tema: 'direta', titulo: 'Dispensa e inexigibilidade: quando não há licitação',
    resumo: 'Pequeno valor, emergência e fornecedor exclusivo.',
    corpo: [
      'A dispensa de licitação cobre casos como contratações de pequeno valor, emergência e licitação deserta ou fracassada. O limite de pequeno valor é atualizado por decreto; confira o vigente.',
      'A inexigibilidade vale quando não há como competir: fornecedor exclusivo, profissional de notória especialização, artista consagrado e credenciamento.',
      'Mesmo na contratação direta, o contrato e seus aditivos precisam ser publicados no PNCP, em até 10 dias úteis da assinatura.',
    ],
    artigos: ['lei-art-74', 'lei-art-75', 'lei-art-94'],
    termos: ['dispensa', 'inexigibilidade', 'sem licitacao'],
  },
];

const GUIA_POR_ID = new Map(GUIAS.map((g) => [g.id, g]));

module.exports = { VERSAO_BASE, LEI, LC, TEMAS, ARTIGOS, POR_ID, rotulo, GUIAS, GUIA_POR_ID };
