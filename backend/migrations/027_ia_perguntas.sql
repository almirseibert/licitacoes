-- Seção 5 do PLANO_SAAS_CONLICITACAO.md — Pergunte ao Edital.
--
-- Uma linha por pergunta, da organização que perguntou. A resposta é
-- assíncrona: nasce 'pendente', a rota devolve o id e a tela consulta até
-- virar 'respondida' ou 'erro' (com a mensagem — nunca silêncio).
-- O gasto com o modelo continua no livro-caixa de `ia_execucoes` (tipo
-- 'pergunta_edital'), com cache pelo hash da pergunta + trechos enviados.
CREATE TABLE IF NOT EXISTS ia_perguntas (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  organizacao_id  INT NOT NULL,
  licitacao_id    INT NOT NULL,
  usuario_id      INT NULL,
  pergunta        VARCHAR(500) NOT NULL,
  pronta_codigo   VARCHAR(40) NULL,          -- da biblioteca (config/dados/perguntas-edital.js)
  situacao        ENUM('pendente','respondida','erro') NOT NULL DEFAULT 'pendente',
  resposta        JSON NULL,                 -- já validada pelo schema (seção 23.4)
  erro            VARCHAR(500) NULL,         -- mensagem para quem perguntou
  cache           TINYINT(1) NOT NULL DEFAULT 0,
  salva           TINYINT(1) NOT NULL DEFAULT 0,
  criado_em       DATETIME DEFAULT CURRENT_TIMESTAMP,
  respondida_em   DATETIME NULL,
  INDEX idx_pergunta_lic (organizacao_id, licitacao_id, criado_em),
  INDEX idx_pergunta_pendente (organizacao_id, situacao),
  CONSTRAINT fk_pergunta_organizacao FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_pergunta_licitacao FOREIGN KEY (licitacao_id) REFERENCES licitacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_pergunta_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
