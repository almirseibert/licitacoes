-- Seção 1b do PLANO_SAAS_CONLICITACAO.md — a decisão sobre a licitação passa a
-- ser da organização.
--
-- Até aqui `licitacoes` guardava, junto do fato público coletado do portal, a
-- pontuação e a decisão de UM cliente só (etapa do funil, favorito, descarte).
-- Num catálogo compartilhado, isso faria a organização B ver a etapa e a nota
-- da organização A. Esta migração:
--
--   1. completa `org_licitacoes` (criada vazia na 016) com tudo o que depende
--      de quem olha: o que vem das palavras-chave, dos pesos e do perfil da
--      organização (pontuação, grupo, palavra que casou, objeto social, pode
--      participar) e o que é decisão dela (etapa, favorito, descarte, proposta,
--      custo estimado);
--   2. copia o que já existia para a organização 1 — quem já usava o painel
--      continua vendo exatamente o mesmo Radar e o mesmo Funil;
--   3. APAGA essas colunas de `licitacoes`. É de propósito: uma consulta que
--      ainda leia `licitacoes.etapa` passa a falhar alto, em vez de mostrar a
--      decisão congelada de outra organização em silêncio.
--
-- Ficam em `licitacoes`, por serem fato público do resultado e não decisão:
-- vencedor, cnpj_vencedor, valor_final, valor_homologado, beneficio_me,
-- estrategica, ia_resumo (resumo do EDITAL, igual para todos).

ALTER TABLE org_licitacoes
  ADD COLUMN grupo                VARCHAR(60)  NULL AFTER pontuacao_detalhe,
  ADD COLUMN palavra_casada       VARCHAR(160) NULL AFTER grupo,
  ADD COLUMN pode_participar      ENUM('Sim','Não','Depende') DEFAULT 'Depende' AFTER palavra_casada,
  ADD COLUMN motivo_participacao  VARCHAR(255) NULL AFTER pode_participar,
  ADD COLUMN objeto_social        ENUM('coberto','parcial','fora') NULL AFTER motivo_participacao,
  ADD COLUMN objeto_social_motivo VARCHAR(255) NULL AFTER objeto_social,
  ADD COLUMN proposta_em          DATETIME NULL AFTER etapa_em,
  ADD COLUMN valor_proposto       DECIMAL(16,2) NULL AFTER proposta_em,
  ADD COLUMN custo_estimado       DECIMAL(16,2) NULL AFTER valor_proposto,
  -- Resultado que a organização DIGITOU (quem venceu, por quanto). O portal
  -- grava o seu em `licitacoes`; o digitado aqui só vale para quem digitou e,
  -- quando existe, passa na frente do do portal na visão da organização.
  ADD COLUMN valor_final          DECIMAL(16,2) NULL AFTER custo_estimado,
  ADD COLUMN vencedor             VARCHAR(255) NULL AFTER valor_final,
  ADD COLUMN cnpj_vencedor        VARCHAR(20) NULL AFTER vencedor,
  ADD COLUMN codigo_barrou        VARCHAR(40) NULL AFTER motivo_descarte,
  ADD COLUMN descartado_em        DATETIME NULL AFTER codigo_barrou,
  -- Confirmar ou recusar a leitura da IA é decisão de quem lê; o resumo em
  -- si (licitacoes.ia_resumo) é do edital e serve a todos.
  ADD COLUMN ia_situacao          ENUM('confirmado','recusado') NULL AFTER descartado_em,
  MODIFY COLUMN pontuacao INT DEFAULT 0;

ALTER TABLE org_licitacoes
  ADD INDEX idx_org_radar (organizacao_id, descartada, pontuacao),
  ADD INDEX idx_org_etapa (organizacao_id, etapa),
  ADD INDEX idx_org_descarte (organizacao_id, descartada, descartado_em),
  ADD INDEX idx_org_barrou (organizacao_id, codigo_barrou);

INSERT INTO org_licitacoes
  (organizacao_id, licitacao_id, pontuacao, pontuacao_detalhe, grupo, palavra_casada,
   pode_participar, motivo_participacao, objeto_social, objeto_social_motivo,
   etapa, etapa_em, proposta_em, valor_proposto, custo_estimado, favorito, descartada,
   motivo_descarte, codigo_barrou, descartado_em)
SELECT 1, id, pontuacao, pontuacao_detalhe, grupo, palavra_casada,
       pode_participar, motivo_participacao, objeto_social, objeto_social_motivo,
       COALESCE(etapa, 'Triagem'), etapa_em, proposta_em, valor_proposto, custo_estimado,
       COALESCE(favorito, 0), COALESCE(descartada, 0),
       motivo_descarte, codigo_barrou, descartado_em
  FROM licitacoes
ON DUPLICATE KEY UPDATE organizacao_id = organizacao_id;

