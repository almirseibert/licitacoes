-- Fase 2 — Editável pelo usuário.
-- Pesos da pontuação em tabela (seção 6), perfil da empresa com CNAEs (seções 4.7 e 6.2).

CREATE TABLE IF NOT EXISTS regras_pontuacao (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  chave         VARCHAR(60)  NOT NULL,       -- mesma chave usada em regras/aderencia.js
  valor         JSON         NOT NULL,       -- número, lista ou objeto
  rotulo        VARCHAR(160) NOT NULL,       -- como aparece na tela de Configurações
  grupo         VARCHAR(60)  NOT NULL,       -- 'Palavra-chave', 'Valor', 'Penalidades'...
  descricao     VARCHAR(255) NULL,
  criado_em     DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_regra (chave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS empresa_perfis (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  nome              VARCHAR(120),
  razao_social      VARCHAR(255),
  nome_fantasia     VARCHAR(160),
  cnpj              VARCHAR(20),
  natureza          ENUM('ME','EPP','LTDA','Outra') DEFAULT 'ME',
  regime            ENUM('Simples Nacional','Lucro Presumido','Lucro Real') DEFAULT 'Simples Nacional',
  capital_social    DECIMAL(16,2),
  aberta_em         DATE NULL,
  insc_estadual     VARCHAR(30),
  insc_municipal    VARCHAR(30),
  endereco          VARCHAR(255),
  representante     VARCHAR(160),
  cpf_representante VARCHAR(14),
  cnaes             JSON,                    -- [{codigo, descricao, principal, cobertura:[...]}]
  receita_12m       DECIMAL(16,2) DEFAULT 0,
  padrao            TINYINT(1) DEFAULT 0,
  criado_em         DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_perfil_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Motivo legível da checagem de objeto social, para aparecer no card (seção 6.2).
ALTER TABLE licitacoes ADD COLUMN objeto_social_motivo VARCHAR(255) NULL AFTER objeto_social;
ALTER TABLE licitacoes ADD INDEX idx_objeto_social (objeto_social);
