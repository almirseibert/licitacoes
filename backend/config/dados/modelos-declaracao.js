// Os treze modelos do seed (seção 18.2; os dois últimos, Seção 10 do plano SaaS).
//
// São modelos GENÉRICOS, redigidos conforme a Lei 14.133/2021 e a LC 123/2006.
// Quando o edital traz anexo próprio de declaração, o anexo do edital é que
// vale — a tela avisa isso, e o painel oferece o arquivo do edital no lugar.
//
// O usuário nunca edita estes: duplica e edita a cópia. É o que garante que um
// ajuste feito às pressas numa disputa não estrague o modelo da próxima.
module.exports = [
  {
    codigo: 'menor',
    titulo: 'Declaração de não emprego de menor',
    corpo: `A empresa {{razao_social}}, inscrita no CNPJ sob o nº {{cnpj}}, por intermédio de seu representante legal, {{representante}}, portador do CPF nº {{cpf_representante}}, DECLARA, para fins do disposto no art. 63, inciso IV, da Lei nº 14.133/2021 e no art. 7º, inciso XXXIII, da Constituição Federal, que não emprega menor de 18 (dezoito) anos em trabalho noturno, perigoso ou insalubre e não emprega menor de 16 (dezesseis) anos.

Ressalva: emprega menor, a partir de 14 (quatorze) anos, na condição de aprendiz ( ).

Declaração prestada no âmbito da licitação {{modalidade}} nº {{numero_licitacao}}, promovida por {{orgao}}.`,
  },
  {
    codigo: 'pcd',
    titulo: 'Declaração de reserva de cargos para pessoa com deficiência',
    corpo: `A empresa {{razao_social}}, inscrita no CNPJ sob o nº {{cnpj}}, por intermédio de seu representante legal, {{representante}}, DECLARA, sob as penas da lei, que cumpre as exigências de reserva de cargos para pessoa com deficiência e para reabilitado da Previdência Social, previstas no art. 93 da Lei nº 8.213/1991 e no art. 63, inciso IV, da Lei nº 14.133/2021, e que atende às regras de acessibilidade previstas na legislação.

Declaração prestada no âmbito da licitação {{modalidade}} nº {{numero_licitacao}}, promovida por {{orgao}}.`,
  },
  {
    codigo: 'degradante',
    titulo: 'Declaração sobre trabalho degradante ou forçado',
    corpo: `A empresa {{razao_social}}, inscrita no CNPJ sob o nº {{cnpj}}, por intermédio de seu representante legal, {{representante}}, DECLARA que não possui, em sua cadeia produtiva, empregados executando trabalho degradante ou forçado, observando o disposto nos incisos III e IV do art. 1º e no inciso III do art. 5º da Constituição Federal.

Declaração prestada no âmbito da licitação {{modalidade}} nº {{numero_licitacao}}, promovida por {{orgao}}.`,
  },
  {
    codigo: 'proposta_indep',
    titulo: 'Declaração de elaboração independente de proposta',
    corpo: `A empresa {{razao_social}}, inscrita no CNPJ sob o nº {{cnpj}}, por intermédio de seu representante legal, {{representante}}, DECLARA que:

a) a proposta apresentada para a licitação {{modalidade}} nº {{numero_licitacao}} foi elaborada de maneira independente, e o seu conteúdo não foi, no todo ou em parte, direta ou indiretamente, informado, discutido ou recebido de qualquer outro participante potencial ou de fato;

b) não tentou, por qualquer meio ou pessoa, influir na decisão de qualquer outro participante quanto a participar ou não da referida licitação;

c) está plenamente ciente do teor e da extensão desta declaração e detém plenos poderes e informações para firmá-la.`,
  },
  {
    codigo: 'vinculo_servidor',
    titulo: 'Declaração de inexistência de vínculo com servidor público',
    corpo: `A empresa {{razao_social}}, inscrita no CNPJ sob o nº {{cnpj}}, por intermédio de seu representante legal, {{representante}}, DECLARA, para os fins do art. 9º da Lei nº 14.133/2021, que não possui em seu quadro societário, de direção ou de gerência, servidor público ou dirigente do órgão {{orgao}}, nem cônjuge, companheiro ou parente em linha reta, colateral ou por afinidade, até o terceiro grau, de agente público que atue na presente contratação.

Declaração prestada no âmbito da licitação {{modalidade}} nº {{numero_licitacao}}.`,
  },
  {
    codigo: 'exclusivo_me',
    titulo: 'Declaração de enquadramento como ME/EPP',
    corpo: `A empresa {{razao_social}}, inscrita no CNPJ sob o nº {{cnpj}}, por intermédio de seu representante legal, {{representante}}, DECLARA, sob as penas da lei, que se enquadra como MICROEMPRESA nos termos do art. 3º da Lei Complementar nº 123/2006, e que não se enquadra em nenhuma das hipóteses de exclusão previstas no § 4º do mesmo artigo.

DECLARA, ainda, que pretende usufruir dos benefícios e do tratamento diferenciado previstos nos arts. 42 a 49 da Lei Complementar nº 123/2006 na licitação {{modalidade}} nº {{numero_licitacao}}, promovida por {{orgao}}.`,
  },
  {
    codigo: 'fato_impeditivo',
    titulo: 'Declaração de inexistência de fato impeditivo',
    corpo: `A empresa {{razao_social}}, inscrita no CNPJ sob o nº {{cnpj}}, por intermédio de seu representante legal, {{representante}}, DECLARA, sob as penas da lei, que até a presente data inexistem fatos impeditivos de sua habilitação na licitação {{modalidade}} nº {{numero_licitacao}}, promovida por {{orgao}}, e que não foi declarada inidônea nem está suspensa ou impedida de licitar e contratar com a Administração Pública.

DECLARA, ainda, estar ciente da obrigação de comunicar a ocorrência de qualquer fato impeditivo superveniente.`,
  },
  {
    codigo: 'cumpre_requisitos',
    titulo: 'Declaração de cumprimento dos requisitos de habilitação',
    corpo: `A empresa {{razao_social}}, inscrita no CNPJ sob o nº {{cnpj}}, por intermédio de seu representante legal, {{representante}}, DECLARA, nos termos do art. 63, inciso I, da Lei nº 14.133/2021, que cumpre plenamente os requisitos de habilitação exigidos na licitação {{modalidade}} nº {{numero_licitacao}}, promovida por {{orgao}}, cujo objeto é: {{objeto}}

DECLARA estar ciente de que a prestação de declaração falsa sujeita a licitante às sanções previstas em lei.`,
  },
  {
    codigo: 'lgpd',
    titulo: 'Declaração de conformidade com a LGPD',
    corpo: `A empresa {{razao_social}}, inscrita no CNPJ sob o nº {{cnpj}}, por intermédio de seu representante legal, {{representante}}, DECLARA que, na execução do objeto da licitação {{modalidade}} nº {{numero_licitacao}}, promovida por {{orgao}}, observará as disposições da Lei nº 13.709/2018 — Lei Geral de Proteção de Dados Pessoais, tratando os dados pessoais a que tiver acesso exclusivamente para as finalidades da contratação, adotando medidas técnicas e administrativas de segurança e comunicando ao Contratante qualquer incidente de segurança.`,
  },
  {
    codigo: 'elaboracao_independente',
    titulo: 'Declaração de não utilização de trabalho de terceiros em conluio',
    corpo: `A empresa {{razao_social}}, inscrita no CNPJ sob o nº {{cnpj}}, por intermédio de seu representante legal, {{representante}}, DECLARA que não mantém e não manterá, na execução do contrato decorrente da licitação {{modalidade}} nº {{numero_licitacao}}, qualquer forma de ajuste, combinação ou conluio com outros licitantes, e que não se valerá de interposta pessoa para participar do certame.`,
  },
  {
    codigo: 'ciencia_do_edital',
    titulo: 'Declaração de ciência e concordância com o edital',
    corpo: `A empresa {{razao_social}}, inscrita no CNPJ sob o nº {{cnpj}}, por intermédio de seu representante legal, {{representante}}, DECLARA que recebeu e examinou o edital da licitação {{modalidade}} nº {{numero_licitacao}}{{processo_frase}}, promovida por {{orgao}}, e seus anexos, e que concorda integralmente com as condições neles estabelecidas, nada tendo a opor.

DECLARA, ainda, que os preços propostos incluem todos os custos e despesas necessários ao cumprimento integral do objeto.`,
  },
  {
    codigo: 'renuncia_vistoria',
    titulo: 'Declaração de renúncia à vistoria técnica',
    corpo: `A empresa {{razao_social}}, inscrita no CNPJ sob o nº {{cnpj}}, por intermédio de seu representante legal, {{representante}}, portador do CPF nº {{cpf_representante}}, DECLARA, nos termos do art. 63, § 3º, da Lei nº 14.133/2021, que optou por não realizar a vistoria prevista no edital da licitação {{modalidade}} nº {{numero_licitacao}}, promovida por {{orgao}}, e que tem pleno conhecimento das condições e peculiaridades inerentes à natureza do objeto.

DECLARA, ainda, que assume total responsabilidade por esse fato e que não utilizará a falta de vistoria para quaisquer questionamentos futuros que ensejem avenças técnicas ou financeiras com o Contratante.`,
  },
  {
    codigo: 'carta_credenciamento',
    titulo: 'Carta de credenciamento',
    corpo: `A empresa {{razao_social}}, inscrita no CNPJ sob o nº {{cnpj}}, por intermédio de seu representante legal, {{representante}}, portador do CPF nº {{cpf_representante}}, CREDENCIA o(a) Sr.(a) ____________, portador(a) do RG nº ____________ e do CPF nº ____________, para representá-la na licitação {{modalidade}} nº {{numero_licitacao}}{{processo_frase}}, promovida por {{orgao}}, conferindo-lhe poderes para formular ofertas e lances, manifestar intenção de recurso e dela desistir, assinar atas e praticar todos os demais atos inerentes ao certame em nome da representada.

Acompanha esta carta cópia do ato constitutivo que comprova os poderes de quem a assina.`,
  },
];
