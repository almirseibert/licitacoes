-- Fase 11 — Leitura assistida e recorrência (seções 23 e 24).

-- Toda chamada à IA fica registrada: modelo, tokens e custo (seção 23.3).
-- Sem este livro-caixa, "quanto estou gastando com IA" vira estimativa, e a
-- resposta certa para isso é um número, não um palpite.
--
-- A chave única é (tipo, hash_entrada): é ela que faz o cache. Reprocessar o
-- mesmo edital com o mesmo prompt não chama a API de novo — devolve o que já
-- está aqui.
CREATE TABLE IF NOT EXISTS ia_execucoes (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  licitacao_id   INT NULL,
  tipo           VARCHAR(40) NOT NULL,
  modelo         VARCHAR(60),
  hash_entrada   CHAR(64) NOT NULL,
  tokens_entrada INT,
  tokens_saida   INT,
  custo_estimado DECIMAL(10,4),
  resposta       JSON,
  -- Falha também fica registrada: saber que o modelo recusou, ou devolveu
  -- fora do schema, é informação — e sem isto o painel tentaria de novo em
  -- cada rodada do worker, gastando a cada volta.
  erro           VARCHAR(500) NULL,
  criado_em      DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ia (tipo, hash_entrada),
  INDEX idx_lic (licitacao_id, tipo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A leitura assistida é sugestão até você confirmar (seção 23.1). Por isso ela
-- mora em coluna própria e não encosta em `pontuacao`, `etapa` nem
-- `pode_participar`: o que a IA acha fica separado do que o painel mediu.
ALTER TABLE licitacoes ADD COLUMN ia_resumo JSON NULL AFTER bruto;
ALTER TABLE licitacoes ADD COLUMN ia_em DATETIME NULL AFTER ia_resumo;
-- 'sugerido' enquanto você não olhou; 'confirmado' ou 'recusado' depois.
-- Enquanto for 'sugerido', a tela mostra tudo com o rótulo da IA.
ALTER TABLE licitacoes ADD COLUMN ia_situacao
  ENUM('sugerido','confirmado','recusado') NULL AFTER ia_em;

-- O calendário da seção 24.2.
CREATE TABLE IF NOT EXISTS recorrencias (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  orgao_cnpj           VARCHAR(14) NOT NULL,
  orgao_nome           VARCHAR(255),
  assinatura_objeto    VARCHAR(255) NOT NULL,
  objeto_exemplo       TEXT,
  grupo                VARCHAR(60),
  uf                   CHAR(2),
  ocorrencias          INT DEFAULT 1,
  primeira_em          DATE,
  ultima_em            DATE,
  mes_tipico           TINYINT,
  intervalo_medio_dias INT,
  valor_medio          DECIMAL(16,2),
  desconto_medio       DECIMAL(6,4),
  ultimo_vencedor      VARCHAR(255),
  ultimo_valor         DECIMAL(16,2),
  proxima_prevista     DATE,
  -- 0 a 1. Duas ocorrências em anos diferentes valem 0,5; três, 0,8; daí em
  -- diante 0,95. Com menos de duas, não se cria a linha — não se especula.
  confianca            DECIMAL(4,2),
  atualizado_em        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_recorrencia (orgao_cnpj, assinatura_objeto),
  INDEX idx_prevista (proxima_prevista),
  INDEX idx_mes (mes_tipico)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sugestão de palavra-chave vinda da IA (seção 23.5): entra como proposta, e
-- quem aceita é você, na tela de Palavras-chave.
CREATE TABLE IF NOT EXISTS palavras_sugeridas (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  termo       VARCHAR(160) NOT NULL,
  grupo       VARCHAR(60),
  porque      VARCHAR(500),
  -- Quantas licitações suas o termo explicaria: é o número que justifica o
  -- "aceitar".
  exemplos    INT DEFAULT 0,
  situacao    ENUM('sugerida','aceita','recusada') DEFAULT 'sugerida',
  origem      VARCHAR(40) DEFAULT 'ia',
  criado_em   DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_termo (termo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A amostra de encerradas vinha sem data em mais da metade das linhas (2.208 de
-- 3.817): a busca do PNCP só traz `data_fim_recebimento_propostas` em parte dos
-- registros, e sem data a contratação é invisível para a recorrência e para a
-- varredura de desertas.
--
-- `data_publicacao_pncp` vem em todos. Não é a data de encerramento e não vai
-- fingir que é — fica em coluna própria, com o nome do que ela é. Para o
-- calendário da seção 24 ela serve até melhor: o que se quer saber é em que mês
-- do ciclo orçamentário o órgão compra, e isso é quando ele publica.
ALTER TABLE historico_precos ADD COLUMN publicada_em DATE NULL AFTER encerrada_em;
CREATE INDEX idx_publicada ON historico_precos (publicada_em);
