-- Seção 11 do PLANO_SAAS_CONLICITACAO.md — Resumo do Edital 2.0.
--
-- A ficha é do edital (catálogo compartilhado, como `ia_resumo` da seção 23):
-- gera uma vez e só refaz a pedido. O que é de cada organização são as
-- "considerações do licitante", numa tabela própria com organizacao_id.
ALTER TABLE licitacoes
  ADD COLUMN ia_ficha JSON NULL COMMENT 'Resumo do Edital 2.0, já validado (regras/resumo-edital.js)',
  ADD COLUMN ia_ficha_em DATETIME NULL;

CREATE TABLE IF NOT EXISTS resumo_consideracoes (
  organizacao_id  INT NOT NULL,
  licitacao_id    INT NOT NULL,
  texto           TEXT NOT NULL,
  usuario_id      INT NULL,
  atualizado_em   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (organizacao_id, licitacao_id),
  CONSTRAINT fk_consideracao_organizacao FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_consideracao_licitacao FOREIGN KEY (licitacao_id) REFERENCES licitacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_consideracao_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
