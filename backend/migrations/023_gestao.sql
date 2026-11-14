-- Seção 8 do PLANO_SAAS_CONLICITACAO.md — gestão por licitação e dashboard.
--
-- O funil já guarda etapa, anotação, anexo e linha do tempo; falta o trabalho
-- em equipe: quem cuida de qual licitação, o que cada um tem de fazer e até
-- quando, e o que aconteceu no processo.

-- ------------------------------------------------------------ responsável
-- Quem cuida da licitação na organização. É decisão do usuário: a coleta e a
-- repontuação nunca escrevem aqui (escopo.COLUNAS_DECISAO).
ALTER TABLE org_licitacoes
  ADD COLUMN responsavel_id INT NULL AFTER ia_situacao,
  ADD INDEX idx_org_responsavel (organizacao_id, responsavel_id),
  ADD CONSTRAINT fk_org_lic_responsavel FOREIGN KEY (responsavel_id) REFERENCES usuarios(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------- tarefas
-- Tarefa da EQUIPE ("pedir atestado ao cliente X até sexta"). Não confundir
-- com `tarefas`, que é a fila interna do worker.
-- `licitacao_id` nulo = tarefa solta, que não é de uma licitação só.
-- `prazo` é DATE: "até sexta" é um dia, não uma hora — e a visão
-- atrasadas/hoje/futuras compara dia com dia, sem fuso no meio.
CREATE TABLE IF NOT EXISTS org_tarefas (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  organizacao_id  INT NOT NULL,
  licitacao_id    INT NULL,
  titulo          VARCHAR(200) NOT NULL,
  descricao       TEXT NULL,
  responsavel_id  INT NULL,
  prazo           DATE NULL,
  status          ENUM('aberta','concluida') NOT NULL DEFAULT 'aberta',
  concluida_em    DATETIME NULL,
  criado_por      INT NULL,
  criado_em       DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tarefa_org_status (organizacao_id, status, prazo),
  INDEX idx_tarefa_org_licitacao (organizacao_id, licitacao_id),
  INDEX idx_tarefa_org_responsavel (organizacao_id, responsavel_id),
  CONSTRAINT fk_tarefa_org FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_tarefa_licitacao FOREIGN KEY (licitacao_id) REFERENCES licitacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_tarefa_responsavel FOREIGN KEY (responsavel_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_tarefa_criador FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------- andamentos
-- O que aconteceu NO PROCESSO, registrado pela equipe ("órgão respondeu o
-- esclarecimento", "recurso da empresa X"). É diferente de `anotacoes`, que é
-- o pensamento interno sobre o card. Os tipos são os da Seção 9 (aviso por
-- tipo e por canal), para que o aviso tenha do que filtrar.
CREATE TABLE IF NOT EXISTS org_andamentos (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  organizacao_id  INT NOT NULL,
  licitacao_id    INT NOT NULL,
  tipo            ENUM('esclarecimento','aviso','impugnacao','recurso','status','resultado','outro')
                    NOT NULL DEFAULT 'outro',
  texto           TEXT NOT NULL,
  -- Quando aconteceu no processo; pode ser antes de quando foi registrado.
  ocorrido_em     DATETIME NOT NULL,
  autor_id        INT NULL,
  criado_em       DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_andamento_org_licitacao (organizacao_id, licitacao_id, ocorrido_em),
  INDEX idx_andamento_org_criado (organizacao_id, criado_em),
  CONSTRAINT fk_andamento_org FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_andamento_licitacao FOREIGN KEY (licitacao_id) REFERENCES licitacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_andamento_autor FOREIGN KEY (autor_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
