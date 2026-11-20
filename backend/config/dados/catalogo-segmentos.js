// Catálogo de segmentos do painel (decisão de 20/11/2026): Área → Segmento, para o preço de
// referência e a análise de mercado cobrirem QUALQUER tipo de licitação, não só os três grupos de
// palavras-chave do começo (Serviços digitais, Frota e rastreamento, Informática e itens).
//
// Como cada objeto cai num segmento: `regras/segmentos.js` procura os `termos` no texto do objeto.
//  - termo comum casa no INÍCIO de palavra: "medicament" pega medicamento e medicamentos;
//  - termo terminado em "!" só casa a palavra inteira: "ti!" não pega "estimativa";
//  - termo com mais de uma palavra casa a sequência ("material escolar");
//  - `excluir` descarta o segmento quando aparece (ex.: "veicular" não é "limpeza veicular").
// Tudo em minúsculas e SEM acento — o classificador tira o acento do objeto antes de comparar.
//
// Objeto que não casa com nada vira "Outros › Sem classificação": aparece na contagem, nunca some,
// e mostra o que ainda falta ensinar ao catálogo.
const CATALOGO = [
  {
    area: 'Tecnologia da informação',
    segmentos: [
      { nome: 'Software e sistemas', termos: ['software', 'sistema de gestao', 'sistema informatizado', 'aplicativo', 'licenca de uso', 'saas!', 'plataforma digital', 'desenvolvimento de sistema', 'site institucional', 'portal web'] },
      { nome: 'Computadores e informática', termos: ['computador', 'notebook', 'desktop', 'monitor de video', 'servidor de rede', 'impressora', 'toner', 'cartucho', 'nobreak', 'tablet', 'switch de rede', 'roteador', 'periferico', 'microcomputador', 'storage', 'informatica', 'equipamento de informatica'], excluir: ['veiculo'] },
      { nome: 'Telecom e conectividade', termos: ['telefonia', 'link de internet', 'internet', 'satelite', 'kit de internet', 'internet banda', 'link dedicado', 'telecomunicac', 'cabeamento estruturado', 'voip', 'central telefonica', 'radio comunicador', 'fibra optica'] },
      { nome: 'Rastreamento e telemetria', termos: ['rastreamento', 'rastreador', 'telemetria', 'monitoramento veicular', 'gps', 'localizacao veicular', 'tacografo'] },
      { nome: 'Suporte e infraestrutura de TI', termos: ['suporte tecnico de informatica', 'manutencao de computador', 'outsourcing de impressao', 'locacao de impressora', 'datacenter', 'hospedagem de sistema', 'backup', 'seguranca da informacao', 'certificado digital', 'suporte de ti', 'service desk'] },
    ],
  },
  {
    area: 'Obras e engenharia',
    segmentos: [
      { nome: 'Obras e reformas', termos: ['obra de', 'reforma', 'telhado', 'telha', 'obra de', 'obras de', 'construcao de', 'reforma de', 'reforma e ampliacao', 'ampliacao de', 'edificacao', 'construcao civil', 'execucao de obra', 'quadra poliesportiva', 'cobertura de quadra'], excluir: ['medicamento'] },
      { nome: 'Pavimentação e drenagem', termos: ['pavimentacao', 'asfalto', 'asfaltic', 'recapeamento', 'paralelepipedo', 'drenagem', 'bueiro', 'meio-fio', 'calcamento', 'cbuq', 'tapa-buraco', 'tapa buraco', 'sinalizacao viaria', 'sinalizacao horizontal', 'sinalizacao', 'placas de sinalizacao', 'estrada', 'vicinal', 'patrolamento', 'cascalho'] },
      { nome: 'Projetos e consultoria de engenharia', termos: ['projeto executivo', 'projeto de engenharia', 'projeto arquitetonico', 'elaboracao de projeto', 'fiscalizacao de obra', 'topografia', 'levantamento topografico', 'laudo tecnico', 'engenharia consultiva', 'gerenciamento de obra'] },
      { nome: 'Manutenção predial', termos: ['manutencao predial', 'manutencao preventiva e corretiva de predio', 'servicos de pintura', 'impermeabilizacao', 'servicos de manutencao de imovel', 'conserto de telhado', 'reparos prediais'] },
      { nome: 'Material de construção', termos: ['material de construcao', 'artefato de concreto', 'concreto', 'ferramenta', 'cimento', 'areia e brita', 'tijolo', 'argamassa', 'ferragem', 'tubos e conexoes', 'concreto usinado', 'cal hidratada', 'madeira serrada', 'tinta', 'ferramentas manuais'] },
    ],
  },
  {
    area: 'Saúde',
    segmentos: [
      { nome: 'Medicamentos', termos: ['medicament', 'farmaco', 'insulina', 'vacina', 'comprimido', 'injetavel', 'soro fisiologico', 'antibiotic', 'anticoncepcional', 'farmacia basica', 'psicotropico'] },
      { nome: 'Material médico-hospitalar', termos: ['material medico', 'material hospitalar', 'medico-hospitalar', 'medico hospitalar', 'seringa', 'agulha', 'luva de procedimento', 'luvas cirurgic', 'gaze', 'curativo', 'sonda', 'cateter', 'material de enfermagem', 'descartavel hospitalar', 'mascara cirurgica', 'esparadrapo'] },
      { nome: 'Equipamentos médicos', termos: ['equipamento medico', 'equipamento hospitalar', 'ultrassom', 'raio-x', 'raio x', 'desfibrilador', 'monitor multiparametro', 'autoclave', 'cadeira de rodas', 'maca', 'ventilador pulmonar', 'eletrocardiografo', 'oximetro', 'cama hospitalar', 'tomografo'] },
      { nome: 'Serviços de saúde', termos: ['servicos medicos', 'plantao medico', 'consulta especializada', 'exames de imagem', 'servico de saude', 'clinica', 'hemodialise', 'cirurgia', 'atendimento ambulatorial', 'ambulatorial', 'fisioterapia', 'psicolog', 'fonoaudiolog', 'cooperativa medica', 'tfd!', 'internacao'] },
      { nome: 'Odontologia', termos: ['odontolog', 'dentari', 'resina composta', 'anestesico odontologico', 'cadeira odontologica', 'protese dentaria'] },
      { nome: 'Laboratório e reagentes', termos: ['reagente', 'laboratorio', 'vidraria', 'produtos para saude', 'laboratorial', 'analises clinicas', 'exames laboratoriais', 'kit diagnostico', 'tubo de coleta', 'laboratorio de analises'] },
    ],
  },
  {
    area: 'Alimentação',
    segmentos: [
      { nome: 'Gêneros alimentícios', termos: ['genero alimenticio', 'generos alimenticios', 'alimento', 'carne', 'queijo', 'pescado', 'peixe', 'embutido', 'arroz', 'feijao', 'carne bovina', 'frango', 'hortifruti', 'frutas', 'verduras', 'leite', 'pao!', 'pae!', 'panificacao', 'cesta basica', 'acucar', 'oleo de soja', 'macarrao', 'farinha', 'ovo!'], excluir: ['animal', 'racao'] },
      { nome: 'Merenda e refeições', termos: ['merenda', 'alimentacao escolar', 'refeicao', 'refeicoes', 'marmitex', 'fornecimento de alimentacao', 'cozinha industrial', 'coffee break', 'lanche', 'buffet', 'catering', 'restaurante'] },
      { nome: 'Água e bebidas', termos: ['agua mineral', 'galao de agua', 'bebida', 'suco', 'refrigerante', 'cafe!', 'agua potavel'] },
    ],
  },
  {
    area: 'Veículos e transporte',
    segmentos: [
      { nome: 'Aquisição de veículos', termos: ['aquisicao de veiculo', 'veiculo', 'automotor', 'utilitario', 'zero quilometro', 'veiculo zero', 'veiculo 0 km', 'caminhonete', 'onibus', 'microonibus', 'ambulancia', 'automovel', 'motocicleta', 'caminhao', 'van!', 'pick-up', 'pickup', 'retroescavadeira', 'trator', 'motoniveladora', 'pa carregadeira', 'escavadeira', 'rolo compactador', 'maquina pesada'] },
      { nome: 'Peças e manutenção de veículos', termos: ['manutencao de veiculo', 'manutencao da frota', 'pecas automotiv', 'pecas e acessorios', 'peca para', 'oficina mecanica', 'funilaria', 'revisao de veiculo', 'servicos mecanicos', 'lavagem de veiculo', 'bateria automotiva', 'autopecas', 'reparo de maquina'] },
      { nome: 'Combustíveis e lubrificantes', termos: ['combustivel', 'combustiveis', 'gasolina', 'diesel', 'etanol', 'oleo lubrificante', 'oleo', 'lubrificante', 'gnv!', 'arla', 'abastecimento de veiculo', 'gerenciamento de abastecimento', 'cartao de abastecimento'] },
      { nome: 'Pneus e câmaras', termos: ['pneu', 'pneumatico', 'camara de ar', 'recapagem', 'recauchutagem', 'alinhamento e balanceamento'] },
      { nome: 'Locação de veículos', termos: ['locacao de veiculo', 'aluguel de veiculo', 'locacao de automovel', 'locacao de caminhao', 'locacao de onibus', 'locacao de maquinas', 'locacao de frota', 'locacao de caminhonete'] },
      { nome: 'Transporte e fretamento', termos: ['transporte escolar', 'fretamento', 'transporte de passageiros', 'transporte de alunos', 'transporte de pacientes', 'transporte coletivo', 'frete', 'transporte de', 'mudanca', 'transporte de carga', 'transporte rodoviario'] },
    ],
  },
  {
    area: 'Limpeza e conservação',
    segmentos: [
      { nome: 'Serviços de limpeza', termos: ['servicos de limpeza', 'limpeza e conservacao', 'limpeza predial', 'higienizacao', 'servente', 'copeiragem', 'asseio e conservacao', 'limpeza urbana', 'varricao', 'desinfeccao'], excluir: ['veicular'] },
      { nome: 'Material de limpeza e higiene', termos: ['material de limpeza', 'produtos de limpeza', 'detergente', 'desinfetante', 'sabao', 'papel higienico', 'papel toalha', 'saco de lixo', 'alcool em gel', 'vassoura', 'higiene pessoal', 'sabonete', 'hipoclorito', 'cloro'] },
      { nome: 'Jardinagem e roçada', termos: ['jardinagem', 'rocada', 'poda', 'paisagismo', 'manutencao de areas verdes', 'capina', 'corte de grama', 'arborizacao'] },
      { nome: 'Controle de pragas', termos: ['dedetizacao', 'desratizacao', 'controle de pragas', 'controle de vetores', 'descupinizacao', 'sanitizacao', 'imunizacao de ambientes'] },
      { nome: 'Resíduos e coleta de lixo', termos: ['coleta de lixo', 'coleta de residuos', 'residuos solidos', 'aterro sanitario', 'destinacao final', 'residuos de saude', 'cacambas', 'cacamba', 'entulho', 'reciclagem', 'residuos hospitalares', 'lixeira'] },
    ],
  },
  {
    area: 'Segurança',
    segmentos: [
      { nome: 'Vigilância e portaria', termos: ['vigilancia', 'seguranca patrimonial', 'portaria', 'vigilante', 'monitoramento eletronico', 'seguranca armada', 'controle de acesso', 'brigadista', 'guarda patrimonial', 'zeladoria'] },
      { nome: 'Câmeras e alarmes', termos: ['cftv', 'camera de seguranca', 'camera', 'cameras de monitoramento', 'alarme', 'cerca eletrica', 'videomonitoramento', 'sistema de seguranca eletronica', 'catraca', 'cancela'] },
      { nome: 'Uniformes e EPI', termos: ['uniforme', 'fardamento', 'luva', 'epi!', 'equipamento de protecao individual', 'calcado de seguranca', 'bota!', 'colete', 'camiseta', 'vestuario', 'jaleco', 'capacete'] },
      { nome: 'Combate a incêndio', termos: ['extintor', 'combate a incendio', 'incendio', 'hidrante', 'sprinkler', 'avcb', 'brigada de incendio', 'detector de fumaca', 'recarga de extintor'] },
    ],
  },
  {
    area: 'Educação e cultura',
    segmentos: [
      { nome: 'Material escolar e didático', termos: ['material escolar', 'material didatico', 'kit escolar', 'livro didatico', 'caderno', 'lapis', 'mochila escolar', 'jogos pedagogicos', 'brinquedo pedagogico', 'material pedagogico', 'apostila', 'lousa', 'quadro branco'] },
      { nome: 'Livros e acervo', termos: ['livro', 'livros', 'acervo bibliografico', 'biblioteca', 'periodico', 'assinatura de jornal', 'assinatura de revista'] },
      { nome: 'Cursos e treinamentos', termos: ['curso de', 'capacitacao', 'treinamento', 'palestra', 'oficina de', 'workshop', 'qualificacao profissional', 'formacao continuada', 'ensino a distancia', 'inscricao em curso', 'congresso'] },
      { nome: 'Shows e eventos culturais', termos: ['show!', 'apresentacao artistica', 'banda!', 'festival', 'evento cultural', 'carnaval', 'festa!', 'natal!', 'trio eletrico', 'palco!', 'sonorizacao', 'iluminacao de evento', 'cantor', 'artistas', 'festividade', 'locacao de brinquedo', 'brinquedo inflavel', 'recreacao'] },
    ],
  },
  {
    area: 'Mobiliário e escritório',
    segmentos: [
      { nome: 'Móveis', termos: ['mobiliario', 'movel', 'moveis', 'cadeira', 'mesa!', 'armario', 'estante', 'arquivo de aco', 'carteira escolar', 'bancada', 'poltrona', 'sofa', 'beliche', 'colchao', 'guarda-roupa'], excluir: ['hospitalar', 'odontolog', 'de rodas'] },
      { nome: 'Material de expediente', termos: ['material de expediente', 'material de escritorio', 'papel a4', 'papel sulfite', 'caneta', 'grampeador', 'pasta!', 'envelope', 'clips', 'fita adesiva', 'etiqueta', 'pen drive', 'agenda'] },
      { nome: 'Gráfica e impressos', termos: ['servicos graficos', 'grafica', 'impressao de', 'impressos', 'banner', 'folder', 'panfleto', 'cartaz', 'confeccao de placas', 'carimbo', 'cracha', 'plotagem', 'adesivo'] },
      { nome: 'Eletrodomésticos e utensílios', termos: ['eletrodomestico', 'geladeira', 'refrigerador', 'fogao', 'microondas', 'bebedouro', 'freezer', 'liquidificador', 'ventilador', 'utensilios domesticos', 'utensilio', 'panelas', 'louca', 'utensilio de cozinha', 'maquina de lavar', 'televisor', 'televisao'] },
    ],
  },
  {
    area: 'Energia e saneamento',
    segmentos: [
      { nome: 'Iluminação pública e energia elétrica', termos: ['iluminacao publica', 'energia eletrica', 'luminaria', 'lampada', 'led!', 'poste!', 'rede eletrica', 'subestacao', 'fornecimento de energia', 'transformador', 'manutencao da rede de iluminacao'] },
      { nome: 'Material elétrico', termos: ['material eletrico', 'fio e cabo', 'cabos eletricos', 'disjuntor', 'tomada', 'interruptor', 'quadro de distribuicao', 'eletroduto', 'reator', 'pilhas e baterias', 'bateria estacionaria'] },
      { nome: 'Energia solar e geradores', termos: ['energia solar', 'fotovoltaic', 'painel solar', 'gerador de energia', 'grupo gerador', 'usina solar', 'inversor solar', 'gerador'] },
      { nome: 'Água e saneamento', termos: ['saneamento', 'abastecimento de agua', 'rede de esgoto', 'esgotamento sanitario', 'poco artesiano', 'hidrometro', 'estacao de tratamento', 'adutora', 'bomba d agua', 'reservatorio de agua', 'caixa d agua', 'perfuracao de poco', 'conexoes hidraulicas', 'material hidraulico', 'tratamento de agua', 'ligacao de agua', 'polimero', 'sulfato de aluminio'] },
    ],
  },
  {
    area: 'Serviços profissionais',
    segmentos: [
      { nome: 'Consultoria e assessoria', termos: ['consultoria', 'assessoria', 'assessoramento', 'auditoria', 'estudo tecnico', 'pesquisa de mercado', 'planejamento estrategico', 'diagnostico', 'servicos tecnicos especializados', 'treinamento de gestores'] },
      { nome: 'Serviços jurídicos e contábeis', termos: ['servicos juridicos', 'assessoria juridica', 'advocaticios', 'advocacia', 'contabilidade', 'assessoria contabil', 'servicos contabeis', 'pericia judicial', 'pericia contabil', 'consultoria juridica', 'procuradoria'] },
      { nome: 'Publicidade e comunicação', termos: ['publicidade', 'propaganda', 'comunicacao social', 'divulgacao', 'midia', 'assessoria de imprensa', 'radio', 'jornal', 'agencia de publicidade', 'cobertura fotografica', 'producao audiovisual', 'filmagem', 'diario oficial', 'publicacao legal', 'outdoor', 'marketing'] },
      { nome: 'Seguros e serviços financeiros', termos: ['seguro de', 'seguros', 'apolice', 'pagamento', 'cartao de credito', 'servico financeiro', 'instituicao financeira', 'seguro garantia', 'corretagem de seguros', 'servicos bancarios', 'folha de pagamento', 'consignado', 'credito consignado', 'tarifa bancaria'] },
      { nome: 'Viagens e hospedagem', termos: ['passagem aerea', 'passagens aereas', 'hospedagem', 'agenciamento de viagens', 'diaria de viagem', 'diarias de hospedagem', 'hotel', 'agencia de turismo', 'locacao de espaco para evento', 'organizacao de eventos', 'cerimonial'] },
      { nome: 'Mão de obra e terceirização', termos: ['mao de obra', 'terceirizacao', 'terceirizados', 'posto de trabalho', 'apoio administrativo', 'recepcionista', 'motorista', 'operador de maquina', 'auxiliar administrativo', 'agente de portaria', 'estagio', 'estagiario', 'cessao de mao de obra', 'agente de apoio'] },
    ],
  },
  {
    area: 'Agropecuária e meio ambiente',
    segmentos: [
      { nome: 'Insumos agrícolas', termos: ['semente', 'adubo', 'fertilizante', 'calcario agricola', 'defensivo agricola', 'agrotoxico', 'muda!', 'corretivo de solo', 'insumo agricola', 'patrulha agricola', 'distribuicao de calcario', 'silagem'] },
      { nome: 'Veterinária e pecuária', termos: ['veterinari', 'racao', 'gado!', 'bovino', 'inseminacao', 'castracao', 'animais', 'vacina antirrabica', 'canil', 'cavalo', 'pecuaria', 'cercas e arames', 'sal mineral'] },
      { nome: 'Equipamentos agrícolas', termos: ['implemento agricola', 'arado', 'grade aradora', 'plantadeira', 'pulverizador', 'colheitadeira', 'ensiladeira', 'roçadeira', 'motosserra', 'trator agricola', 'carreta agricola', 'distribuidor de calcario'] },
      { nome: 'Meio ambiente', termos: ['licenciamento ambiental', 'estudo ambiental', 'recuperacao de area degradada', 'educacao ambiental', 'epia', 'plano de gestao ambiental', 'reflorestamento', 'monitoramento ambiental', 'pgrs!', 'plano de residuos'] },
    ],
  },
  {
    area: 'Esporte, lazer e eventos',
    segmentos: [
      { nome: 'Material esportivo', termos: ['material esportivo', 'bola!', 'uniforme esportivo', 'trofeu', 'medalha', 'equipamento esportivo', 'rede de futebol', 'academia ao ar livre', 'playground', 'brinquedos de parque', 'quadra de areia', 'campo de futebol', 'grama sintetica'] },
      { nome: 'Eventos esportivos', termos: ['campeonato', 'torneio', 'evento esportivo', 'corrida de rua', 'jogos escolares', 'arbitragem', 'passeio ciclistico', 'olimpiada'] },
    ],
  },
  {
    area: 'Máquinas, equipamentos e manutenção',
    segmentos: [
      { nome: 'Ar-condicionado e climatização', termos: ['ar condicionado', 'ar-condicionado', 'climatizacao', 'split', 'refrigeracao', 'camara fria', 'exaustor', 'pmoc!', 'manutencao de ar'] },
      { nome: 'Elevadores e equipamentos prediais', termos: ['elevador', 'plataforma elevatoria', 'escada rolante', 'portao eletronico', 'interfone', 'automacao predial', 'bomba hidraulica', 'grupo motor-bomba', 'motor eletrico'] },
      { nome: 'Locação e manutenção de equipamentos', termos: ['locacao de equipamento', 'manutencao de equipamento', 'manutencao de maquina', 'copiadora', 'reprografia', 'fotocopiadora', 'locacao de maquina', 'assistencia tecnica', 'ferramentas eletricas', 'maquinas e equipamentos', 'compressor', 'solda'] },
    ],
  },
  {
    area: 'Assistência social',
    segmentos: [
      { nome: 'Kits e doações', termos: ['cesta de alimentos', 'kit de higiene', 'kit natalidade', 'enxoval', 'cobertor', 'agasalho', 'fralda', 'auxilio assistencial', 'assistencia social', 'colchonete', 'kit de enxoval', 'material para doacao', 'brinquedos para doacao', 'bolsa familia'] },
      { nome: 'Serviços socioassistenciais', termos: ['acolhimento institucional', 'cras!', 'creas!', 'casa de passagem', 'abrigo', 'servico de convivencia', 'idosos', 'asilo', 'instituicao de longa permanencia', 'oficinas socioeducativas', 'atendimento a populacao em situacao de rua'] },
    ],
  },
];

module.exports = { CATALOGO };
