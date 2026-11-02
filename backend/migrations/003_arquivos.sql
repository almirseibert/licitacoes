-- Fase 3 — Documentação da licitação (seções 4.5 e 7).

CREATE TABLE IF NOT EXISTS licitacao_arquivos (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  licitacao_id   INT NOT NULL,
  sequencial     INT,                        -- ordem no portal (01_, 02_...)
  titulo         VARCHAR(255),
  nome_arquivo   VARCHAR(255),
  extensao       VARCHAR(10),
  tamanho_bytes  BIGINT,
  caminho        VARCHAR(500),               -- relativo a DIR_DADOS
  url_origem     VARCHAR(500),
  hash_sha256    CHAR(64),
  status         ENUM('pendente','baixando','ok','erro','sem_arquivo') DEFAULT 'pendente',
  erro           VARCHAR(255),
  texto_extraido MEDIUMTEXT NULL,            -- preenchido na Fase 4
  criado_em      DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- O sequencial do portal é o que identifica o arquivo; é ele que torna o job idempotente.
  UNIQUE KEY uq_lic_arquivo (licitacao_id, sequencial),
  INDEX idx_lic (licitacao_id),
  CONSTRAINT fk_arquivo_licitacao FOREIGN KEY (licitacao_id) REFERENCES licitacoes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pasta da licitação no volume e estado do download, para a tela mostrar "3 de 7".
ALTER TABLE licitacoes ADD COLUMN pasta VARCHAR(255) NULL AFTER bruto;
ALTER TABLE licitacoes ADD COLUMN arquivos_status
  ENUM('nao_baixado','na_fila','baixando','ok','parcial','sem_arquivo','grande_demais')
  DEFAULT 'nao_baixado' AFTER pasta;
ALTER TABLE licitacoes ADD COLUMN arquivos_em DATETIME NULL AFTER arquivos_status;
