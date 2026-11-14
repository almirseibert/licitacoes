-- Seção 1c — a ficha do concorrente passa a calcular na leitura o que dependia
-- do grupo das palavras-chave da organização operadora (a 037 já zerou os valores).
--
--   · `concorrentes.menor_preco_json` e `.grupos` e `recorrencias.grupo` saem do
--     catálogo: dado que depende de quem olha não mora numa tabela de todos, e
--     quem ainda os lesse passa a falhar alto em vez de receber NULL calado;
--   · o menor preço por grupo filtra os itens pelo CNPJ vencedor a cada abertura
--     da ficha, então a coluna ganha índice.
ALTER TABLE concorrentes DROP COLUMN menor_preco_json, DROP COLUMN grupos;
ALTER TABLE recorrencias DROP COLUMN grupo;
ALTER TABLE licitacao_itens ADD INDEX idx_item_vencedor (cnpj_vencedor, licitacao_id);
