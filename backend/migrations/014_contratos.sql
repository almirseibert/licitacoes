-- Fase 13 — Pós-vitória: contrato e execução (seção 28).
--
-- Ganhar é metade. A outra metade tem prazos com multa: assinar no prazo,
-- entregar no prazo, emitir nota corretamente, apresentar garantia. Perder
-- prazo contratual custa mais caro do que perder a licitação, e ainda gera
-- sanção que atrapalha as próximas — é por isso que o contrato entra no
-- painel, e não numa planilha à parte.

CREATE TABLE IF NOT EXISTS contratos (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  licitacao_id         INT NOT NULL,
  numero               VARCHAR(60),
  numero_empenho       VARCHAR(60),
  assinado_em          DATE NULL,
  vigencia_inicio      DATE NULL,
  vigencia_fim         DATE NULL,
  valor                DECIMAL(16,2) NULL,
  valor_executado      DECIMAL(16,2) DEFAULT 0,
  gestor_nome          VARCHAR(160),
  gestor_contato       VARCHAR(160),
  garantia_exigida     TINYINT(1) DEFAULT 0,
  garantia_entregue_em DATE NULL,
  situacao             ENUM('aguardando_assinatura','vigente','encerrado','rescindido','prorrogado')
                         NOT NULL DEFAULT 'aguardando_assinatura',
  arquivo_contrato     VARCHAR(500),
  observacao           TEXT,
  criado_em            DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- Uma licitação ganha rende um contrato. O índice único é o que impede o
  -- checklist automático de nascer duas vezes quando o card entra em
  -- "Ganhamos", sai e volta.
  UNIQUE KEY uq_contrato_licitacao (licitacao_id),
  INDEX idx_situacao (situacao),
  INDEX idx_vigencia_fim (vigencia_fim),
  CONSTRAINT fk_contrato_licitacao FOREIGN KEY (licitacao_id) REFERENCES licitacoes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Os marcos da seção 28.3. Cada um vira alerta datado.
CREATE TABLE IF NOT EXISTS contrato_marcos (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  contrato_id   INT NOT NULL,
  tipo          ENUM('assinatura','empenho','garantia','entrega','aceite','nota_fiscal','pagamento','renovacao','medicao')
                  NOT NULL,
  titulo        VARCHAR(160),
  previsto_para DATE NULL,
  concluido_em  DATE NULL,
  valor         DECIMAL(16,2) NULL,
  arquivo       VARCHAR(500) NULL,
  observacao    TEXT,
  -- `ordem` guarda a sequência da seção 28.3 (assinatura, garantia, entrega,
  -- aceite, nota, pagamento, renovação). Sem ela a tela ordenaria por data, e
  -- marco ainda sem data previsto iria para o fim da lista — justo o que
  -- precisa aparecer primeiro.
  ordem         SMALLINT NOT NULL DEFAULT 0,
  -- Marco calculado pelo painel ou acrescentado à mão. Só o automático é
  -- recriado; o que você escreveu nunca é sobrescrito (mesma regra da seção 5.2
  -- para decisão do usuário).
  origem        VARCHAR(20) NOT NULL DEFAULT 'automatico',
  criado_em     DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- Um marco automático de cada tipo por contrato. O de medição é o único que
  -- se repete, e ele só entra à mão — por isso a chave inclui a origem e o
  -- título, e não só o tipo.
  UNIQUE KEY uq_marco (contrato_id, tipo, titulo),
  INDEX idx_previsto (previsto_para, concluido_em),
  CONSTRAINT fk_marco_contrato FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A receita que o contador informa, separada do que o painel somou (seção 28.3).
-- `empresa_perfis.receita_12m` já existe desde a migração 002 e é o número do
-- contador; o painel nunca escreve nele. O que ele soma fica à parte, com a
-- data do cálculo, para a tela poder dizer qual número é de quem.
ALTER TABLE empresa_perfis ADD COLUMN receita_12m_apurada_em DATE NULL AFTER receita_12m;
