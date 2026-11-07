-- Fase 8 — Gerador de proposta (seção 19).

-- Uma licitação pode ter mais de uma proposta: o rascunho que você mexe até a
-- véspera e a final que foi para o portal. O `status` separa as duas, e é por
-- isso que a tabela não é um bloco de campos dentro de `licitacoes`.
CREATE TABLE IF NOT EXISTS propostas (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  licitacao_id       INT NOT NULL,
  perfil_id          INT NOT NULL,
  validade_dias      INT DEFAULT 60,
  prazo_entrega      VARCHAR(160),
  prazo_execucao     VARCHAR(160),
  garantia           VARCHAR(160),
  condicao_pagamento VARCHAR(160),
  dados_bancarios    VARCHAR(255),
  observacoes        TEXT,
  valor_total        DECIMAL(16,2),
  -- Custo total e margem média são dado INTERNO (seção 19.4): ficam no banco e
  -- na tela, nunca na saída entregue ao órgão.
  custo_total        DECIMAL(16,2),
  margem_media       DECIMAL(6,4),
  status             ENUM('rascunho','final','enviada') NOT NULL DEFAULT 'rascunho',
  arquivo_pdf        VARCHAR(500),
  arquivo_xlsx       VARCHAR(500),
  criado_em          DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_lic (licitacao_id),
  CONSTRAINT fk_proposta_lic FOREIGN KEY (licitacao_id) REFERENCES licitacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_proposta_perfil FOREIGN KEY (perfil_id) REFERENCES empresa_perfis(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A descrição é COPIADA do edital, não lida por JOIN: o edital pode ser
-- retificado depois (seção 21) e a proposta que você assinou tem de continuar
-- dizendo o que você assinou. Por isso também `quantidade` vive aqui.
CREATE TABLE IF NOT EXISTS proposta_itens (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  proposta_id    INT NOT NULL,
  item_numero    INT,
  descricao      TEXT,
  marca_modelo   VARCHAR(160),
  unidade        VARCHAR(40),
  quantidade     DECIMAL(16,4),
  -- SEU custo. Nunca sai no PDF nem no XLSX entregues (seção 19.4).
  custo_unitario DECIMAL(16,4),
  -- Fração de acréscimo sobre o custo: 0,2500 = custo mais 25%.
  margem_pct     DECIMAL(6,4),
  valor_unitario DECIMAL(16,4),
  valor_total    DECIMAL(16,2),
  -- Item que você NÃO vai disputar sai da proposta, mas fica na tabela: a
  -- decisão de não disputar é informação, e apagar a linha a perderia.
  disputar       TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_proposta_item (proposta_id, item_numero),
  INDEX idx_proposta (proposta_id),
  CONSTRAINT fk_proposta_item FOREIGN KEY (proposta_id) REFERENCES propostas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
