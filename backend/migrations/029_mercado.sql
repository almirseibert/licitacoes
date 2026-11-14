-- Seção 12 do PLANO_SAAS_CONLICITACAO.md — contratos, atas e acompanhamentos do mercado.
--
-- Catálogo compartilhado, sem organizacao_id: é dado público do PNCP, igual para
-- todo cliente. O que é de cada organização (favorita, alerta) continua em
-- org_licitacoes e alertas.
--
-- Formato conferido no PNCP em 14/11/2026 (busca /api/search, tipos_documento
-- contrato e ata, filtro `ufs`): o contrato traz fornecedor, valor global e
-- vigência; a ata traz vigência e órgão, mas NÃO traz fornecedor nem valor —
-- por isso essas colunas da ata são NULL e a tela diz "não publicado na ata".

CREATE TABLE IF NOT EXISTS mercado_contratos (
  id                     INT AUTO_INCREMENT PRIMARY KEY,
  numero_controle        VARCHAR(60) NOT NULL COMMENT 'ID do contrato no PNCP: 92402510000103-2-000135/2026',
  numero_controle_compra VARCHAR(60) NULL COMMENT 'ID da contratação (edital) de origem',
  numero_contrato        VARCHAR(80) NULL,
  tipo                   VARCHAR(60) NULL COMMENT 'Contrato (termo inicial), Empenho, Outros...',
  orgao_cnpj             CHAR(14) NULL,
  orgao_nome             VARCHAR(255) NULL,
  unidade                VARCHAR(255) NULL,
  esfera                 VARCHAR(20) NULL,
  poder                  VARCHAR(40) NULL,
  uf                     CHAR(2) NULL,
  municipio              VARCHAR(120) NULL,
  modalidade             VARCHAR(80) NULL,
  objeto                 TEXT NULL,
  valor_global           DECIMAL(16,2) NULL,
  fornecedor_ni          VARCHAR(20) NULL COMMENT 'CNPJ/CPF como o PNCP publica (CPF vem mascarado)',
  fornecedor_nome        VARCHAR(255) NULL,
  data_assinatura        DATE NULL,
  vigencia_inicio        DATE NULL,
  vigencia_fim           DATE NULL,
  cancelado              TINYINT(1) DEFAULT 0,
  publicado_em           DATETIME NULL,
  atualizado_pncp_em     DATETIME NULL,
  coletado_em            DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_mercado_contrato (numero_controle),
  INDEX idx_mc_compra (numero_controle_compra),
  INDEX idx_mc_uf_pub (uf, publicado_em),
  INDEX idx_mc_fornecedor (fornecedor_ni),
  INDEX idx_mc_vigencia (vigencia_fim),
  INDEX idx_mc_assinatura (data_assinatura)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mercado_atas (
  id                     INT AUTO_INCREMENT PRIMARY KEY,
  numero_controle        VARCHAR(70) NOT NULL COMMENT 'ID da ata no PNCP: 87958658000199-1-000972/2025-000003',
  numero_controle_compra VARCHAR(60) NULL,
  numero_ata             VARCHAR(80) NULL,
  orgao_cnpj             CHAR(14) NULL,
  orgao_nome             VARCHAR(255) NULL,
  unidade                VARCHAR(255) NULL,
  esfera                 VARCHAR(20) NULL,
  poder                  VARCHAR(40) NULL,
  uf                     CHAR(2) NULL,
  municipio              VARCHAR(120) NULL,
  modalidade             VARCHAR(80) NULL,
  objeto                 TEXT NULL,
  -- O PNCP não publica fornecedor nem valor na ata (ver o cabeçalho). Ficam aqui
  -- para o enriquecimento da 12b, e a tela mostra a lacuna enquanto forem NULL.
  valor_global           DECIMAL(16,2) NULL,
  fornecedor_ni          VARCHAR(20) NULL,
  fornecedor_nome        VARCHAR(255) NULL,
  permite_adesao         TINYINT(1) NULL,
  data_assinatura        DATE NULL,
  vigencia_inicio        DATE NULL,
  vigencia_fim           DATE NULL,
  cancelado              TINYINT(1) DEFAULT 0,
  publicado_em           DATETIME NULL,
  atualizado_pncp_em     DATETIME NULL,
  coletado_em            DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_mercado_ata (numero_controle),
  INDEX idx_ma_compra (numero_controle_compra),
  INDEX idx_ma_uf_pub (uf, publicado_em),
  INDEX idx_ma_vigencia (vigencia_fim)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Acompanhamentos: o que foi publicado depois do edital, de QUALQUER contratação
-- (não só das que estão no Radar). Uma linha por fato; a chave impede que a
-- mesma homologação vire dez linhas se o job rodar dez vezes. Os campos de
-- filtro (órgão, UF, objeto...) são copiados da publicação para a lista não
-- depender de a contratação estar no catálogo `licitacoes`.
CREATE TABLE IF NOT EXISTS mercado_publicacoes (
  id                     INT AUTO_INCREMENT PRIMARY KEY,
  chave                  VARCHAR(120) NOT NULL,
  numero_controle_compra VARCHAR(60) NOT NULL,
  tipo                   ENUM('contrato','ata','homologacao','revogada','anulada','suspensa') NOT NULL,
  descricao              VARCHAR(500) NULL,
  ocorrido_em            DATETIME NULL,
  orgao_cnpj             CHAR(14) NULL,
  orgao_nome             VARCHAR(255) NULL,
  esfera                 VARCHAR(20) NULL,
  uf                     CHAR(2) NULL,
  municipio              VARCHAR(120) NULL,
  modalidade             VARCHAR(80) NULL,
  numero_compra          VARCHAR(80) NULL COMMENT 'Número do edital (ex.: 0078/2026)',
  objeto                 TEXT NULL,
  valor                  DECIMAL(16,2) NULL,
  -- Quando a rodada que a gravou já avisou as organizações que a favoritaram.
  avisado_em             DATETIME NULL,
  criado_em              DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_mercado_publicacao (chave),
  INDEX idx_mp_compra (numero_controle_compra),
  INDEX idx_mp_uf_data (uf, ocorrido_em),
  INDEX idx_mp_aviso (avisado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Até onde cada coleta já foi, por tipo e UF: a próxima rodada para quando
-- alcança este ponto, em vez de varrer o índice inteiro.
CREATE TABLE IF NOT EXISTS mercado_coletas (
  tipo            VARCHAR(20) NOT NULL,
  uf              CHAR(2) NOT NULL,
  ate             DATETIME NULL COMMENT 'Mais recente já gravado (createdAt do índice ou dataAtualizacao)',
  ultima_execucao DATETIME NULL,
  ultimo_status   VARCHAR(20) NULL,
  gravados        INT DEFAULT 0,
  ultimo_erro     VARCHAR(255) NULL,
  PRIMARY KEY (tipo, uf)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- O acompanhamento casa publicação com licitação do catálogo pelo ID do PNCP.
CREATE INDEX idx_licitacoes_numero_controle ON licitacoes (numero_controle);
