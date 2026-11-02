-- Fase 6 — Funil e alertas (seções 10 e 4.9).

CREATE TABLE IF NOT EXISTS anotacoes (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  licitacao_id INT NOT NULL,
  texto        TEXT NOT NULL,
  autor        VARCHAR(80),
  -- Mudança de etapa também vira anotação: o histórico do card conta a
  -- história inteira, não só o que foi digitado.
  tipo         ENUM('nota','etapa','sistema') DEFAULT 'nota',
  criado_em    DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_lic (licitacao_id, criado_em),
  CONSTRAINT fk_anotacao_licitacao FOREIGN KEY (licitacao_id) REFERENCES licitacoes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- As oito etapas da seção 10 pedem dados próprios em cada ponto do funil.
ALTER TABLE licitacoes ADD COLUMN etapa_em DATETIME NULL AFTER etapa;
ALTER TABLE licitacoes ADD COLUMN proposta_em DATETIME NULL AFTER etapa_em;
ALTER TABLE licitacoes ADD COLUMN valor_proposto DECIMAL(16,2) NULL AFTER proposta_em;
ALTER TABLE licitacoes ADD COLUMN valor_final DECIMAL(16,2) NULL AFTER valor_proposto;
ALTER TABLE licitacoes ADD COLUMN vencedor VARCHAR(255) NULL AFTER valor_final;
ALTER TABLE licitacoes ADD COLUMN cnpj_vencedor VARCHAR(20) NULL AFTER vencedor;
-- Qual exigência barrou, quando o descarte foi por exigência (seção 20).
ALTER TABLE licitacoes ADD COLUMN codigo_barrou VARCHAR(40) NULL AFTER motivo_descarte;

-- As etapas antigas ('Documentação', 'Resultado') eram um rascunho anterior à
-- seção 10. Hoje só existe 'Triagem' gravada, mas a conversão fica registrada.
UPDATE licitacoes SET etapa = 'Vou disputar' WHERE etapa = 'Documentação';
UPDATE licitacoes SET etapa = 'Em disputa' WHERE etapa = 'Resultado';

ALTER TABLE alertas ADD COLUMN quando DATETIME NULL AFTER mensagem;
ALTER TABLE alertas ADD COLUMN chave VARCHAR(120) NULL AFTER quando;
-- Um alerta por marco: o job roda de hora em hora e não pode repetir aviso.
CREATE UNIQUE INDEX uq_alerta_chave ON alertas (chave);
