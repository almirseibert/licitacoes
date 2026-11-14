-- Seção 16 do PLANO_SAAS_CONLICITACAO.md — Consultor jurídico.
--
-- Conversa = fio de perguntas de UMA pessoa (cada um vê as suas; a equipe não lê o chat do
-- colega). Cada pergunta vira uma linha com a resposta, que nasce 'pendente' e vira
-- 'respondida' ou 'erro' — o mesmo contrato assíncrono do Pergunte ao Edital. A base de artigos
-- é código (backend/config/dados/juridico.js), não tabela: muda por revisão, não por cliente.
CREATE TABLE IF NOT EXISTS juridico_conversas (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  organizacao_id  INT NOT NULL,
  usuario_id      INT NOT NULL,
  titulo          VARCHAR(120) NULL,
  criado_em       DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_jconversa_usuario (organizacao_id, usuario_id, atualizado_em),
  CONSTRAINT fk_jconversa_organizacao FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_jconversa_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS juridico_mensagens (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  organizacao_id  INT NOT NULL,
  conversa_id     INT NOT NULL,
  pergunta        VARCHAR(500) NOT NULL,
  situacao        ENUM('pendente','respondida','erro') NOT NULL DEFAULT 'pendente',
  resposta        JSON NULL,                 -- já validada pelo schema (seção 23.4)
  erro            VARCHAR(500) NULL,         -- mensagem para quem perguntou
  cache           TINYINT(1) NOT NULL DEFAULT 0,
  base_versao     VARCHAR(20) NULL,          -- versão da base jurídica que respondeu
  criado_em       DATETIME DEFAULT CURRENT_TIMESTAMP,
  respondida_em   DATETIME NULL,
  INDEX idx_jmensagem_conversa (organizacao_id, conversa_id, id),
  INDEX idx_jmensagem_pendente (organizacao_id, situacao),
  CONSTRAINT fk_jmensagem_organizacao FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_jmensagem_conversa FOREIGN KEY (conversa_id) REFERENCES juridico_conversas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Limite mensal de perguntas ao consultor: só o plano que tem o recurso. Os outros ficam em 0.
UPDATE planos SET limites = JSON_SET(limites, '$.ia_juridico_mes', 300) WHERE codigo = 'avancado';
UPDATE planos SET limites = JSON_SET(limites, '$.ia_juridico_mes', 0) WHERE codigo IN ('essencial', 'profissional');
