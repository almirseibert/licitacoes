-- Fase 9 — Diagnóstico de descarte (seção 20).

-- A seção 20.1 fecha a lista de motivos, e ela não é a mesma do rascunho da
-- Fase 6: a spec ganha. A conversão fica aqui registrada, chave a chave, para
-- quem for ler o histórico depois entender por que o motivo mudou de nome.
--   exigencia      → exigencia_impossivel
--   objeto_fora    → fora_do_escopo
--   preco_inviavel → margem_insuficiente   (preço estimado que não fecha conta)
--   local          → exige_presenca
--   concorrencia   → concorrencia_alta
--   duplicada      → outro                 (a 20.1 não tem casa para ela)
-- `valor_baixo`, `prazo_curto` e `outro` já se chamavam assim.
UPDATE licitacoes SET motivo_descarte = 'exigencia_impossivel' WHERE motivo_descarte = 'exigencia';
UPDATE licitacoes SET motivo_descarte = 'fora_do_escopo'       WHERE motivo_descarte = 'objeto_fora';
UPDATE licitacoes SET motivo_descarte = 'margem_insuficiente'  WHERE motivo_descarte = 'preco_inviavel';
UPDATE licitacoes SET motivo_descarte = 'exige_presenca'       WHERE motivo_descarte = 'local';
UPDATE licitacoes SET motivo_descarte = 'concorrencia_alta'    WHERE motivo_descarte = 'concorrencia';
UPDATE licitacoes SET motivo_descarte = 'outro'                WHERE motivo_descarte = 'duplicada';

-- Quando o descarte aconteceu. `etapa_em` serve enquanto o card não se move de
-- novo; o período da tela de diagnóstico (90 dias, 6 ou 12 meses) precisa de
-- uma data que não mude depois, senão o passado se reescreve a cada arraste.
ALTER TABLE licitacoes ADD COLUMN descartado_em DATETIME NULL AFTER codigo_barrou;

UPDATE licitacoes
   SET descartado_em = COALESCE(etapa_em, criado_em)
 WHERE descartada = 1 AND descartado_em IS NULL;

-- O ranking da 20.2 varre por motivo e por código dentro de uma janela de
-- tempo: o índice é nessa ordem.
CREATE INDEX idx_descarte ON licitacoes (descartada, descartado_em);
CREATE INDEX idx_codigo_barrou ON licitacoes (codigo_barrou);
