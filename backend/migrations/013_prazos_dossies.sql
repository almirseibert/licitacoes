-- Fase 12 — Prazos de questionamento e dossiês (seções 25, 26 e 27).

-- Feriados para o cálculo de dia útil (seção 25.1). Os nacionais vêm da
-- BrasilAPI; os estaduais e municipais são cadastrados à mão, porque não há
-- fonte confiável e única para eles no Brasil.
CREATE TABLE IF NOT EXISTS feriados (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  data        DATE NOT NULL,
  nome        VARCHAR(120),
  abrangencia ENUM('nacional','estadual','municipal') NOT NULL DEFAULT 'nacional',
  uf          CHAR(2) NULL,
  municipio   VARCHAR(120) NULL,
  origem      VARCHAR(40) DEFAULT 'brasilapi',
  criado_em   DATETIME DEFAULT CURRENT_TIMESTAMP,
  -- A chave da spec tem colunas nulas, e no MySQL índice único não impede
  -- duplicata quando há NULL. A chave de propósito é montada com o que
  -- identifica o feriado, com string vazia no lugar do nulo.
  chave       VARCHAR(80) NOT NULL,
  UNIQUE KEY uq_feriado (chave),
  INDEX idx_data (data)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Pedido de esclarecimento e impugnação (seção 25.2).
--
-- A resposta do órgão vale como parte do edital: por isso ela é guardada aqui,
-- com data e protocolo, e o arquivo fica no volume. Perder essa resposta é
-- perder a segurança de disputar com o entendimento confirmado.
CREATE TABLE IF NOT EXISTS questionamentos (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  licitacao_id     INT NOT NULL,
  tipo             ENUM('esclarecimento','impugnacao') NOT NULL,
  assunto          VARCHAR(255),
  prazo_limite     DATETIME,
  enviado_em       DATETIME NULL,
  protocolo        VARCHAR(80),
  texto_enviado    MEDIUMTEXT,
  resposta         MEDIUMTEXT,
  respondido_em    DATETIME NULL,
  resultado        ENUM('acolhido','parcial','negado','sem_resposta') NULL,
  arquivo_resposta VARCHAR(500),
  criado_em        DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_lic (licitacao_id, tipo),
  CONSTRAINT fk_questionamento_licitacao FOREIGN KEY (licitacao_id) REFERENCES licitacoes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- O prazo calculado fica na licitação para o Radar poder filtrar e dar o selo
-- âmbar sem recalcular 1.400 vezes a cada tela (seção 25.2).
ALTER TABLE licitacoes ADD COLUMN prazo_questionamento DATETIME NULL AFTER fim_propostas;

-- Dossiê do concorrente (seção 26.2). Tudo aqui é derivado do que já está no
-- banco; nada é coletado à parte. A tabela existe porque a conta é cara para
-- refazer a cada abertura de tela, não porque o dado seja novo.
CREATE TABLE IF NOT EXISTS concorrentes (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  cnpj               VARCHAR(14) NOT NULL UNIQUE,
  razao_social       VARCHAR(255),
  uf                 CHAR(2),
  me_epp             TINYINT(1) DEFAULT 0,
  mei                TINYINT(1) DEFAULT 0,
  disputas           INT DEFAULT 0,
  itens              INT DEFAULT 0,
  vitorias           INT DEFAULT 0,
  desconto_medio     DECIMAL(6,4) NULL,
  desconto_mediano   DECIMAL(6,4) NULL,
  menor_preco_json   JSON,
  ufs                JSON,
  grupos             JSON,
  desclassificacoes  INT DEFAULT 0,
  -- Quantas vezes encontrou a Studio Mythos, e como terminou (seção 26.1).
  encontros          INT DEFAULT 0,
  encontros_perdidos INT DEFAULT 0,
  sancionado         TINYINT(1) DEFAULT 0,
  sancoes            JSON,
  sancoes_checado_em DATETIME NULL,
  observacao         TEXT,
  atualizado_em      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_disputas (disputas),
  INDEX idx_sancionado (sancionado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Dossiê do órgão (seção 27). Mesmos campos agregados, mesma origem.
CREATE TABLE IF NOT EXISTS orgaos (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  cnpj                 VARCHAR(14) NOT NULL UNIQUE,
  nome                 VARCHAR(255),
  uf                   CHAR(2),
  municipio            VARCHAR(120),
  esfera               VARCHAR(20),
  contratacoes         INT DEFAULT 0,
  homologadas          INT DEFAULT 0,
  sem_vencedor         INT DEFAULT 0,
  desconto_medio       DECIMAL(6,4) NULL,
  valor_total          DECIMAL(16,2) NULL,
  modalidade_frequente VARCHAR(60),
  plataforma_frequente VARCHAR(160),
  dias_ate_homologacao INT NULL,
  -- Perfil de exigência: {codigo: {exigiu, de}} (seção 27.1).
  exigencias_json      JSON,
  fornecedores_json    JSON,
  recorrencias         INT DEFAULT 0,
  -- Órgão perto de Lajeado merece aba própria (seção 27.2): a distância não se
  -- calcula aqui, mas a UF e o município ficam prontos para o filtro.
  atualizado_em        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_uf (uf),
  INDEX idx_contratacoes (contratacoes)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Consulta de sanções com cache de 30 dias (seção 26.3). O cache é exigência
-- da própria API, que limita requisições por minuto — e é por CNPJ, não por
-- consulta, para que checar o mesmo concorrente em duas telas não gaste duas.
CREATE TABLE IF NOT EXISTS sancoes_consultas (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  cnpj         VARCHAR(14) NOT NULL,
  fonte        ENUM('ceis','cnep') NOT NULL,
  encontrado   TINYINT(1) DEFAULT 0,
  registros    JSON,
  erro         VARCHAR(255) NULL,
  consultado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sancao (cnpj, fonte),
  INDEX idx_consultado (consultado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
