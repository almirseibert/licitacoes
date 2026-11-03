// Perfil padrão da empresa (seção 4.7). Os CNAEs alimentam a checagem de objeto
// social da seção 6.2 — a `cobertura` está sem acento de propósito, porque a
// comparação é feita sobre o objeto normalizado.
//
// Ajustar os valores definitivos quando o contrato social for registrado. Daqui
// em diante tudo é editável pela tela de Configurações, sem deploy.
//
// O CNAE 8020-0/01 (monitoramento de sistemas de segurança eletrônico) ficou de
// fora de propósito: a Lei 14.967/2024 exige autorização da Polícia Federal e
// objeto social restrito a esse serviço. Rastreamento entra pela venda
// (4530-7/03), pela instalação (4520-0/07) e pelo software (6202-3/00).
module.exports = {
  nome: 'Studio Mythos ME',
  natureza: 'ME',
  regime: 'Simples Nacional',
  capital_social: 30000.0,
  padrao: 1,
  cnaes: [
    {
      codigo: '6201-5/01',
      principal: true,
      descricao: 'Desenvolvimento de programas de computador sob encomenda',
      cobertura: ['software', 'sistema', 'aplicativo', 'site', 'portal', 'desenvolvimento',
        'programa de computador', 'web', 'plataforma', 'chatbot', 'api', 'integracao'],
    },
    {
      codigo: '6202-3/00',
      descricao: 'Desenvolvimento e licenciamento de programas de computador customizaveis',
      cobertura: ['licenca de uso', 'locacao de software', 'licenciamento', 'customizavel',
        'sistema de gestao', 'modulo'],
    },
    {
      codigo: '6203-1/00',
      descricao: 'Desenvolvimento e licenciamento de programas de computador nao customizaveis',
      cobertura: ['software como servico', 'saas', 'assinatura de software', 'aplicativo pronto'],
    },
    {
      codigo: '6204-0/00',
      descricao: 'Consultoria em tecnologia da informacao',
      cobertura: ['consultoria', 'assessoria em ti', 'diagnostico', 'projeto de ti', 'levantamento'],
    },
    {
      codigo: '6209-1/00',
      descricao: 'Suporte tecnico, manutencao e outros servicos em tecnologia da informacao',
      cobertura: ['suporte tecnico', 'manutencao de sistema', 'help desk', 'service desk',
        'sustentacao', 'treinamento de sistema'],
    },
    {
      codigo: '6311-9/00',
      descricao: 'Tratamento de dados, provedores de servicos de aplicacao e servicos de hospedagem na internet',
      cobertura: ['hospedagem', 'host', 'data center', 'nuvem', 'cloud', 'armazenamento',
        'e-mail corporativo', 'backup', 'ssl', 'dominio'],
    },
    {
      codigo: '6319-4/00',
      descricao: 'Portais, provedores de conteudo e outros servicos de informacao na internet',
      cobertura: ['portal de noticias', 'transparencia', 'conteudo', 'publicacao web'],
    },
    {
      codigo: '7311-4/00',
      descricao: 'Agencias de publicidade',
      cobertura: ['marketing digital', 'redes sociais', 'midia social', 'campanha',
        'peca publicitaria', 'identidade visual', 'design'],
    },
    {
      codigo: '4751-2/01',
      descricao: 'Comercio varejista especializado de equipamentos e suprimentos de informatica',
      cobertura: ['material de informatica', 'suprimentos', 'toner', 'cartucho', 'mouse', 'teclado',
        'monitor', 'webcam', 'nobreak', 'pen drive', 'periferico'],
    },
    {
      codigo: '4651-6/01',
      descricao: 'Comercio atacadista de equipamentos e suprimentos de informatica',
      cobertura: ['fornecimento de equipamentos', 'registro de precos', 'lote de informatica',
        'notebook', 'computador', 'servidor', 'switch'],
    },
    {
      codigo: '9511-8/00',
      descricao: 'Reparacao e manutencao de computadores e de equipamentos perifericos',
      cobertura: ['manutencao de computadores', 'reparo', 'assistencia tecnica', 'conserto'],
    },
    {
      codigo: '4321-5/00',
      descricao: 'Instalacao e manutencao eletrica',
      cobertura: ['cabeamento estruturado', 'rede logica', 'ponto de rede', 'infraestrutura de rede'],
    },
    {
      codigo: '4530-7/03',
      descricao: 'Comercio a varejo de pecas e acessorios novos para veiculos automotores',
      cobertura: ['rastreador', 'equipamento de rastreamento', 'acessorio veicular'],
    },
    {
      codigo: '4520-0/07',
      descricao: 'Servicos de instalacao, manutencao e reparacao de acessorios para veiculos automotores',
      cobertura: ['instalacao de rastreador', 'instalacao veicular', 'manutencao de rastreador'],
    },
  ],
};
