-- Seção 9 do PLANO_SAAS_CONLICITACAO.md — avisos por tipo e por canal.
--
-- Antes: um aviso só (o de prazo), para um destino só (o da organização).
-- Agora: cada pessoa escolhe, por canal (e-mail, WhatsApp, push do navegador),
-- quais tipos de aviso quer receber, e para onde. A organização continua com a
-- sua caixa (org_configuracoes `alerta_*`), com a mesma matriz de tipos.
--
-- O alerta continua nascendo em `alertas` (o sino do painel é a fonte da
-- verdade); quem leva para fora é o despacho do worker, que marca
-- `notificado_em` para nunca mandar o mesmo alerta duas vezes.

-- Preferência explícita. Linha ausente = padrão (ligado). `usuario_id` NULL é
-- a caixa da organização; a coluna gerada existe porque índice único com NULL
-- não impede duplicata.
CREATE TABLE IF NOT EXISTS notificacoes_config (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  organizacao_id  INT NOT NULL,
  usuario_id      INT NULL,
  usuario_chave   INT AS (COALESCE(usuario_id, 0)) STORED,
  canal           ENUM('email','whatsapp','push') NOT NULL,
  tipo            VARCHAR(30) NOT NULL,
  ativo           TINYINT(1) NOT NULL DEFAULT 1,
  atualizado_em   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_notificacao_pref (organizacao_id, usuario_chave, canal, tipo),
  CONSTRAINT fk_notif_cfg_org FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_cfg_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Para onde vai o aviso de cada pessoa, nesta organização. E-mail vazio = o
-- e-mail de login; WhatsApp vazio = não recebe por WhatsApp.
CREATE TABLE IF NOT EXISTS notificacoes_destinos (
  organizacao_id  INT NOT NULL,
  usuario_id      INT NOT NULL,
  email           VARCHAR(190) NULL,
  whatsapp        VARCHAR(20) NULL,
  atualizado_em   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (organizacao_id, usuario_id),
  CONSTRAINT fk_notif_dest_org FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_dest_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Inscrição de Web Push (uma por navegador). O endpoint é longo demais para
-- índice único; o hash dele é que impede a duplicata.
CREATE TABLE IF NOT EXISTS notificacoes_push (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  organizacao_id  INT NOT NULL,
  usuario_id      INT NOT NULL,
  endpoint        VARCHAR(1000) NOT NULL,
  endpoint_hash   CHAR(64) NOT NULL,
  p256dh          VARCHAR(200) NOT NULL,
  auth            VARCHAR(100) NOT NULL,
  navegador       VARCHAR(160) NULL,
  criado_em       DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_push_endpoint (organizacao_id, endpoint_hash),
  INDEX idx_push_usuario (organizacao_id, usuario_id),
  CONSTRAINT fk_push_org FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_push_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- `usuario_id`: o aviso é só desta pessoa (tarefa atrasada vai ao responsável).
-- `autor_id`: quem causou o aviso não o recebe (registrou o andamento).
-- `notificado_em`: o despacho já passou por ele.
ALTER TABLE alertas ADD COLUMN usuario_id INT NULL AFTER organizacao_id;
ALTER TABLE alertas ADD COLUMN autor_id INT NULL AFTER usuario_id;
ALTER TABLE alertas ADD COLUMN notificado_em DATETIME NULL;
ALTER TABLE alertas ADD INDEX idx_alerta_despacho (notificado_em, id);
ALTER TABLE alertas ADD CONSTRAINT fk_alerta_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;
ALTER TABLE alertas ADD CONSTRAINT fk_alerta_autor FOREIGN KEY (autor_id) REFERENCES usuarios(id) ON DELETE SET NULL;

-- O que já existia não é notícia: o despacho começa do zero, sem mandar o
-- histórico inteiro na primeira rodada.
UPDATE alertas SET notificado_em = criado_em WHERE notificado_em IS NULL;
