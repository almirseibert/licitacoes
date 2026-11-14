-- Seção 11b do PLANO_SAAS_CONLICITACAO.md — a ficha do Resumo do Edital passa a ser gerada fora da
-- requisição (como o Pergunte ao Edital): um proxy reverso corta em 60 s e o modelo leva até 240 s.
--
-- O estado da geração mora na licitação (a ficha é do edital, não da organização): 'pendente' enquanto
-- o modelo trabalha, 'erro' com a mensagem para quem usa. NULL = nada em andamento (a ficha guardada,
-- se houver, vale). A reserva `pendente` é feita num UPDATE condicional, então dois pedidos ao mesmo
-- tempo não disparam dois modelos para o mesmo edital.
ALTER TABLE licitacoes
  ADD COLUMN ia_ficha_situacao ENUM('pendente','erro') NULL,
  ADD COLUMN ia_ficha_erro VARCHAR(500) NULL,
  ADD COLUMN ia_ficha_pedida_em DATETIME NULL,
  -- Quem reservou: só a execução dona da reserva fecha a geração (uma execução velha, que acorda depois de
  -- a reserva ter sido retomada por outra, não apaga o estado da nova).
  ADD COLUMN ia_ficha_reserva CHAR(32) NULL;
