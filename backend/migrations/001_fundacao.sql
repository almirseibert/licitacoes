-- Fase 1 — Fundação. Seções 4.1 a 4.4 e fila/alertas da seção 4.9.
-- Idempotente: pode rodar quantas vezes quiser.

CREATE TABLE IF NOT EXISTS fontes (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  nome            VARCHAR(120) NOT NULL,
  adaptador       VARCHAR(60)  NOT NULL,
  url_base        VARCHAR(255) NOT NULL,
  config          JSON,
  ativa           TINYINT(1)   DEFAULT 1,
  intervalo_horas INT          DEFAULT 6,
  ultima_coleta   DATETIME NULL,
  ultimo_status   VARCHAR(255) NULL,
  prioridade      INT DEFAULT 10,
  observacao      TEXT,
  criado_em       DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fonte_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS palavras_chave (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  termo         VARCHAR(160) NOT NULL,
  grupo         VARCHAR(60)  NOT NULL,
  usar_aspas    TINYINT(1) DEFAULT 1,
  peso          INT DEFAULT 10,
  ativa         TINYINT(1) DEFAULT 1,
  fontes_ids    JSON NULL,
  observacao    TEXT,
  criado_em     DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_termo (termo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS palavras_excluidas (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  termo         VARCHAR(160) NOT NULL,
  ativa         TINYINT(1) DEFAULT 1,
  criado_em     DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_termo_excluido (termo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS licitacoes (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  fonte_id            INT NOT NULL,
  chave_externa       VARCHAR(120) NOT NULL,
  numero_controle     VARCHAR(60),
  orgao_cnpj          VARCHAR(14),
  orgao_nome          VARCHAR(255),
  unidade             VARCHAR(255),
  esfera              ENUM('Federal','Estadual','Municipal','Outra'),
  uf                  CHAR(2),
  municipio           VARCHAR(120),
  modalidade          VARCHAR(60),
  modo_disputa        VARCHAR(60),
  numero_compra       VARCHAR(60),
  processo            VARCHAR(80),
  objeto              TEXT,
  valor_estimado      DECIMAL(16,2),
  valor_homologado    DECIMAL(16,2) NULL,
  orcamento_sigiloso  TINYINT(1) DEFAULT 0,
  abertura_propostas  DATETIME NULL,
  fim_propostas       DATETIME NULL,
  situacao            VARCHAR(60),
  plataforma_disputa  VARCHAR(160),
  link_portal         VARCHAR(500),
  link_disputa        VARCHAR(500),
  grupo               VARCHAR(60),
  palavra_casada      VARCHAR(160),
  pontuacao           INT DEFAULT 0,
  pontuacao_detalhe   JSON NULL,
  pode_participar     ENUM('Sim','Não','Depende') DEFAULT 'Depende',
  motivo_participacao VARCHAR(255),
  objeto_social       ENUM('coberto','parcial','fora') NULL,
  beneficio_me        VARCHAR(40) NULL,
  etapa               VARCHAR(40) DEFAULT 'Triagem',
  favorito            TINYINT(1) DEFAULT 0,
  descartada          TINYINT(1) DEFAULT 0,
  motivo_descarte     VARCHAR(255),
  bruto               JSON,
  criado_em           DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fonte_chave (fonte_id, chave_externa),
  INDEX idx_fim (fim_propostas),
  INDEX idx_etapa (etapa),
  INDEX idx_pontuacao (pontuacao),
  INDEX idx_criado (criado_em),
  CONSTRAINT fk_licitacao_fonte FOREIGN KEY (fonte_id) REFERENCES fontes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS licitacao_itens (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  licitacao_id         INT NOT NULL,
  numero_item          INT,
  descricao            TEXT,
  quantidade           DECIMAL(16,4),
  unidade              VARCHAR(40),
  valor_unit_estimado  DECIMAL(16,4),
  valor_total_estimado DECIMAL(16,2),
  beneficio            VARCHAR(80),
  situacao_item        VARCHAR(60),
  tem_resultado        TINYINT(1) DEFAULT 0,
  valor_homologado     DECIMAL(16,2) NULL,
  fornecedor_vencedor  VARCHAR(255) NULL,
  cnpj_vencedor        VARCHAR(20) NULL,
  criado_em            DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_lic_item (licitacao_id, numero_item),
  INDEX idx_lic (licitacao_id),
  CONSTRAINT fk_item_licitacao FOREIGN KEY (licitacao_id) REFERENCES licitacoes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tarefas (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  tipo           VARCHAR(40) NOT NULL,
  referencia_id  INT NULL,
  payload        JSON,
  prioridade     INT DEFAULT 10,
  status         ENUM('fila','rodando','ok','erro') DEFAULT 'fila',
  tentativas     INT DEFAULT 0,
  max_tentativas INT DEFAULT 3,
  erro           TEXT,
  chave_unica    VARCHAR(160) NULL,
  agendada_para  DATETIME DEFAULT CURRENT_TIMESTAMP,
  iniciada_em    DATETIME NULL,
  concluida_em   DATETIME NULL,
  criado_em      DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status, agendada_para),
  UNIQUE KEY uq_chave_pendente (chave_unica)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS alertas (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  tipo          VARCHAR(40),
  licitacao_id  INT NULL,
  documento_id  INT NULL,
  mensagem      VARCHAR(500),
  lido          TINYINT(1) DEFAULT 0,
  criado_em     DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_lido (lido, criado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS execucoes_coleta (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  fonte_id     INT NULL,
  termo        VARCHAR(160) NULL,
  encontradas  INT DEFAULT 0,
  novas        INT DEFAULT 0,
  atualizadas  INT DEFAULT 0,
  ignoradas    INT DEFAULT 0,
  duracao_ms   INT DEFAULT 0,
  status       VARCHAR(20) DEFAULT 'ok',
  mensagem     VARCHAR(500),
  criado_em    DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fonte (fonte_id, criado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
