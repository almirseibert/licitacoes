-- Seção 1c do PLANO_SAAS_CONLICITACAO.md — a correção manual da exigência
-- passa a ser da organização.
--
-- `licitacao_exigencias` é catálogo: o que a leitura do edital achou, igual
-- para todo cliente. Até aqui, "confirmar à mão" gravava na própria linha do
-- catálogo (`confirmado_por_usuario`), e a decisão de uma organização valia
-- para todas — e a leitura seguinte, que preserva a linha confirmada, a
-- congelava para todo mundo.
--
-- Esta migração:
--   1. cria `org_exigencias` (organização × licitação × código): o que a
--      organização afirmou vale na visão dela e passa na frente do catálogo;
--   2. copia as confirmações que já existiam para a organização 1 (quem usava
--      o painel antes da base multiempresa — mesmo critério da 018);
--   3. manda reler o edital das licitações afetadas: a linha do catálogo tinha
--      o valor digitado no lugar do lido, e só uma nova leitura o restaura;
--   4. zera `recorrencias.grupo`: era o grupo da organização operadora gravado
--      num catálogo de todos, e nenhuma tela o lê (o job deixa de gravá-lo);
--      (e `concorrentes.menor_preco_json` / `grupos`, pelo mesmo motivo);
--   5. APAGA `confirmado_por_usuario` do catálogo. É de propósito: o que ainda
--      lesse a coluna passa a falhar alto, em vez de congelar em silêncio.

CREATE TABLE IF NOT EXISTS org_exigencias (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  organizacao_id INT NOT NULL,
  licitacao_id   INT NOT NULL,
  codigo         VARCHAR(40) NOT NULL,
  detectado      ENUM('sim','nao','negado','indefinido') NOT NULL,
  usuario_id     INT NULL,
  criado_em      DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_org_exigencia (organizacao_id, licitacao_id, codigo),
  INDEX idx_org_exigencia_licitacao (licitacao_id),
  CONSTRAINT fk_org_exigencia_organizacao FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_org_exigencia_licitacao FOREIGN KEY (licitacao_id) REFERENCES licitacoes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO org_exigencias (organizacao_id, licitacao_id, codigo, detectado)
SELECT 1, licitacao_id, codigo, detectado
  FROM licitacao_exigencias
 WHERE confirmado_por_usuario = 1
ON DUPLICATE KEY UPDATE detectado = VALUES(detectado);

UPDATE licitacoes
   SET exigencias_status = 'nao_lido'
 WHERE id IN (SELECT licitacao_id FROM (
         SELECT DISTINCT licitacao_id FROM licitacao_exigencias WHERE confirmado_por_usuario = 1
       ) confirmadas)
   AND arquivos_status IN ('ok', 'parcial');

ALTER TABLE licitacao_exigencias DROP COLUMN confirmado_por_usuario;

UPDATE recorrencias SET grupo = NULL;

-- Idem para a ficha do concorrente: "menor preço por grupo" e "grupos em que disputa"
-- eram do grupo da operadora; passam a ser calculados na leitura, por organização.
UPDATE concorrentes SET menor_preco_json = NULL, grupos = NULL;
