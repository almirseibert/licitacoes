-- Seção 10 do PLANO_SAAS_CONLICITACAO.md — documentos, declarações e agenda de portais.
--
-- O grupo do documento sai do catálogo de exigências (regras/documentos.js),
-- então não ganha coluna. O que ganha coluna é a revisão: documento sem
-- validade formal é conferido a cada 90 dias, a contar de `revisado_em` (ou da
-- entrada no cofre, enquanto ninguém conferiu).
ALTER TABLE empresa_documentos ADD COLUMN revisado_em DATE NULL AFTER valido_ate;

-- Agenda de portais: no lugar do cofre de senha que o projeto não faz.
-- Sem coluna de login, sem coluna de senha — conferido por SHOW COLUMNS no aceite.
CREATE TABLE IF NOT EXISTS org_portais (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  organizacao_id  INT NOT NULL,
  nome            VARCHAR(120) NOT NULL,
  url             VARCHAR(500) NULL,
  tipo            ENUM('compras','cadastro','certidao','outro') NOT NULL DEFAULT 'compras',
  login_vence_em  DATE NULL,                -- vencimento do cadastro no portal
  observacao      TEXT NULL,
  criado_por      INT NULL,
  criado_em       DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_portal_vencimento (organizacao_id, login_vence_em),
  CONSTRAINT fk_portal_organizacao FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_portal_criador FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Modelos de declaração do sistema duplicados pelo seed (o índice único da 017
-- leva `organizacao_id`, NULL no modelo do sistema, e NULL não colide). Fica o
-- mais antigo de cada código; item de kit que apontava para a cópia passa a
-- apontar para ele. O seed já não duplica (config/semear.js).
UPDATE documento_kit_itens i
  JOIN modelos_declaracao copia ON copia.id = i.modelo_id
  JOIN (SELECT codigo, MIN(id) AS id FROM modelos_declaracao
         WHERE organizacao_id IS NULL AND padrao_sistema = 1 GROUP BY codigo) original
    ON original.codigo = copia.codigo
   SET i.modelo_id = original.id
 WHERE copia.organizacao_id IS NULL AND copia.padrao_sistema = 1 AND copia.id <> original.id;

DELETE copia FROM modelos_declaracao copia
  JOIN (SELECT codigo, MIN(id) AS id FROM modelos_declaracao
         WHERE organizacao_id IS NULL AND padrao_sistema = 1 GROUP BY codigo) original
    ON original.codigo = copia.codigo
 WHERE copia.organizacao_id IS NULL AND copia.padrao_sistema = 1 AND copia.id <> original.id;
