-- Fase 5.1 — Gerador de declarações (seção 18).

CREATE TABLE IF NOT EXISTS modelos_declaracao (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  codigo         VARCHAR(40) NOT NULL,      -- catálogo da seção 8, quando houver
  titulo         VARCHAR(160) NOT NULL,
  corpo          MEDIUMTEXT NOT NULL,       -- texto com variáveis {{...}}
  perfil_id      INT NULL,                  -- NULL = serve a qualquer perfil
  ativo          TINYINT(1) DEFAULT 1,
  padrao_sistema TINYINT(1) DEFAULT 0,      -- modelo do seed: duplicável, nunca alterado
  criado_em      DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_codigo (codigo, ativo),
  CONSTRAINT fk_modelo_perfil FOREIGN KEY (perfil_id) REFERENCES empresa_perfis(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Um modelo do sistema por código; as cópias do usuário ficam livres.
CREATE UNIQUE INDEX uq_modelo_sistema ON modelos_declaracao (codigo, padrao_sistema, titulo);
