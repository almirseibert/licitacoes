-- Fase 15 — Base multiempresa (PLANO_SAAS_CONLICITACAO.md, Seção 1): marca
-- como "de uma organização" cada tabela que é decisão ou dado PRÓPRIO do
-- cliente, e deixa de fora o que é fato público ou infraestrutura:
--
--   catálogo compartilhado (sem organizacao_id, de propósito): fontes,
--   licitacoes, licitacao_itens, historico_precos, precos_referencia,
--   propostas_concorrentes, orgaos, concorrentes, feriados,
--   eventos_licitacao, oportunidades_retomada — é dado coletado uma vez,
--   igual para todo cliente.
--
--   infraestrutura e cache compartilhados (sem organizacao_id, de propósito):
--   tarefas (fila do worker), ia_execucoes (cache de resposta por hash),
--   recorrencias (padrão do órgão, não do cliente), sancoes_consultas
--   (consulta de CNPJ é o mesmo fato para todo mundo). `configuracoes`
--   também fica de fora por ora: mistura ajuste de operação (horário da
--   coleta) com preferência que devia ser por cliente (destino do alerta) —
--   separar os dois é decisão de produto, não cabe nesta migração; registrado
--   como pendência na Seção 1b do plano.
--
-- DEFAULT 1 em toda coluna nova: a organização 1 (Studio Mythos, criada na
-- migração 016) é quem já tinha esses dados, e a migração não pode deixar
-- nenhuma linha existente sem organização.

-- -------------------------------------------------------- palavras-chave
ALTER TABLE palavras_chave ADD COLUMN organizacao_id INT NOT NULL DEFAULT 1 AFTER id;
ALTER TABLE palavras_chave DROP INDEX uq_termo;
ALTER TABLE palavras_chave ADD UNIQUE KEY uq_termo (organizacao_id, termo);
ALTER TABLE palavras_chave ADD CONSTRAINT fk_palavra_organizacao
  FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE;

ALTER TABLE palavras_excluidas ADD COLUMN organizacao_id INT NOT NULL DEFAULT 1 AFTER id;
ALTER TABLE palavras_excluidas DROP INDEX uq_termo_excluido;
ALTER TABLE palavras_excluidas ADD UNIQUE KEY uq_termo_excluido (organizacao_id, termo);
ALTER TABLE palavras_excluidas ADD CONSTRAINT fk_palavra_excluida_organizacao
  FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE;

ALTER TABLE palavras_sugeridas ADD COLUMN organizacao_id INT NOT NULL DEFAULT 1 AFTER id;
ALTER TABLE palavras_sugeridas DROP INDEX uq_termo;
ALTER TABLE palavras_sugeridas ADD UNIQUE KEY uq_termo (organizacao_id, termo);
ALTER TABLE palavras_sugeridas ADD CONSTRAINT fk_palavra_sugerida_organizacao
  FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE;

-- ---------------------------------------------------------- pontuação e perfil
ALTER TABLE regras_pontuacao ADD COLUMN organizacao_id INT NOT NULL DEFAULT 1 AFTER id;
ALTER TABLE regras_pontuacao DROP INDEX uq_regra;
ALTER TABLE regras_pontuacao ADD UNIQUE KEY uq_regra (organizacao_id, chave);
ALTER TABLE regras_pontuacao ADD CONSTRAINT fk_regra_organizacao
  FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE;

ALTER TABLE empresa_perfis ADD COLUMN organizacao_id INT NOT NULL DEFAULT 1 AFTER id;
ALTER TABLE empresa_perfis DROP INDEX uq_perfil_nome;
ALTER TABLE empresa_perfis ADD UNIQUE KEY uq_perfil_nome (organizacao_id, nome);
ALTER TABLE empresa_perfis ADD CONSTRAINT fk_perfil_organizacao
  FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE;

-- -------------------------------------------------------------------- cofre
ALTER TABLE empresa_documentos ADD COLUMN organizacao_id INT NOT NULL DEFAULT 1 AFTER id;
ALTER TABLE empresa_documentos ADD INDEX idx_documento_organizacao (organizacao_id);
ALTER TABLE empresa_documentos ADD CONSTRAINT fk_documento_organizacao
  FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE;

ALTER TABLE documento_kits ADD COLUMN organizacao_id INT NOT NULL DEFAULT 1 AFTER id;
ALTER TABLE documento_kits ADD INDEX idx_kit_organizacao (organizacao_id);
ALTER TABLE documento_kits ADD CONSTRAINT fk_kit_organizacao
  FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE;

ALTER TABLE pacotes ADD COLUMN organizacao_id INT NOT NULL DEFAULT 1 AFTER id;
ALTER TABLE pacotes ADD INDEX idx_pacote_organizacao (organizacao_id);
ALTER TABLE pacotes ADD CONSTRAINT fk_pacote_organizacao
  FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE;

