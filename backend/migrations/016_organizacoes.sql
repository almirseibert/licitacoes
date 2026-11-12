-- Fase 15 — Base multiempresa (PLANO_SAAS_CONLICITACAO.md, Seção 1).
--
-- O painel deixa de autenticar contra a tabela `usuarios` do banco do CRM
-- (backend/config/db-auth.js) e passa a ter login próprio, com organizações
-- isoladas — pré-requisito para vender o painel a mais de um cliente.
--
-- DIVERGÊNCIA DA SPEC, registrada como o CLAUDE.md pede: as seções 2 e 13 da
-- spec descrevem um painel de uma empresa só, com login reaproveitado do CRM
-- pelo mesmo JWT_SECRET. Isso vira multiempresa por decisão explícita do dono
-- do produto (PLANO_SAAS_CONLICITACAO.md, Seção 1): cada cliente passa a ser
-- uma organização, com usuários e senha próprios (bcrypt), e o JWT passa a
-- levar organizacao_id e papel. Os dados que já existiam no painel migram
-- para a organização id=1, inserida no fim deste arquivo.

CREATE TABLE IF NOT EXISTS organizacoes (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  nome          VARCHAR(160) NOT NULL,
  cnpj          VARCHAR(20) NULL,
  -- 'teste' = ainda no período gratuito; vira 'ativa' quando o plano é
  -- confirmado (Seção 3 do plano) e 'suspensa' quando a cobrança falha.
  status        ENUM('teste','ativa','suspensa') NOT NULL DEFAULT 'teste',
  teste_ate     DATE NULL,
  criado_em     DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Usuário do painel, agora próprio — não mais lido do banco do CRM. Um mesmo
-- e-mail pode pertencer a mais de uma organização (tabela organizacao_membros
-- abaixo); a senha é uma só, igual em qualquer organização que ele acesse.
CREATE TABLE IF NOT EXISTS usuarios (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  nome          VARCHAR(160) NOT NULL,
  email         VARCHAR(190) NOT NULL,
  senha_hash    VARCHAR(255) NOT NULL,
  ativo         TINYINT(1) DEFAULT 1,
  criado_em     DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_usuario_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Vínculo usuário × organização, com o papel que vale SÓ dentro dela — o
-- mesmo usuário pode ser 'dono' numa organização e 'leitor' em outra.
CREATE TABLE IF NOT EXISTS organizacao_membros (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  organizacao_id INT NOT NULL,
  usuario_id     INT NOT NULL,
  papel          ENUM('dono','admin','membro','leitor') NOT NULL DEFAULT 'membro',
  criado_em      DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_membro (organizacao_id, usuario_id),
  INDEX idx_usuario (usuario_id),
  CONSTRAINT fk_membro_organizacao FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_membro_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Convite por e-mail. `token` vai no link do e-mail; não é PK porque some do
-- jeito que importa (aceito ou vencido), só precisa ser único enquanto vale.
CREATE TABLE IF NOT EXISTS convites (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  organizacao_id INT NOT NULL,
  email          VARCHAR(190) NOT NULL,
  papel          ENUM('dono','admin','membro','leitor') NOT NULL DEFAULT 'membro',
  token          VARCHAR(64) NOT NULL,
  criado_por     INT NULL,
  expira_em      DATETIME NOT NULL,
  aceito_em      DATETIME NULL,
  criado_em      DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_convite_token (token),
  INDEX idx_convite_org (organizacao_id, email),
  CONSTRAINT fk_convite_organizacao FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_convite_usuario FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Decisão do usuário sobre uma licitação do catálogo compartilhado, por
-- organização. Esta tabela nasce agora mas AINDA NÃO é lida nem escrita pelo
-- motor de pontuação, pelo funil nem pelo diagnóstico — eles continuam usando
-- as colunas de `licitacoes` (pontuacao, etapa, favorito, descartada) até a
-- Seção 1b do plano mover essa leitura/escrita para aqui, rota por rota, cada
-- uma verificada contra banco real antes de fechar. Criá-la agora evita outra
-- migração quando chegar a vez.
CREATE TABLE IF NOT EXISTS org_licitacoes (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  organizacao_id    INT NOT NULL,
  licitacao_id      INT NOT NULL,
  pontuacao         INT NULL,
  pontuacao_detalhe JSON NULL,
  etapa             VARCHAR(40) DEFAULT 'Triagem',
  etapa_em          DATETIME NULL,
  favorito          TINYINT(1) DEFAULT 0,
  descartada        TINYINT(1) DEFAULT 0,
  motivo_descarte   VARCHAR(255) NULL,
  criado_em         DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_org_licitacao (organizacao_id, licitacao_id),
  INDEX idx_licitacao (licitacao_id),
  CONSTRAINT fk_org_lic_organizacao FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_org_lic_licitacao FOREIGN KEY (licitacao_id) REFERENCES licitacoes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A organização nº 1 é quem já usava o painel: todo dado que já existia
-- (fontes, licitações, palavras, perfil, cofre...) passa a pertencer a ela
-- nas colunas organizacao_id que a migração 017 acrescenta, todas com
-- DEFAULT 1. Sem isso, a própria migração 017 falharia na checagem de chave
-- estrangeira.
INSERT INTO organizacoes (id, nome, status) VALUES (1, 'Studio Mythos', 'ativa')
  ON DUPLICATE KEY UPDATE nome = nome;
