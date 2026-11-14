-- Seção 15 do PLANO_SAAS_CONLICITACAO.md — "Meu desempenho".
--
-- A tela compara o desconto da organização com o do mercado buscando, para cada
-- participação, a linha de `historico_precos` pela `chave_externa`. O único índice
-- com essa coluna é `uq_historico (adaptador, chave_externa)`, em que ela é a segunda:
-- sem o `adaptador` à frente a busca varre a tabela, que é a que mais cresce.
ALTER TABLE historico_precos ADD KEY idx_hist_chave (chave_externa, sem_homologacao);
