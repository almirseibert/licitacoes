-- Fase 5 — Cofre de documentos e kits de envio (seções 4.7, 4.8, 9 e 17).

CREATE TABLE IF NOT EXISTS empresa_documentos (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  perfil_id      INT NOT NULL,
  codigo         VARCHAR(40) NOT NULL,     -- mesmo catálogo das exigências (seção 8.2)
  titulo         VARCHAR(160) NOT NULL,
  arquivo_path   VARCHAR(500),             -- relativo a DIR_DADOS
  nome_arquivo   VARCHAR(255),
  tamanho_bytes  BIGINT NULL,
  emitido_em     DATE NULL,
  valido_ate     DATE NULL,                -- NULL = sem validade formal
  renovavel_em   VARCHAR(255),             -- link ou instrução de onde renovar
  observacao     TEXT,
  versao         INT DEFAULT 1,
  ativo          TINYINT(1) DEFAULT 1,     -- versão antiga nunca é apagada, só desativada
  criado_em      DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_validade (valido_ate),
  INDEX idx_perfil_codigo (perfil_id, codigo, ativo),
  CONSTRAINT fk_documento_perfil FOREIGN KEY (perfil_id) REFERENCES empresa_perfis(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS documento_kits (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  perfil_id     INT NOT NULL,
  nome          VARCHAR(120) NOT NULL,
  descricao     VARCHAR(255),
  padrao        TINYINT(1) DEFAULT 0,
  ativo         TINYINT(1) DEFAULT 1,
  criado_em     DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_kit (perfil_id, nome),
  CONSTRAINT fk_kit_perfil FOREIGN KEY (perfil_id) REFERENCES empresa_perfis(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS documento_kit_itens (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  kit_id        INT NOT NULL,
  documento_id  INT NULL,                  -- documento fixo do cofre
  modelo_id     INT NULL,                  -- OU modelo de declaração (seção 18, Fase 5.1)
  codigo        VARCHAR(40) NOT NULL,
  ordem         INT NOT NULL,
  obrigatorio   TINYINT(1) DEFAULT 1,
  so_se_exigido TINYINT(1) DEFAULT 0,      -- só entra se o edital pedir esse código
  UNIQUE KEY uq_kit_codigo (kit_id, codigo),
  INDEX idx_kit (kit_id),
  CONSTRAINT fk_kit_item_kit FOREIGN KEY (kit_id) REFERENCES documento_kits(id) ON DELETE CASCADE,
  CONSTRAINT fk_kit_item_documento FOREIGN KEY (documento_id) REFERENCES empresa_documentos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pacotes (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  licitacao_id  INT NOT NULL,
  perfil_id     INT NOT NULL,
  kit_id        INT NULL,
  formato       ENUM('zip','pdf') DEFAULT 'pdf',
  arquivo_zip   VARCHAR(500),              -- caminho do pacote gerado, relativo a DIR_DADOS
  nome_arquivo  VARCHAR(255),
  tamanho_bytes BIGINT NULL,
  folhas        INT NULL,                  -- só no PDF único
  gerado_em     DATETIME DEFAULT CURRENT_TIMESTAMP,
  itens         JSON,                      -- [{codigo, documento_id, nome_no_pacote}]
  faltando      JSON,                      -- exigências sem documento correspondente
  observacao    TEXT,
  INDEX idx_licitacao (licitacao_id),
  CONSTRAINT fk_pacote_licitacao FOREIGN KEY (licitacao_id) REFERENCES licitacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_pacote_perfil FOREIGN KEY (perfil_id) REFERENCES empresa_perfis(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Documentos específicos da licitação, anexados na hora do envio (camada 3 da seção 17.2).
CREATE TABLE IF NOT EXISTS licitacao_anexos (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  licitacao_id  INT NOT NULL,
  titulo        VARCHAR(160) NOT NULL,
  nome_arquivo  VARCHAR(255),
  arquivo_path  VARCHAR(500),
  tamanho_bytes BIGINT NULL,
  criado_em     DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_lic (licitacao_id),
  CONSTRAINT fk_anexo_licitacao FOREIGN KEY (licitacao_id) REFERENCES licitacoes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
