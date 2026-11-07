-- Fase 10 — Monitor de resultado e oportunidades (seções 21 e 22).

-- O que está sendo vigiado e com que cadência (seção 21.3). Uma linha por
-- licitação: o monitor é do processo, não do evento.
CREATE TABLE IF NOT EXISTS monitoramentos (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  licitacao_id     INT NOT NULL,
  ativo            TINYINT(1) DEFAULT 1,
  -- Por que está sendo vigiada: muda a cadência e o que se procura.
  --   'disputando' — card em "Vou disputar"/"Proposta enviada"/"Em disputa"
  --   'interesse'  — favorita ou pontuação alta, sem decisão ainda
  --   'preco'      — encerrada, vigiada só para alimentar a base de preços
  --   'orgao'      — acompanhando o órgão depois de uma deserta (seção 22.4)
  motivo           VARCHAR(40),
  proxima_checagem DATETIME,
  checagens        INT DEFAULT 0,
  -- SHA-256 da lista de arquivos (sequencial + título + tamanho) e das datas de
  -- abertura e encerramento. Hash diferente do guardado = o edital mudou.
  hash_arquivos    CHAR(64),
  hash_datas       CHAR(64),
  ultimo_erro      VARCHAR(255) NULL,
  criado_em        DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  encerrado_em     DATETIME NULL,
  -- Um monitoramento por licitação: ligar duas vezes é religar, não duplicar.
  UNIQUE KEY uq_monitor_licitacao (licitacao_id),
  INDEX idx_proxima (ativo, proxima_checagem),
  CONSTRAINT fk_monitor_licitacao FOREIGN KEY (licitacao_id) REFERENCES licitacoes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A linha do tempo da seção 21.4. Também é a prova documental do que aconteceu,
-- útil se houver recurso — por isso nada aqui é apagado nem reescrito.
CREATE TABLE IF NOT EXISTS eventos_licitacao (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  licitacao_id INT NOT NULL,
  tipo         VARCHAR(40),
  descricao    VARCHAR(500),
  dados        JSON,
  ocorrido_em  DATETIME,
  criado_em    DATETIME DEFAULT CURRENT_TIMESTAMP,
  -- Evento repetido é ruído na linha do tempo: a chave impede que a mesma
  -- mudança vire dez linhas se o job rodar dez vezes.
  chave        VARCHAR(160) NULL,
  UNIQUE KEY uq_evento_chave (chave),
  INDEX idx_lic (licitacao_id, ocorrido_em),
  CONSTRAINT fk_evento_licitacao FOREIGN KEY (licitacao_id) REFERENCES licitacoes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- As filas da seção 22.2.
ALTER TABLE licitacoes ADD COLUMN estrategica
  ENUM('deserta','fracassada','baixa_concorrencia','iminencia') NULL AFTER beneficio_me;
-- Id da licitação que substituiu esta, quando o órgão reabriu o mesmo objeto.
ALTER TABLE licitacoes ADD COLUMN reaberta_como INT NULL AFTER estrategica;
-- Assinatura do objeto (seção 24.3): é por ela que se reconhece a reabertura.
-- Fica gravada para não recalcular 1.400 vezes a cada varredura.
ALTER TABLE licitacoes ADD COLUMN assinatura_objeto VARCHAR(255) NULL AFTER reaberta_como;
CREATE INDEX idx_estrategica ON licitacoes (estrategica);
CREATE INDEX idx_assinatura ON licitacoes (orgao_cnpj, assinatura_objeto);

-- O que o órgão ainda precisa comprar (seção 22.2).
--
-- DIVERGÊNCIA DA SPEC, registrada como o CLAUDE.md pede: a seção 22.2 prevê
-- `licitacao_id NOT NULL`, supondo que toda deserta tenha passado pelo radar.
-- A maior parte não passou — a amostra de encerradas da Fase 7 tem 528
-- contratações sem homologação que nunca casaram com palavra-chave nenhuma, e
-- são justamente as mais valiosas: deserta que ninguém viu. Por isso a origem é
-- uma das duas, e exatamente uma, garantida pelo CHECK.
CREATE TABLE IF NOT EXISTS oportunidades_retomada (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  licitacao_id      INT NULL,
  historico_id      INT NULL,
  item_numero       INT NULL,
  tipo              ENUM('deserta','fracassada') NOT NULL,
  orgao_cnpj        VARCHAR(14),
  orgao_nome        VARCHAR(255),
  uf                CHAR(2),
  objeto            TEXT,
  assinatura_objeto VARCHAR(255),
  valor_estimado    DECIMAL(16,2),
  encerrada_em      DATE,
  -- `dias_desde` é calculado na leitura, nunca gravado: guardado, envelheceria
  -- em silêncio e a tela mostraria "há 3 dias" meses depois.
  situacao          ENUM('aguardando','reaberta','virou_dispensa','perdida','descartada') DEFAULT 'aguardando',
  nova_licitacao_id INT NULL,
  observacao        TEXT,
  criado_em         DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- A chave de propósito é uma string montada pela origem: 'lic:123:5' ou
  -- 'hist:456'. Não é um índice sobre as três colunas porque o MySQL trata
  -- NULL como distinto de NULL num índice único — e como exatamente uma das
  -- origens é sempre nula, aquele índice nunca colidiria e a varredura
  -- recriaria a mesma oportunidade a cada rodada.
  chave             VARCHAR(80) NOT NULL,
  UNIQUE KEY uq_oportunidade (chave),
  INDEX idx_situacao (situacao, valor_estimado),
  INDEX idx_orgao (orgao_cnpj),
  CONSTRAINT ck_oportunidade_origem CHECK (
    (licitacao_id IS NULL) <> (historico_id IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A mesma assinatura do lado da amostra de preços: é ela que liga a deserta de
-- agosto à licitação que o órgão abriu em outubro.
ALTER TABLE historico_precos ADD COLUMN assinatura_objeto VARCHAR(255) NULL AFTER objeto;
CREATE INDEX idx_hist_assinatura ON historico_precos (orgao_cnpj, assinatura_objeto);

-- Alerta de edital alterado é vermelho e os outros não: a tela precisa saber
-- sem decorar lista de tipos.
ALTER TABLE alertas ADD COLUMN nivel ENUM('info','atencao','vermelho') DEFAULT 'info' AFTER tipo;

-- Edital alterado baixa a versão nova **sem apagar a antiga** (seção 21.3):
-- `01_Edital.pdf` e `01_Edital_v2.pdf` convivem. A antiga é a prova do que
-- estava publicado quando a proposta foi montada, e some se for sobrescrita.
ALTER TABLE licitacao_arquivos ADD COLUMN versao INT NOT NULL DEFAULT 1 AFTER sequencial;
ALTER TABLE licitacao_arquivos DROP INDEX uq_lic_arquivo;
-- A versão entra na chave; com DEFAULT 1 o download normal continua idempotente
-- exatamente como era.
CREATE UNIQUE INDEX uq_lic_arquivo ON licitacao_arquivos (licitacao_id, sequencial, versao);
