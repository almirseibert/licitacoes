-- Seção 18.2 — o modelo "exclusivo_me" dizia sempre "MICROEMPRESA", mesmo para
-- quem está cadastrado como EPP em `empresa_perfis.natureza` (ENUM ME/EPP/LTDA/
-- Outra, migração 002): a empresa assinaria um porte que não é o dela. O texto
-- passa a usar {{porte}} (resolvido em backend/servicos/declaracao.js a partir
-- de `natureza`); aqui só atualiza o corpo do modelo de sistema já semeado — o
-- seed nunca sobrescreve modelo existente (ver semearModelos), então sem esta
-- migração quem já rodou `npm run semear` antes ficaria com o texto velho.
-- Também entram os dois modelos novos (manutencao_habilitacao e
-- simples_nacional) para quem já tinha os treze antigos e não ganharia os
-- novos sozinho, pelo mesmo motivo.
UPDATE modelos_declaracao
   SET corpo = REPLACE(corpo, 'se enquadra como MICROEMPRESA', 'se enquadra como {{porte}}')
 WHERE organizacao_id IS NULL AND padrao_sistema = 1 AND codigo = 'exclusivo_me'
   AND corpo LIKE '%se enquadra como MICROEMPRESA%';

INSERT INTO modelos_declaracao (codigo, titulo, corpo, padrao_sistema, ativo)
SELECT 'manutencao_habilitacao', 'Declaração de manutenção das condições de habilitação',
       'A empresa {{razao_social}}, inscrita no CNPJ sob o nº {{cnpj}}, por intermédio de seu representante legal, {{representante}}, DECLARA, nos termos do art. 92, XVI, da Lei nº 14.133/2021, que se compromete a manter, durante toda a execução do contrato decorrente da licitação {{modalidade}} nº {{numero_licitacao}}{{processo_frase}}, promovida por {{orgao}}, todas as condições de habilitação e qualificação exigidas na licitação.\n\nDECLARA, ainda, estar ciente de que o descumprimento desta obrigação sujeita a contratada às sanções previstas no edital e na legislação aplicável.',
       1, 1
 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM modelos_declaracao WHERE organizacao_id IS NULL AND padrao_sistema = 1 AND codigo = 'manutencao_habilitacao');

INSERT INTO modelos_declaracao (codigo, titulo, corpo, padrao_sistema, ativo)
SELECT 'simples_nacional', 'Declaração de opção pelo Simples Nacional',
       'A empresa {{razao_social}}, inscrita no CNPJ sob o nº {{cnpj}}, por intermédio de seu representante legal, {{representante}}, DECLARA, para os fins do art. 4º, §§ 1º e 2º, da Lei Complementar nº 123/2006, que é optante pelo Regime Especial Unificado de Arrecadação de Tributos e Contribuições devidos pelas Microempresas e Empresas de Pequeno Porte (Simples Nacional), de que trata a Lei Complementar nº 123/2006, e que não se encontra em nenhuma das situações de exclusão do regime previstas no art. 17 da mesma lei.\n\nDeclaração prestada no âmbito da licitação {{modalidade}} nº {{numero_licitacao}}, promovida por {{orgao}}, para fins de retenção de tributos e emissão de nota fiscal.',
       1, 1
 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM modelos_declaracao WHERE organizacao_id IS NULL AND padrao_sistema = 1 AND codigo = 'simples_nacional');
