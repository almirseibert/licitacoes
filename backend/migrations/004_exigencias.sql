-- Fase 4 — Leitura do edital e checklist de exigências (seções 4.6 e 8).

CREATE TABLE IF NOT EXISTS licitacao_exigencias (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  licitacao_id  INT NOT NULL,
  codigo        VARCHAR(40) NOT NULL,       -- catálogo da seção 8.2
  detectado     ENUM('sim','nao','negado','indefinido') DEFAULT 'indefinido',
  trecho        TEXT,                       -- recorte do edital que gerou a decisão
  pagina        INT NULL,
  -- Fora da seção 4.6, mas necessário: um edital vem em vários arquivos e sem
  -- isto a página sozinha não diz em qual deles conferir.
  arquivo_id    INT NULL,
  confirmado_por_usuario TINYINT(1) DEFAULT 0,
  criado_em     DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq (licitacao_id, codigo),
  INDEX idx_lic (licitacao_id),
  CONSTRAINT fk_exigencia_licitacao FOREIGN KEY (licitacao_id) REFERENCES licitacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_exigencia_arquivo FOREIGN KEY (arquivo_id) REFERENCES licitacao_arquivos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Estado da leitura, por arquivo e por licitação.
ALTER TABLE licitacao_arquivos ADD COLUMN paginas INT NULL AFTER tamanho_bytes;
ALTER TABLE licitacao_arquivos ADD COLUMN precisa_leitura_manual TINYINT(1) DEFAULT 0 AFTER texto_extraido;

ALTER TABLE licitacoes ADD COLUMN exigencias_status
  ENUM('nao_lido','na_fila','lendo','ok','sem_texto') DEFAULT 'nao_lido' AFTER arquivos_em;
ALTER TABLE licitacoes ADD COLUMN exigencias_em DATETIME NULL AFTER exigencias_status;
