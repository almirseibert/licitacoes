-- Fase de acabamento: o que a seção 11.13 pede na tela de Configurações e não
-- tinha onde morar, mais o estado `limpo` do job `limpar_temporarios`
-- (seção 14).

-- Chave/valor simples. Não é tabela de "qualquer coisa": cada chave aqui tem
-- efeito em código, e o seed abaixo documenta quais são. Valor em TEXT porque
-- destino de e-mail é texto, hora é número e os dois convivem melhor assim do
-- que em colunas tipadas que nunca servem para a configuração seguinte.
CREATE TABLE IF NOT EXISTS configuracoes (
  chave         VARCHAR(60) NOT NULL PRIMARY KEY,
  valor         TEXT NULL,
  descricao     VARCHAR(200) NULL,
  atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Valor NULL quer dizer "usa o que está na variável de ambiente". É de
-- propósito: quem sobe o serviço configura no EasyPanel, e quem usa o painel
-- pode sobrescrever pela tela sem mexer em deploy.
INSERT INTO configuracoes (chave, valor, descricao) VALUES
  ('alerta_email_para', NULL, 'Para quem vai o e-mail de alerta. Vazio usa ALERTA_PARA do ambiente.'),
  ('alerta_whatsapp_destino', NULL, 'Número do WhatsApp que recebe o alerta, com DDI. Vazio usa WHATSAPP_DESTINO.'),
  ('limite_mb_por_licitacao', NULL, 'Teto de download por licitação, em MB. Vazio usa LIMITE_MB_POR_LICITACAO.'),
  ('coleta_hora_inicio', '0', 'Hora em que a coleta automática pode começar (0 a 23).'),
  ('coleta_hora_fim', '23', 'Última hora em que a coleta automática roda (0 a 23).')
ON DUPLICATE KEY UPDATE descricao = VALUES(descricao);

-- `limpo` = o arquivo foi apagado pela limpeza dos 180 dias e a tela deve dizer
-- isso, em vez de oferecer um download que cairia no vazio.
ALTER TABLE licitacao_arquivos
  MODIFY COLUMN status ENUM('pendente','baixando','ok','erro','sem_arquivo','limpo') DEFAULT 'pendente';
