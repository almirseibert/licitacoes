-- A IA deixou de rodar sozinha (decisão de 20/11/2026): só por clique de quem usa o painel.
-- Tarefas de IA que ainda estavam na fila de antes dessa decisão seriam executadas uma última
-- vez pelo worker; aqui elas são apagadas para não gastar crédito sem interação humana.
DELETE FROM tarefas
 WHERE tipo IN ('ia_resumo', 'sugerir_palavras')
   AND status = 'fila';
