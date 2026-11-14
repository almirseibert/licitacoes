// As 20 perguntas de teste do Consultor jurídico (aceite da Seção 16 do plano).
//
// `esperado` são os ids da base (config/dados/juridico.js) em que a resposta certa se
// apoia: o teste sem rede confere que a BUSCA põe um deles entre os artigos enviados ao
// modelo (sem isso a resposta correta é impossível). A conferência final — o texto que o
// modelo escreve com o artigo certo — é do advogado revisor, com `npm run juridico -- --teste`.
// Perguntas escritas como o cliente escreve, não como a lei.
module.exports = [
  { pergunta: 'Até quando posso impugnar um edital?', esperado: ['lei-art-164'] },
  { pergunta: 'Em quanto tempo preciso entrar com recurso depois de ser desclassificado?', esperado: ['lei-art-165'] },
  { pergunta: 'O recurso suspende a licitação?', esperado: ['lei-art-168'] },
  { pergunta: 'Qual o limite da multa por atraso na entrega?', esperado: ['lei-art-156'] },
  { pergunta: 'Posso trocar uma certidão que venceu depois de abrir as propostas?', esperado: ['lei-art-64', 'lc123-art-43'] },
  { pergunta: 'Quanto o órgão pode pedir de garantia do contrato?', esperado: ['lei-art-96'] },
  { pergunta: 'Qual é o limite da garantia de proposta?', esperado: ['lei-art-58'] },
  { pergunta: 'Como funciona o empate ficto para ME e EPP no pregão?', esperado: ['lc123-art-44'] },
  { pergunta: 'Minha certidão do FGTS está com restrição e sou EPP, tenho prazo para regularizar?', esperado: ['lc123-art-43'] },
  { pergunta: 'O edital pode exigir uma marca específica?', esperado: ['lei-art-41'] },
  { pergunta: 'Qual o prazo mínimo entre a publicação do edital e a abertura do pregão?', esperado: ['lei-art-55'] },
  { pergunta: 'O que significa preço inexequível?', esperado: ['lei-art-59'] },
  { pergunta: 'Quanto tempo vale a ata de registro de preços?', esperado: ['lei-art-82'] },
  { pergunta: 'Até quantos anos posso ter um contrato de serviço contínuo?', esperado: ['lei-art-106'] },
  { pergunta: 'Posso pedir reequilíbrio quando o custo sobe por um fato imprevisível?', esperado: ['lei-art-124-d'] },
  { pergunta: 'O órgão pode me pagar adiantado?', esperado: ['lei-art-145'] },
  { pergunta: 'Posso subcontratar parte do serviço?', esperado: ['lei-art-122'] },
  { pergunta: 'Qual o limite de dispensa de licitação para compras?', esperado: ['lei-art-75'] },
  { pergunta: 'Quanto tempo dura uma declaração de inidoneidade?', esperado: ['lei-art-156'] },
  { pergunta: 'O que diz o art. 71 da lei sobre revogar a licitação?', esperado: ['lei-art-71'] },
];
