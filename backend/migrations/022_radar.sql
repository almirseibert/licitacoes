-- Seção 7 do PLANO_SAAS_CONLICITACAO.md — Radar 2.0.
--
-- 1. `municipios`: catálogo compartilhado (sem organizacao_id) com as
--    coordenadas de cada município do IBGE, para o filtro de raio em km. O
--    conteúdo vem de `backend/config/dados/municipios.csv` pelo `npm run semear`.
-- 2. `perfis_busca` passa a guardar também a pesquisa salva do Radar: uma só
--    tabela para os dois (o plano pede assim). `origem` separa o filtro do
--    boletim ('boletim') da pesquisa do Radar ('radar'); `filtros` é o JSON da
--    tela do Radar. Pesquisa do Radar não gera boletim e não conta no limite de
--    filtros do boletim.
-- 3. `links_publicos`: compartilhar uma pesquisa por link de leitura com
--    validade. Só o SHA-256 do token fica no banco — quem lê o banco não abre
--    o link.
-- 4. Catálogo: `srp` (registro de preços) e `informacao_complementar` (a
--    "observação" do PNCP) vêm do detalhe; `fim_propostas_original` e
--    `abertura_original` guardam a primeira data vista, para a etiqueta
--    "prorrogada"/"adiada" ser calculada na leitura sem histórico à parte.

CREATE TABLE IF NOT EXISTS municipios (
  codigo_ibge  INT PRIMARY KEY,
  nome         VARCHAR(120) NOT NULL,
  uf           CHAR(2) NOT NULL,
  latitude     DECIMAL(9,6) NOT NULL,
  longitude    DECIMAL(9,6) NOT NULL,
  INDEX idx_municipio_uf_nome (uf, nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE perfis_busca ADD COLUMN origem ENUM('boletim','radar') NOT NULL DEFAULT 'boletim' AFTER nome;
ALTER TABLE perfis_busca ADD COLUMN filtros JSON NULL AFTER origem;
-- A chave nova entra antes de a velha sair: a FK de organizacao_id precisa de
-- um índice que comece por ela o tempo todo.
ALTER TABLE perfis_busca ADD UNIQUE KEY uq_perfil_origem_nome (organizacao_id, origem, nome);
ALTER TABLE perfis_busca DROP INDEX uq_perfil_nome;

CREATE TABLE IF NOT EXISTS links_publicos (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  organizacao_id  INT NOT NULL,
  token_hash      CHAR(64) NOT NULL,
  nome            VARCHAR(80) NULL,
  filtros         JSON NOT NULL,
  criado_por      INT NULL,
  expira_em       DATETIME NOT NULL,
  acessos         INT NOT NULL DEFAULT 0,
  criado_em       DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_link_token (token_hash),
  INDEX idx_link_org (organizacao_id),
  CONSTRAINT fk_link_publico_org FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE licitacoes ADD COLUMN srp TINYINT(1) NULL AFTER orcamento_sigiloso;
ALTER TABLE licitacoes ADD COLUMN informacao_complementar TEXT NULL AFTER objeto;
ALTER TABLE licitacoes ADD COLUMN abertura_original DATETIME NULL AFTER abertura_propostas;
ALTER TABLE licitacoes ADD COLUMN fim_propostas_original DATETIME NULL AFTER fim_propostas;
-- Os filtros novos de região, raio e situação.
ALTER TABLE licitacoes ADD INDEX idx_uf_municipio (uf, municipio);
ALTER TABLE licitacoes ADD INDEX idx_situacao (situacao);
UPDATE licitacoes SET abertura_original = abertura_propostas, fim_propostas_original = fim_propostas;