-- O resultado que já estava gravado é o digitado pela organização 1 ou o do
-- portal — não há como separar. Fica no catálogo (vale para todas) e nada é
-- copiado: a organização 1 continua vendo o mesmo número pelo COALESCE.
UPDATE org_licitacoes o JOIN licitacoes l ON l.id = o.licitacao_id
   SET o.ia_situacao = l.ia_situacao
 WHERE o.organizacao_id = 1 AND l.ia_situacao IN ('confirmado', 'recusado');
UPDATE licitacoes SET ia_situacao = 'sugerido' WHERE ia_situacao IN ('confirmado', 'recusado');

ALTER TABLE licitacoes
  DROP INDEX idx_etapa,
  DROP INDEX idx_pontuacao,
  DROP INDEX idx_objeto_social,
  DROP INDEX idx_descarte,
  DROP INDEX idx_codigo_barrou;

ALTER TABLE licitacoes
  DROP COLUMN pontuacao,
  DROP COLUMN pontuacao_detalhe,
  DROP COLUMN grupo,
  DROP COLUMN palavra_casada,
  DROP COLUMN pode_participar,
  DROP COLUMN motivo_participacao,
  DROP COLUMN objeto_social,
  DROP COLUMN objeto_social_motivo,
  DROP COLUMN etapa,
  DROP COLUMN etapa_em,
  DROP COLUMN proposta_em,
  DROP COLUMN valor_proposto,
  DROP COLUMN custo_estimado,
  DROP COLUMN favorito,
  DROP COLUMN descartada,
  DROP COLUMN motivo_descarte,
  DROP COLUMN codigo_barrou,
  DROP COLUMN descartado_em;

-- ------------------------------------------------------------ configurações
-- Decisão de produto registrada (Seção 1b): `configuracoes` mistura duas
-- coisas. O que é OPERAÇÃO do serviço (janela da coleta, teto de download do
-- edital — o arquivo é do catálogo, baixado uma vez para todos) continua
-- global e só a organização operadora (id 1, Studio Mythos) muda. O que é
-- PREFERÊNCIA do cliente (para onde vai o alerta) vira por organização aqui.
CREATE TABLE IF NOT EXISTS org_configuracoes (
  organizacao_id INT NOT NULL,
  chave          VARCHAR(60) NOT NULL,
  valor          TEXT NULL,
  atualizado_em  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (organizacao_id, chave),
  CONSTRAINT fk_org_config_organizacao FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO org_configuracoes (organizacao_id, chave, valor)
SELECT 1, chave, valor FROM configuracoes
 WHERE chave IN ('alerta_email_para', 'alerta_whatsapp_destino') AND valor IS NOT NULL
ON DUPLICATE KEY UPDATE valor = VALUES(valor);

DELETE FROM configuracoes WHERE chave IN ('alerta_email_para', 'alerta_whatsapp_destino');

-- ----------------------------------------------------- recuperação de senha
-- Guarda o HASH do token (sha256), nunca o token: quem lê o banco não
-- consegue trocar a senha de ninguém. Uso único e validade curta.
CREATE TABLE IF NOT EXISTS recuperacoes_senha (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT NOT NULL,
  token_hash  CHAR(64) NOT NULL,
  expira_em   DATETIME NOT NULL,
  usado_em    DATETIME NULL,
  criado_em   DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_recuperacao_token (token_hash),
  INDEX idx_recuperacao_usuario (usuario_id, criado_em),
  CONSTRAINT fk_recuperacao_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------ alertas
-- A chave do alerta (`prazo_48h:123`) era única no banco inteiro: com duas
-- organizações disputando a mesma licitação, a segunda nunca receberia o aviso.
ALTER TABLE alertas DROP INDEX uq_alerta_chave;
ALTER TABLE alertas ADD UNIQUE KEY uq_alerta_chave (organizacao_id, chave);

-- ------------------------------------------------- oportunidades estratégicas
-- `oportunidades_retomada` é catálogo (o job acha a deserta e a reabertura
-- uma vez para todos). Marcar uma como descartada ou anotar nela é decisão de
-- quem olha: mora aqui, por organização, e a tela sobrepõe à do catálogo.
CREATE TABLE IF NOT EXISTS org_oportunidades (
  organizacao_id  INT NOT NULL,
  oportunidade_id INT NOT NULL,
  situacao        VARCHAR(20) NULL,
  observacao      TEXT NULL,
  atualizado_em   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (organizacao_id, oportunidade_id),
  INDEX idx_org_oport_oportunidade (oportunidade_id),
  CONSTRAINT fk_org_oport_organizacao FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_org_oport_oportunidade FOREIGN KEY (oportunidade_id) REFERENCES oportunidades_retomada(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Só o descarte é copiado para a organização 1: a observação do catálogo
-- também é escrita pelo job ("Reaberta: ...") e continua lá, à vista de todos.
INSERT INTO org_oportunidades (organizacao_id, oportunidade_id, situacao)
SELECT 1, id, 'descartada' FROM oportunidades_retomada WHERE situacao = 'descartada';
UPDATE oportunidades_retomada SET situacao = 'aguardando' WHERE situacao = 'descartada';
