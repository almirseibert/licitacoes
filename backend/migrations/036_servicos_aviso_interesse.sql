-- Seção 18b: aviso a quem registrou interesse quando surge parceiro para o serviço.
-- `avisado_em` só é preenchido quando o e-mail saiu de verdade (sem SMTP o aviso fica pendente
-- e pode ser repetido pela operadora, sem mandar duas vezes a quem já recebeu).
ALTER TABLE servico_pedidos
  ADD COLUMN avisado_em DATETIME NULL AFTER encaminhado_em,
  -- o rodízio pergunta "quando este parceiro recebeu o último pedido?" a cada prévia e pedido
  ADD INDEX idx_pedido_parceiro (parceiro_id, criado_em);
