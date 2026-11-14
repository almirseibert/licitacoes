-- Seção 18 do PLANO_SAAS_CONLICITACAO.md — ecossistema: serviços complementares por parceria
-- (seguro garantia, assessoria cadastral, cursos, clipping, bolsa de empregos).
--
-- O painel só ENCAMINHA o pedido do cliente ao parceiro: não emite apólice, não faz
-- assessoria, não cobra pelo parceiro. Dado do cliente só sai para o parceiro com o
-- aceite do termo de vínculo (versão e momento gravados no pedido).

-- Catálogo compartilhado (sem `organizacao_id`): quem cadastra é a operadora do serviço.
CREATE TABLE IF NOT EXISTS parceiros (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  servico       ENUM('seguro_garantia','assessoria_cadastral','cursos','clipping','bolsa_empregos') NOT NULL,
  nome          VARCHAR(160) NOT NULL,
  email_pedidos VARCHAR(255) NOT NULL,        -- para onde o pedido é encaminhado
  site          VARCHAR(255) NULL,            -- mostrado ao cliente
  ativo         TINYINT(1) NOT NULL DEFAULT 1,
  criado_em     DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_parceiro_servico_nome (servico, nome),
  INDEX idx_parceiro_ativo (servico, ativo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pedidos por organização.
--   interesse     — não há parceiro habilitado: nada saiu do painel, só ficou registrada a demanda
--   solicitado    — consentido, mas o e-mail ao parceiro não saiu (a operadora reenvia)
--   encaminhado   — o parceiro recebeu
--   em_atendimento / contratado / recusado — andamento, marcado pela operadora
--   cancelado     — o cliente desistiu (ou o interesse foi substituído por um pedido de verdade)
CREATE TABLE IF NOT EXISTS servico_pedidos (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  organizacao_id    INT NOT NULL,
  usuario_id        INT NULL,
  servico           ENUM('seguro_garantia','assessoria_cadastral','cursos','clipping','bolsa_empregos') NOT NULL,
  parceiro_id       INT NULL,
  licitacao_id      INT NULL,
  status            ENUM('interesse','solicitado','encaminhado','em_atendimento','contratado','recusado','cancelado')
                    NOT NULL DEFAULT 'interesse',
  mensagem          VARCHAR(1000) NULL,
  dados_enviados    JSON NULL,                -- exatamente o que foi ao parceiro
  termo_versao      VARCHAR(20) NULL,
  consentimento_em  DATETIME NULL,
  encaminhado_em    DATETIME NULL,
  valor_contratado  DECIMAL(14,2) NULL,       -- o que o cliente fechou com o parceiro
  contratado_em     DATETIME NULL,
  observacao        VARCHAR(500) NULL,        -- nota interna da operadora (o cliente não vê)
  criado_em         DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pedido_org (organizacao_id, criado_em),
  INDEX idx_pedido_status (status, servico),
  CONSTRAINT fk_pedido_org FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_pedido_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_pedido_parceiro FOREIGN KEY (parceiro_id) REFERENCES parceiros(id) ON DELETE SET NULL,
  CONSTRAINT fk_pedido_licitacao FOREIGN KEY (licitacao_id) REFERENCES licitacoes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
