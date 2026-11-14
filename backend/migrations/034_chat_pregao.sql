-- Seção 6 do PLANO_SAAS_CONLICITACAO.md — monitor de chat do pregão.
--
-- O chat é uma camada em cima do monitoramento que já existe (Seção 21): a mesma
-- linha de `monitoramentos` guarda se o chat está ligado, o que o portal respondeu
-- na última leitura e quando olhar de novo. Ligar o chat conta no limite
-- `monitores_chat` do plano; desligar devolve a vaga.
ALTER TABLE monitoramentos
  ADD COLUMN chat_ativo       TINYINT(1) NOT NULL DEFAULT 0,
  -- aguardando | ok | bloqueado | sem_consulta | erro | encerrado
  ADD COLUMN chat_status      VARCHAR(20) NULL,
  -- A explicação em português do status (o que a tela mostra no lugar de um erro técnico).
  ADD COLUMN chat_aviso       VARCHAR(255) NULL,
  ADD COLUMN chat_arquivado   TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN chat_checado_em  DATETIME NULL,
  ADD COLUMN chat_proxima     DATETIME NULL,
  -- Link para abrir o chat no portal, na mão (quando o adaptador sabe qual é).
  ADD COLUMN chat_link        VARCHAR(500) NULL,
  ADD INDEX idx_chat_proxima (chat_ativo, chat_proxima);

-- As mensagens do pregoeiro. Por organização, como o monitoramento: cada uma lê
-- o chat quando lhe convém, e "lida", "importante" são decisão de quem usa — a
-- leitura seguinte nunca as reescreve (a chave única faz o INSERT repetido ser
-- um no-op, não um UPDATE).
CREATE TABLE IF NOT EXISTS chat_mensagens (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  organizacao_id INT NOT NULL,
  licitacao_id   INT NOT NULL,
  -- SHA-256 de autor + texto + hora + ocorrência: mensagem repetida na mesma
  -- leitura não vira uma só, e a mesma leitura feita dez vezes não vira dez.
  chave          CHAR(64) NOT NULL,
  autor          VARCHAR(120) NULL,
  texto          TEXT NOT NULL,
  enviada_em     DATETIME NULL,
  -- Palavras que pedem atenção (convocado, anexo, diligência, prazo…), em JSON.
  destaques      JSON NULL,
  lida           TINYINT(1) NOT NULL DEFAULT 0,
  importante     TINYINT(1) NOT NULL DEFAULT 0,
  criado_em      DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_chat_mensagem (organizacao_id, licitacao_id, chave),
  INDEX idx_chat_licitacao (organizacao_id, licitacao_id, enviada_em),
  CONSTRAINT fk_chat_organizacao FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_licitacao FOREIGN KEY (licitacao_id) REFERENCES licitacoes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
