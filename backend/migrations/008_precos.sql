-- Fase 7 — Preço de referência e concorrência (seções 12 e 4.9).

-- O campo que a seção 12 chama de "Seu custo (preencher)". É o que transforma a
-- faixa de preço em decisão: sem ele o painel só informa, não ajuda a escolher.
ALTER TABLE licitacoes ADD COLUMN custo_estimado DECIMAL(16,2) NULL AFTER valor_homologado;

-- Amostra bruta das contratações já encerradas. Uma linha por contratação, com o
-- estimado e o homologado — é daqui que saem as medianas, e é por isso que ela
-- existe separada de `licitacoes`: encerrada de outro grupo serve de referência
-- mesmo sem nunca ter aparecido no radar.
CREATE TABLE IF NOT EXISTS historico_precos (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  adaptador        VARCHAR(60) NOT NULL DEFAULT 'pncp',
  chave_externa    VARCHAR(120) NOT NULL,
  grupo            VARCHAR(60),
  modalidade       VARCHAR(60),
  -- 'Pregão', 'Dispensa', 'Concorrência'… a família, sem o "- Eletrônico" que o
  -- PNCP cola no nome. O estudo da seção 12 é por família.
  familia          VARCHAR(40),
  uf               CHAR(2),
  esfera           VARCHAR(20),
  orgao_cnpj       VARCHAR(14),
  orgao_nome       VARCHAR(255),
  objeto           TEXT,
  valor_estimado   DECIMAL(16,2),
  valor_homologado DECIMAL(16,2) NULL,
  -- Fração, não porcentagem: 0,3400 quer dizer "fechou 34% abaixo do estimado".
  -- Negativo quer dizer que fechou acima — acontece em 1,1% dos casos.
  desconto         DECIMAL(7,4) NULL,
  -- Encerrada sem homologação: deserta ou fracassada. Fica de fora da mediana
  -- de desconto e entra na própria estatística.
  sem_homologacao  TINYINT(1) DEFAULT 0,
  encerrada_em     DATE NULL,
  coletado_em      DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_historico (adaptador, chave_externa),
  INDEX idx_grupo_familia (grupo, familia),
  INDEX idx_encerrada (encerrada_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- O resumo por grupo e família, recalculado pelo job mensal. `origem` separa o
-- que o painel mediu do que veio do levantamento de 10/10/2026 — o usuário tem
-- o direito de saber qual dos dois está vendo.
CREATE TABLE IF NOT EXISTS precos_referencia (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  grupo               VARCHAR(60) NOT NULL,
  familia             VARCHAR(40) NOT NULL,
  desconto_mediano    DECIMAL(7,4) NULL,
  desconto_q1         DECIMAL(7,4) NULL,
  desconto_q3         DECIMAL(7,4) NULL,
  pct_acima_estimado  DECIMAL(7,4) NULL,
  pct_sem_homologacao DECIMAL(7,4) NULL,
  -- Mediana de propostas por item: só o Compras.gov.br publica, e a leitura
  -- dele depende de CAPTCHA (seção 5.2). Fica nulo e a tela mostra o número do
  -- estudo com a data, em vez de inventar.
  mediana_propostas   INT NULL,
  amostra             INT NOT NULL DEFAULT 0,
  origem              ENUM('estudo','calculado') NOT NULL DEFAULT 'calculado',
  apurado_em          DATE NULL,
  atualizado_em       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- A origem entra na chave de propósito: a linha do estudo e a medida pelo
  -- painel convivem para o mesmo grupo, e quem escolhe entre as duas é o
  -- serviço, pela amostra. Sobrescrever o estudo apagaria o chão.
  UNIQUE KEY uq_grupo_familia_origem (grupo, familia, origem)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Quem disputou o quê (seção 12). Hoje o PNCP publica o vencedor por item, com
-- CNPJ e porte; a lista completa de propostas é do Compras.gov.br, e entra aqui
-- com `posicao` maior que 1 se algum dia o portal voltar a abri-la sem CAPTCHA.
CREATE TABLE IF NOT EXISTS propostas_concorrentes (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  licitacao_id     INT NOT NULL,
  item_numero      INT,
  posicao          INT,
  cnpj             VARCHAR(20),
  empresa          VARCHAR(255),
  uf               CHAR(2),
  me_epp           TINYINT(1) DEFAULT 0,
  mei              TINYINT(1) DEFAULT 0,
  situacao         VARCHAR(60),
  valor_ofertado   DECIMAL(16,4) NULL,
  valor_negociado  DECIMAL(16,4) NULL,
  -- De onde veio a linha: 'pncp' (vencedor homologado) ou 'comprasgov' (lista
  -- de propostas). Sem isso não se sabe se a ausência de concorrente é um fato
  -- ou só falta de fonte.
  origem           VARCHAR(40) DEFAULT 'pncp',
  criado_em        DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_proposta (licitacao_id, item_numero, origem, cnpj),
  INDEX idx_lic (licitacao_id),
  INDEX idx_cnpj (cnpj),
  CONSTRAINT fk_proposta_licitacao FOREIGN KEY (licitacao_id) REFERENCES licitacoes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