ALTER TABLE licitacao_anexos ADD COLUMN organizacao_id INT NOT NULL DEFAULT 1 AFTER id;
ALTER TABLE licitacao_anexos ADD INDEX idx_anexo_organizacao (organizacao_id);
ALTER TABLE licitacao_anexos ADD CONSTRAINT fk_anexo_organizacao
  FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE;

-- Modelo de declaração: NULL continua sendo "do sistema" (padrao_sistema=1,
-- igual para qualquer organização, como já documentava a migração 006). Só
-- a cópia que o usuário edita ganha organizacao_id — nenhuma linha existente
-- muda, porque toda linha de hoje é padrao_sistema=1.
ALTER TABLE modelos_declaracao ADD COLUMN organizacao_id INT NULL AFTER id;
ALTER TABLE modelos_declaracao ADD INDEX idx_modelo_organizacao (organizacao_id);
ALTER TABLE modelos_declaracao ADD CONSTRAINT fk_modelo_organizacao
  FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE;
ALTER TABLE modelos_declaracao DROP INDEX uq_modelo_sistema;
CREATE UNIQUE INDEX uq_modelo_sistema ON modelos_declaracao (organizacao_id, codigo, padrao_sistema, titulo);

-- --------------------------------------------------------------------- funil
ALTER TABLE anotacoes ADD COLUMN organizacao_id INT NOT NULL DEFAULT 1 AFTER id;
ALTER TABLE anotacoes ADD INDEX idx_anotacao_organizacao (organizacao_id);
ALTER TABLE anotacoes ADD CONSTRAINT fk_anotacao_organizacao
  FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE;

ALTER TABLE alertas ADD COLUMN organizacao_id INT NOT NULL DEFAULT 1 AFTER id;
ALTER TABLE alertas ADD INDEX idx_alerta_organizacao (organizacao_id, lido);
ALTER TABLE alertas ADD CONSTRAINT fk_alerta_organizacao
  FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE;

-- -------------------------------------------------------------- propostas
ALTER TABLE propostas ADD COLUMN organizacao_id INT NOT NULL DEFAULT 1 AFTER id;
ALTER TABLE propostas ADD INDEX idx_proposta_organizacao (organizacao_id);
ALTER TABLE propostas ADD CONSTRAINT fk_proposta_organizacao
  FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE;

-- --------------------------------------------------------------------- monitor
-- `uq_monitor_licitacao` era (licitacao_id): um painel, uma licitação, um
-- monitor. Com duas organizações podendo acompanhar a MESMA licitação do
-- catálogo, a chave de "monitor único" passa a ser por organização.
ALTER TABLE monitoramentos ADD COLUMN organizacao_id INT NOT NULL DEFAULT 1 AFTER id;
-- A FK de licitacao_id se apoiava no índice único antigo; sem um índice que
-- comece por licitacao_id, o DROP seguinte é recusado pelo motor.
ALTER TABLE monitoramentos ADD INDEX idx_monitor_licitacao_fk (licitacao_id);
ALTER TABLE monitoramentos DROP INDEX uq_monitor_licitacao;
ALTER TABLE monitoramentos ADD UNIQUE KEY uq_monitor_licitacao (organizacao_id, licitacao_id);
ALTER TABLE monitoramentos ADD CONSTRAINT fk_monitor_organizacao
  FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE;

-- -------------------------------------------------------------- questionamentos
ALTER TABLE questionamentos ADD COLUMN organizacao_id INT NOT NULL DEFAULT 1 AFTER id;
ALTER TABLE questionamentos ADD INDEX idx_questionamento_organizacao (organizacao_id);
ALTER TABLE questionamentos ADD CONSTRAINT fk_questionamento_organizacao
  FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE;

-- ------------------------------------------------------------------ contratos
-- Mesma razão do monitor: duas organizações podem ganhar a mesma licitação
-- do catálogo em momentos diferentes (rara, mas possível num catálogo
-- compartilhado), e cada uma tem o seu próprio contrato.
ALTER TABLE contratos ADD COLUMN organizacao_id INT NOT NULL DEFAULT 1 AFTER id;
-- Mesmo motivo do monitor: a FK de licitacao_id precisa de um índice próprio
-- antes de o único (licitacao_id) poder ser apagado.
ALTER TABLE contratos ADD INDEX idx_contrato_licitacao_fk (licitacao_id);
ALTER TABLE contratos DROP INDEX uq_contrato_licitacao;
ALTER TABLE contratos ADD UNIQUE KEY uq_contrato_licitacao (organizacao_id, licitacao_id);
ALTER TABLE contratos ADD CONSTRAINT fk_contrato_organizacao
  FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE;
