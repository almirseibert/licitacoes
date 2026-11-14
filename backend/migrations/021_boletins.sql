-- Seção 4 do PLANO_SAAS_CONLICITACAO.md — boletim diário por e-mail.
--
-- `perfis_busca` é o "Meus filtros" da organização: palavras, exclusões, UFs,
-- municípios, modalidades, faixa de valor e nota mínima. Listas em JSON (sem
-- DEFAULT: o MySQL 8 não aceita DEFAULT literal em JSON; o código preenche).
--
-- O filtro roda no NOSSO banco, sobre o objeto e o texto extraído do edital —
-- nunca no `palavraChave` da API do PNCP, que é ignorado em silêncio (seção 0).
--
-- "Sem repetir item já enviado" é garantido pelo banco, não só pelo código:
-- `boletim_itens` tem UNIQUE (perfil_id, licitacao_id). Uma licitação entra uma
-- vez por filtro, para sempre. E `boletins` tem UNIQUE (perfil_id, data,
-- horario): o worker reiniciado no meio do dia não gera o das 12h duas vezes.

CREATE TABLE IF NOT EXISTS perfis_busca (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  organizacao_id  INT NOT NULL,
  nome            VARCHAR(80) NOT NULL,
  palavras        JSON NOT NULL,
  exclusoes       JSON NOT NULL,
  ufs             JSON NOT NULL,
  municipios      JSON NOT NULL,
  modalidades     JSON NOT NULL,
  valor_minimo    DECIMAL(16,2) NULL,
  valor_maximo    DECIMAL(16,2) NULL,
  nota_minima     INT NULL,
  -- Horas do dia (0–23) em que o boletim sai. Padrão do código: [7, 12, 18].
  horarios        JSON NOT NULL,
  ativo           TINYINT(1) NOT NULL DEFAULT 1,
  enviar_email    TINYINT(1) NOT NULL DEFAULT 1,
  criado_em       DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_perfil_nome (organizacao_id, nome),
  CONSTRAINT fk_perfil_busca_org FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Um boletim = um filtro × um dia × um horário. `numero` é a ordem do boletim
-- dentro do dia da organização (1, 2, 3...), como o calendário mostra.
CREATE TABLE IF NOT EXISTS boletins (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  organizacao_id  INT NOT NULL,
  perfil_id       INT NOT NULL,
  data            DATE NOT NULL,
  horario         TINYINT NOT NULL,
  numero          INT NOT NULL,
  total_itens     INT NOT NULL DEFAULT 0,
  -- enviado | sem_itens | sem_email | sem_destinatario | erro | simulado
  email_status    VARCHAR(20) NULL,
  email_detalhe   VARCHAR(255) NULL,
  enviado_em      DATETIME NULL,
  criado_em       DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_boletim_horario (perfil_id, data, horario),
  INDEX idx_boletim_org_data (organizacao_id, data),
  CONSTRAINT fk_boletim_org FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_boletim_perfil FOREIGN KEY (perfil_id) REFERENCES perfis_busca(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS boletim_itens (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  organizacao_id  INT NOT NULL,
  boletim_id      INT NOT NULL,
  perfil_id       INT NOT NULL,
  licitacao_id    INT NOT NULL,
  palavra         VARCHAR(160) NULL,
  -- 'objeto' ou 'edital': onde a palavra apareceu.
  onde            VARCHAR(10) NULL,
  UNIQUE KEY uq_item_perfil (perfil_id, licitacao_id),
  INDEX idx_item_boletim (boletim_id),
  INDEX idx_item_org (organizacao_id),
  CONSTRAINT fk_bolitem_org FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_bolitem_boletim FOREIGN KEY (boletim_id) REFERENCES boletins(id) ON DELETE CASCADE,
  CONSTRAINT fk_bolitem_perfil FOREIGN KEY (perfil_id) REFERENCES perfis_busca(id) ON DELETE CASCADE,
  CONSTRAINT fk_bolitem_licitacao FOREIGN KEY (licitacao_id) REFERENCES licitacoes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Quem leu qual boletim — é daqui que sai "lido por outro membro da equipe".
CREATE TABLE IF NOT EXISTS boletim_leituras (
  boletim_id      INT NOT NULL,
  usuario_id      INT NOT NULL,
  lido_em         DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (boletim_id, usuario_id),
  INDEX idx_leitura_usuario (usuario_id),
  CONSTRAINT fk_leitura_boletim FOREIGN KEY (boletim_id) REFERENCES boletins(id) ON DELETE CASCADE,
  CONSTRAINT fk_leitura_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Descadastro: o membro que não quer o e-mail de um filtro. O boletim continua
-- no painel para ele; só o e-mail deixa de ir.
CREATE TABLE IF NOT EXISTS boletim_descadastros (
  perfil_id       INT NOT NULL,
  usuario_id      INT NOT NULL,
  criado_em       DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (perfil_id, usuario_id),
  CONSTRAINT fk_descad_perfil FOREIGN KEY (perfil_id) REFERENCES perfis_busca(id) ON DELETE CASCADE,
  CONSTRAINT fk_descad_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Quantos filtros cada plano tem ("um filtro inicial, vários depois").
UPDATE planos SET limites = JSON_SET(limites, '$.perfis_busca', 1) WHERE codigo = 'essencial';
UPDATE planos SET limites = JSON_SET(limites, '$.perfis_busca', 5) WHERE codigo = 'profissional';
UPDATE planos SET limites = JSON_SET(limites, '$.perfis_busca', 20) WHERE codigo = 'avancado';
