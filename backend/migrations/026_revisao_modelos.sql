-- Seção 10 (simplify) — duas regras que o banco passa a guardar sozinho.
--
-- 1) `revisado_em` sempre preenchido: a entrada no cofre conta como a primeira
--    conferência. O dia é o de Brasília (criado_em é UTC; -03:00 o ano inteiro
--    desde 2019). Assim o job, o dashboard e a tela comparam a mesma coluna, sem
--    conversão de fuso em cada consulta.
UPDATE empresa_documentos
   SET revisado_em = DATE(CONVERT_TZ(criado_em, '+00:00', '-03:00'))
 WHERE revisado_em IS NULL;

-- 2) Um modelo do sistema por código e título, de verdade: o índice da 017 leva
--    `organizacao_id`, NULL no modelo do sistema, e NULL não colide. A coluna
--    gerada troca o NULL por 0 (mesmo recurso da 024). As cópias já saíram na 025.
ALTER TABLE modelos_declaracao
  ADD COLUMN escopo_org INT AS (COALESCE(organizacao_id, 0)) STORED AFTER organizacao_id;
ALTER TABLE modelos_declaracao DROP INDEX uq_modelo_sistema;
CREATE UNIQUE INDEX uq_modelo_sistema ON modelos_declaracao (escopo_org, codigo, padrao_sistema, titulo);
