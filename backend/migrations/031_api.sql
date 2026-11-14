-- Seção 14 do PLANO_SAAS_CONLICITACAO.md — API por token e webhook de novas oportunidades.
--
-- `tokens_api`: o token em texto puro aparece UMA vez, na criação; no banco fica
-- só o SHA-256 (o token tem 256 bits aleatórios, então hash sem sal basta e
-- permite achar a linha pelo índice). `prefixo` são os 8 primeiros caracteres
-- depois de "lic_", só para o cliente reconhecer qual token é qual na tela —
-- não abre nada. `ips_liberados` vazio = qualquer IP; revogar grava
-- `revogado_em` (a linha fica para o histórico e deixa de contar no limite).
--
-- `webhooks`: um por filtro salvo (`perfis_busca`, do boletim ou do Radar). A
-- assinatura HMAC precisa do segredo na hora de assinar, então ele não pode ser
-- um hash — mas também não fica em texto puro: o segredo é derivado do
-- JWT_SECRET + `segredo_sal` (HMAC), e o banco guarda só o sal. Quem lê o banco
-- sem o segredo da aplicação não assina nada. Girar o segredo = sal novo.
--
-- `webhook_itens`: o que já foi entregue — a chave primária segura o "sem
-- repetir" no banco, não só no código (mesma ideia de `boletim_itens`).
--
-- `planos.limites` ganha `webhooks` (quantos) e `api_chamadas_mes` (cota
-- mensal da API); chave ausente vale zero (`cabe` falha fechado).

CREATE TABLE IF NOT EXISTS tokens_api (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  organizacao_id  INT NOT NULL,
  nome            VARCHAR(80) NOT NULL,
  prefixo         CHAR(8) NOT NULL,
  token_hash      CHAR(64) NOT NULL,
  ips_liberados   JSON NOT NULL,
  criado_por      INT NULL,
  criado_em       DATETIME DEFAULT CURRENT_TIMESTAMP,
  ultimo_uso      DATETIME NULL,
  ultimo_ip       VARCHAR(45) NULL,
  revogado_em     DATETIME NULL,
  UNIQUE KEY uq_token_hash (token_hash),
  INDEX idx_token_org (organizacao_id, revogado_em),
  CONSTRAINT fk_token_api_org FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS webhooks (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  organizacao_id   INT NOT NULL,
  perfil_id        INT NOT NULL,
  nome             VARCHAR(80) NOT NULL,
  url              VARCHAR(500) NOT NULL,
  segredo_sal      CHAR(32) NOT NULL,
  ativo            TINYINT(1) NOT NULL DEFAULT 1,
  criado_por       INT NULL,
  criado_em        DATETIME DEFAULT CURRENT_TIMESTAMP,
  -- Só entrega o que o catálogo recebeu depois disto: criar o webhook não
  -- despeja o passado na URL do cliente.
  entregar_desde   DATETIME NOT NULL,
  ultima_entrega_em DATETIME NULL,
  ultimo_status    VARCHAR(20) NULL,
  ultimo_detalhe   VARCHAR(255) NULL,
  falhas_seguidas  INT NOT NULL DEFAULT 0,
  INDEX idx_webhook_org (organizacao_id),
  INDEX idx_webhook_perfil (perfil_id),
  CONSTRAINT fk_webhook_org FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_webhook_perfil FOREIGN KEY (perfil_id) REFERENCES perfis_busca(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS webhook_itens (
  webhook_id    INT NOT NULL,
  licitacao_id  INT NOT NULL,
  entregue_em   DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (webhook_id, licitacao_id),
  CONSTRAINT fk_webitem_webhook FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE,
  CONSTRAINT fk_webitem_licitacao FOREIGN KEY (licitacao_id) REFERENCES licitacoes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

UPDATE planos SET limites = JSON_SET(limites, '$.webhooks', 0, '$.api_chamadas_mes', 0) WHERE codigo = 'essencial';
UPDATE planos SET limites = JSON_SET(limites, '$.webhooks', 2, '$.api_chamadas_mes', 10000) WHERE codigo = 'profissional';
UPDATE planos SET limites = JSON_SET(limites, '$.webhooks', 5, '$.api_chamadas_mes', 100000) WHERE codigo = 'avancado';
