-- Seção 17 do PLANO_SAAS_CONLICITACAO.md — onboarding, ajuda, suporte, NPS, termos,
-- auditoria, status das ferramentas e exclusão de dados (LGPD).

-- O assistente de primeiro acesso: NULL = a organização ainda não passou por ele.
-- As organizações que já existem estão em uso: nascem "concluídas" para não
-- aparecer um assistente em cima de quem já configurou tudo.
ALTER TABLE organizacoes
  ADD COLUMN onboarding_concluido_em DATETIME NULL,
  ADD COLUMN exclusao_agendada_em DATETIME NULL,
  ADD COLUMN exclusao_pedida_por INT NULL;

UPDATE organizacoes SET onboarding_concluido_em = NOW() WHERE onboarding_concluido_em IS NULL;

-- Quem aceitou qual versão dos termos, e de onde. Versão nova dos termos = nova linha.
CREATE TABLE IF NOT EXISTS termos_aceites (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id     INT NOT NULL,
  organizacao_id INT NULL,
  versao         VARCHAR(20) NOT NULL,
  ip             VARCHAR(45) NULL,
  aceito_em      DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_termos_usuario_versao (usuario_id, versao),
  CONSTRAINT fk_termos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- "Solicitações": o canal com o suporte. O protocolo é derivado do id (SOL-AAAA-000123).
CREATE TABLE IF NOT EXISTS solicitacoes (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  organizacao_id INT NOT NULL,
  usuario_id     INT NULL,
  assunto        VARCHAR(160) NOT NULL,
  categoria      ENUM('duvida','problema','sugestao','cobranca','lgpd') NOT NULL DEFAULT 'duvida',
  status         ENUM('aberta','em_andamento','respondida','encerrada') NOT NULL DEFAULT 'aberta',
  criada_em      DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizada_em  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_solicitacao_org (organizacao_id, criada_em),
  INDEX idx_solicitacao_status (status, atualizada_em),
  CONSTRAINT fk_solicitacao_org FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_solicitacao_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS solicitacao_mensagens (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  solicitacao_id INT NOT NULL,
  autor          ENUM('cliente','suporte') NOT NULL,
  usuario_id     INT NULL,
  texto          TEXT NOT NULL,
  criada_em      DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_mensagem_solicitacao (solicitacao_id, criada_em),
  CONSTRAINT fk_mensagem_solicitacao FOREIGN KEY (solicitacao_id) REFERENCES solicitacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_mensagem_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- NPS: nota NULL = a pessoa dispensou a pesquisa (volta a perguntar em 30 dias).
CREATE TABLE IF NOT EXISTS nps_respostas (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  organizacao_id INT NOT NULL,
  usuario_id     INT NOT NULL,
  nota           TINYINT NULL,
  comentario     VARCHAR(1000) NULL,
  criada_em      DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_nps_usuario (usuario_id, criada_em),
  INDEX idx_nps_org (organizacao_id, criada_em),
  CONSTRAINT fk_nps_org FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_nps_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Trilha de auditoria: quem entrou e quem alterou documento, tarefa, etapa, equipe.
-- Guarda o QUE aconteceu, nunca o conteúdo (corpo da requisição não entra).
CREATE TABLE IF NOT EXISTS auditoria (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  organizacao_id INT NOT NULL,
  usuario_id     INT NULL,
  usuario_nome   VARCHAR(160) NULL,          -- cópia: a pessoa pode sair da equipe e a trilha continua legível
  acao           VARCHAR(40) NOT NULL,
  entidade       VARCHAR(30) NOT NULL,
  entidade_id    VARCHAR(40) NULL,
  detalhe        JSON NULL,
  ip             VARCHAR(45) NULL,
  criado_em      DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_auditoria_org (organizacao_id, criado_em),
  INDEX idx_auditoria_entidade (organizacao_id, entidade, criado_em),
  CONSTRAINT fk_auditoria_org FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sinal de vida do worker (uma linha por processo nomeado). A API lê daqui o
-- "worker de pé" da tela de status; sem batimento recente, o painel diz que parou.
CREATE TABLE IF NOT EXISTS worker_batimentos (
  nome  VARCHAR(40) PRIMARY KEY,
  em    DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Comprovante das exclusões feitas (LGPD). Sem FK de propósito: a organização já
-- não existe quando a linha é escrita. Guarda só o nome da empresa e as contagens.
CREATE TABLE IF NOT EXISTS lgpd_exclusoes (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  organizacao_id INT NOT NULL,
  organizacao_nome VARCHAR(160) NOT NULL,
  pedida_em      DATETIME NULL,
  executada_em   DATETIME DEFAULT CURRENT_TIMESTAMP,
  usuarios_removidos INT NOT NULL DEFAULT 0,
  arquivos_removidos INT NOT NULL DEFAULT 0,
  linhas_removidas   INT NOT NULL DEFAULT 0,
  INDEX idx_lgpd_org (organizacao_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
