// Biblioteca de perguntas prontas do "Pergunte ao Edital" (Seção 5 do plano SaaS).
//
// Escrita por nós, sobre a Lei 14.133/2021 e o catálogo de exigências da seção 8
// da spec — os textos da referência não se copiam. Seis categorias; `termos`
// são dicas para a busca por trecho (regras/busca-edital.js) achar o parágrafo
// certo mesmo quando o edital usa outra palavra que a da pergunta.
//
// Uma pergunta por linha: [codigo, categoria, subtipo, pergunta, termos].

const CATEGORIAS = {
  proposta: 'Proposta',
  objeto: 'Objeto',
  habilitacao: 'Habilitação',
  pagamentos: 'Pagamentos',
  riscos: 'Riscos e penalidades',
  contrato: 'Contrato',
};

const LINHAS = [
  // Proposta
  ['prop_criterio', 'proposta', 'julgamento', 'Qual é o critério de julgamento (menor preço, maior desconto, técnica e preço)?', ['criterio julgamento menor preco maior desconto tecnica']],
  ['prop_modo_disputa', 'proposta', 'disputa', 'O modo de disputa é aberto, fechado ou aberto e fechado? Qual o intervalo mínimo entre lances?', ['modo disputa aberto fechado intervalo lances']],
  ['prop_validade', 'proposta', 'validade', 'Por quanto tempo a proposta precisa ser válida?', ['validade proposta dias']],
  ['prop_lote_item', 'proposta', 'adjudicacao', 'A disputa é por item, por lote ou global? Posso cotar só parte dos itens?', ['lote item global adjudicacao cotar']],
  ['prop_planilha', 'proposta', 'documentos', 'Que planilha ou modelo de proposta preciso preencher e anexar?', ['planilha modelo proposta anexo custos formacao']],
  ['prop_valor_estimado', 'proposta', 'preco', 'O edital divulga o valor estimado ou máximo? Qual é?', ['valor estimado maximo aceitavel orcamento sigiloso']],
  ['prop_amostra', 'proposta', 'amostra', 'Há exigência de amostra, prova de conceito ou demonstração? Em que prazo?', ['amostra prova conceito demonstracao']],
  ['prop_exequibilidade', 'proposta', 'preco', 'Como o edital trata proposta inexequível ou preço abaixo do custo?', ['inexequivel exequibilidade 75 por cento']],
  ['prop_me_epp', 'proposta', 'beneficio', 'Há cota ou exclusividade para ME/EPP, ou direito de preferência (LC 123)?', ['microempresa pequeno porte exclusiva cota preferencia 123']],

  // Objeto
  ['obj_resumo', 'objeto', 'escopo', 'O que exatamente o órgão quer contratar?', ['objeto contratacao']],
  ['obj_quantidades', 'objeto', 'quantidade', 'Quais são as quantidades e as unidades de cada item?', ['quantidade unidade item quantitativo']],
  ['obj_local_entrega', 'objeto', 'entrega', 'Onde deve ser feita a entrega ou a prestação do serviço?', ['local entrega endereco prestacao execucao']],
  ['obj_prazo_entrega', 'objeto', 'prazo', 'Qual é o prazo de entrega ou de início da execução?', ['prazo entrega inicio execucao dias corridos uteis']],
  ['obj_especificacao', 'objeto', 'tecnico', 'Quais são as especificações técnicas mínimas exigidas?', ['especificacao tecnica minima requisitos termo referencia']],
  ['obj_marca', 'objeto', 'marca', 'O edital indica marca, modelo ou exige produto equivalente?', ['marca modelo similar equivalente referencia']],
  ['obj_garantia_produto', 'objeto', 'garantia', 'Qual é a garantia exigida do produto ou serviço e o prazo de assistência técnica?', ['garantia assistencia tecnica fabricante meses']],
  ['obj_instalacao', 'objeto', 'execucao', 'A instalação, configuração ou treinamento estão incluídos no objeto?', ['instalacao configuracao treinamento capacitacao']],
  ['obj_vigencia', 'objeto', 'prazo', 'Qual é a vigência do contrato ou da ata de registro de preços?', ['vigencia meses prorrogacao ata registro']],
  ['obj_srp', 'objeto', 'registro', 'É registro de preços? O órgão é obrigado a comprar a quantidade toda?', ['registro precos ata quantidade minima obrigacao']],
  ['obj_subcontratacao', 'objeto', 'execucao', 'É permitida a subcontratação? Em que limite?', ['subcontratacao subcontratar']],
  ['obj_consorcio', 'objeto', 'participacao', 'É permitida a participação em consórcio?', ['consorcio consorciadas']],
  ['obj_visita', 'objeto', 'vistoria', 'A visita técnica ou vistoria é obrigatória? Pode ser substituída por declaração?', ['visita tecnica vistoria declaracao conhecimento']],

  // Habilitação
  ['hab_lista', 'habilitacao', 'geral', 'Quais documentos de habilitação são exigidos?', ['habilitacao documentos exigidos']],
  ['hab_juridica', 'habilitacao', 'juridica', 'O que é pedido na habilitação jurídica (contrato social, ato constitutivo)?', ['habilitacao juridica contrato social ato constitutivo']],
  ['hab_fiscal', 'habilitacao', 'fiscal', 'Quais certidões de regularidade fiscal e trabalhista são exigidas?', ['regularidade fiscal certidao fgts trabalhista cndt federal estadual municipal']],
  ['hab_atestado', 'habilitacao', 'tecnica', 'Que atestado de capacidade técnica é exigido? Há quantidade mínima ou percentual?', ['atestado capacidade tecnica percentual quantidade minima']],
  ['hab_profissional', 'habilitacao', 'tecnica', 'É exigido responsável técnico ou profissional com registro em conselho?', ['responsavel tecnico profissional registro conselho crea cat']],
  ['hab_balanco', 'habilitacao', 'economica', 'O que se exige de qualificação econômico-financeira (balanço, índices, capital mínimo)?', ['balanco patrimonial indices liquidez capital social patrimonio liquido']],
  ['hab_falencia', 'habilitacao', 'economica', 'É exigida certidão negativa de falência ou recuperação judicial? Com que validade?', ['falencia recuperacao judicial certidao']],
  ['hab_declaracoes', 'habilitacao', 'declaracoes', 'Quais declarações preciso assinar e enviar?', ['declaracao menor inidoneidade reserva cargos fatos impeditivos']],
  ['hab_momento', 'habilitacao', 'prazo', 'Quando os documentos de habilitação devem ser enviados — com a proposta ou só pelo vencedor?', ['habilitacao envio vencedor convocacao prazo horas']],
  ['hab_sicaf', 'habilitacao', 'cadastro', 'O cadastro no SICAF ou em cadastro do órgão substitui documentos?', ['sicaf cadastro unificado substitui']],

  // Pagamentos
  ['pag_prazo', 'pagamentos', 'prazo', 'Em quantos dias o órgão paga depois da entrega e do aceite?', ['pagamento prazo dias nota fiscal liquidacao']],
  ['pag_forma', 'pagamentos', 'forma', 'Como é feito o pagamento (por etapa, mensal, na entrega)?', ['pagamento medicao mensal etapa parcela']],
  ['pag_reajuste', 'pagamentos', 'reajuste', 'Há reajuste de preço? Por qual índice e depois de quanto tempo?', ['reajuste indice ipca igpm repactuacao doze meses']],
  ['pag_atraso', 'pagamentos', 'atraso', 'O que o edital prevê se o órgão atrasar o pagamento (juros, correção)?', ['atraso pagamento juros correcao monetaria compensacao']],
  ['pag_retencao', 'pagamentos', 'tributos', 'Há retenção de impostos ou exigência de nota fiscal específica?', ['retencao imposto tributos nota fiscal']],
  ['pag_dotacao', 'pagamentos', 'orcamento', 'Qual é a dotação orçamentária ou a fonte de recursos?', ['dotacao orcamentaria recursos fonte elemento despesa']],

  // Riscos e penalidades
  ['risco_multa_atraso', 'riscos', 'multa', 'Qual é a multa por atraso na entrega ou na execução?', ['multa atraso mora percentual dia']],
  ['risco_multa_inexecucao', 'riscos', 'multa', 'Qual é a multa por inexecução parcial ou total?', ['multa inexecucao parcial total']],
  ['risco_sancoes', 'riscos', 'sancao', 'Quais sanções o edital prevê (impedimento, inidoneidade) e em que casos?', ['sancoes impedimento licitar inidoneidade advertencia']],
  ['risco_garantia_contrato', 'riscos', 'garantia', 'É exigida garantia contratual ou de proposta? Qual percentual e modalidade?', ['garantia contratual proposta percentual seguro fianca caucao']],
  ['risco_desistencia', 'riscos', 'proposta', 'O que acontece se eu desistir depois de dar o lance ou não assinar o contrato?', ['desistencia recusa assinar contrato convocado lance']],
  ['risco_prazo_curto', 'riscos', 'prazo', 'Há algum prazo curto (entrega, envio de documento, correção) que possa me desclassificar?', ['prazo horas desclassificacao convocacao envio']],
  ['risco_custos_ocultos', 'riscos', 'custo', 'Há custos que não aparecem na planilha (frete, laudo, seguro, deslocamento)?', ['frete laudo seguro deslocamento despesas encargos por conta contratada']],
  ['risco_impugnacao', 'riscos', 'prazo', 'Até quando posso pedir esclarecimento ou impugnar o edital, e por onde?', ['impugnacao esclarecimento prazo dias uteis pedido']],
  ['risco_recurso', 'riscos', 'recurso', 'Como e em que prazo se apresenta recurso?', ['recurso intencao prazo razoes contrarrazoes']],
  ['risco_lgpd', 'riscos', 'dados', 'O edital traz obrigação de confidencialidade ou de proteção de dados (LGPD)?', ['lgpd protecao dados confidencialidade sigilo']],

  // Contrato
  ['ctr_obrigacoes', 'contrato', 'obrigacoes', 'Quais são as principais obrigações da contratada?', ['obrigacoes contratada']],
  ['ctr_fiscalizacao', 'contrato', 'gestao', 'Como será feita a fiscalização e o recebimento provisório e definitivo?', ['fiscalizacao recebimento provisorio definitivo fiscal gestor']],
  ['ctr_rescisao', 'contrato', 'extincao', 'Em que casos o contrato pode ser extinto ou rescindido?', ['extincao rescisao contrato hipoteses']],
  ['ctr_alteracao', 'contrato', 'alteracao', 'O órgão pode aumentar ou reduzir a quantidade contratada? Em que limite?', ['acrescimo supressao 25 por cento alteracao']],
];

const PERGUNTAS = LINHAS.map(([codigo, categoria, subtipo, pergunta, termos]) => ({
  codigo,
  categoria,
  subtipo,
  pergunta,
  termos,
}));

const PORCODIGO = new Map(PERGUNTAS.map((p) => [p.codigo, p]));

module.exports = { CATEGORIAS, PERGUNTAS, PORCODIGO };
