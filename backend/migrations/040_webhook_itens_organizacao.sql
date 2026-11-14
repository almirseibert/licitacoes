-- Seção 14b do PLANO_SAAS_CONLICITACAO.md — `webhook_itens` passa a carregar `organizacao_id`.
--
-- A tabela só era alcançada pelo `webhook_id`, então a exportação e a exclusão LGPD não a viam
-- como "da organização" (a exclusão dependia do ON DELETE CASCADE do webhook). Com a coluna ela
-- entra na regra geral: toda tabela por organização leva `organizacao_id`.
ALTER TABLE webhook_itens ADD COLUMN organizacao_id INT NULL AFTER webhook_id;
UPDATE webhook_itens wi JOIN webhooks w ON w.id = wi.webhook_id SET wi.organizacao_id = w.organizacao_id;
ALTER TABLE webhook_itens
  MODIFY organizacao_id INT NOT NULL,
  ADD INDEX idx_webitem_org (organizacao_id),
  ADD CONSTRAINT fk_webitem_org FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE;
