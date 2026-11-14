-- Seção 3 do PLANO_SAAS_CONLICITACAO.md — planos e cobrança.
--
-- `planos` é catálogo (sem organizacao_id): o que cada plano libera vive em
-- `recursos` (lista) e quanto libera em `limites` (objeto; null = sem teto).
-- Nenhum `if (plano === ...)` no código — trocar o pacote é trocar esta linha.
--
-- `organizacoes.status` e `teste_ate` (migração 016) continuam sendo a fonte
-- do "pode usar?" (teste / ativa / suspensa). A assinatura guarda o resto: qual
-- plano, em que ciclo, pago até quando e por qual provedor.

CREATE TABLE IF NOT EXISTS planos (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  codigo                VARCHAR(40) NOT NULL,
  nome                  VARCHAR(80) NOT NULL,
  descricao             VARCHAR(255) NULL,
  preco_mensal_centavos INT NOT NULL,
  preco_anual_centavos  INT NOT NULL,
  recursos              JSON NOT NULL,
  limites               JSON NOT NULL,
  ordem                 INT NOT NULL DEFAULT 0,
  ativo                 TINYINT(1) NOT NULL DEFAULT 1,
  atualizado_em         DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_plano_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Uma assinatura por organização (o histórico fica em `assinatura_eventos`).
CREATE TABLE IF NOT EXISTS assinaturas (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  organizacao_id     INT NOT NULL,
  plano_id           INT NOT NULL,
  ciclo              ENUM('mensal','anual') NOT NULL DEFAULT 'mensal',
  -- NULL com a organização 'ativa' = sem vencimento (a operadora, ou cortesia).
  pago_ate           DATE NULL,
  -- 'manual' = o administrador da Studio Mythos ativa à mão. O gateway
  -- (Asaas ou Stripe) entra depois, sem migração nova: é só outro valor aqui.
  provedor           VARCHAR(20) NOT NULL DEFAULT 'manual',
  referencia_externa VARCHAR(120) NULL,
  -- Plano que o cliente pediu pela tela e o administrador ainda não ativou.
  plano_pedido_id    INT NULL,
  ciclo_pedido       ENUM('mensal','anual') NULL,
  pedido_em          DATETIME NULL,
  criado_em          DATETIME DEFAULT CURRENT_TIMESTAMP,
  atualizado_em      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_assinatura_org (organizacao_id),
  INDEX idx_assinatura_ref (provedor, referencia_externa),
  CONSTRAINT fk_assinatura_org FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_assinatura_plano FOREIGN KEY (plano_id) REFERENCES planos(id),
  CONSTRAINT fk_assinatura_pedido FOREIGN KEY (plano_pedido_id) REFERENCES planos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Livro de tudo que mexe na assinatura: ativação manual, pedido do cliente,
-- suspensão, evento de gateway. `evento_externo` deixa o webhook idempotente.
CREATE TABLE IF NOT EXISTS assinatura_eventos (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  organizacao_id INT NULL,
  provedor       VARCHAR(20) NOT NULL DEFAULT 'manual',
  evento_externo VARCHAR(120) NULL,
  tipo           VARCHAR(40) NOT NULL,
  dados          JSON NULL,
  usuario_id     INT NULL,
  criado_em      DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_evento_externo (provedor, evento_externo),
  INDEX idx_evento_org (organizacao_id, criado_em),
  CONSTRAINT fk_evento_org FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE,
  CONSTRAINT fk_evento_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Contador do que é limitado por mês (leituras de IA, exportações). O que é
-- limitado por estoque (usuários, palavras, GB) é contado na hora, não aqui.
CREATE TABLE IF NOT EXISTS uso_mensal (
  organizacao_id INT NOT NULL,
  mes            CHAR(7) NOT NULL,           -- 'AAAA-MM'
  recurso        VARCHAR(40) NOT NULL,
  quantidade     INT NOT NULL DEFAULT 0,
  atualizado_em  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (organizacao_id, mes, recurso),
  CONSTRAINT fk_uso_org FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Os três planos (preços propostos em 13/11/2026; anual = 10 meses pagos).
-- Recursos: o nome é o do módulo, conferido por `exigirRecurso` na rota.
INSERT INTO planos (codigo, nome, descricao, preco_mensal_centavos, preco_anual_centavos, recursos, limites, ordem) VALUES
('essencial', 'Essencial', 'Captação: Radar, boletim, gestão, documentos, declarações e alertas.', 14900, 149000,
 '["radar","boletim","gestao","documentos","declaracoes","alertas"]',
 '{"usuarios":2,"palavras_chave":30,"perfis_empresa":1,"ia_resumos_mes":0,"ia_perguntas_mes":0,"exportacoes_mes":20,"cofre_gb":1,"monitoramentos":0,"monitores_chat":0,"tokens_api":0}',
 1),
('profissional', 'Profissional', 'Essencial + Pergunte ao Edital, resumo por IA, acompanhamentos, contratos, concorrentes, histórico e API.', 29900, 299000,
 '["radar","boletim","gestao","documentos","declaracoes","alertas","ia","acompanhamentos","contratos","concorrentes","historico","api"]',
 '{"usuarios":5,"palavras_chave":100,"perfis_empresa":3,"ia_resumos_mes":60,"ia_perguntas_mes":200,"exportacoes_mes":100,"cofre_gb":5,"monitoramentos":50,"monitores_chat":0,"tokens_api":2}',
 2),
('avancado', 'Avançado', 'Profissional + estratégicas, mercado, consultor jurídico e relatórios.', 49900, 499000,
 '["radar","boletim","gestao","documentos","declaracoes","alertas","ia","acompanhamentos","contratos","concorrentes","historico","api","estrategicas","mercado","consultor_juridico","relatorios"]',
 '{"usuarios":15,"palavras_chave":300,"perfis_empresa":10,"ia_resumos_mes":200,"ia_perguntas_mes":1000,"exportacoes_mes":null,"cofre_gb":20,"monitoramentos":200,"monitores_chat":20,"tokens_api":5}',
 3);

-- Toda organização que já existe ganha a sua assinatura no Avançado: a
-- operadora sem vencimento; as em teste seguem o `teste_ate` que já tinham
-- (o teste grátis experimenta o plano mais completo).
INSERT INTO assinaturas (organizacao_id, plano_id, ciclo, pago_ate, provedor)
SELECT o.id, p.id, 'mensal', NULL, 'manual'
  FROM organizacoes o JOIN planos p ON p.codigo = 'avancado'
 WHERE NOT EXISTS (SELECT 1 FROM assinaturas a WHERE a.organizacao_id = o.id);
