-- Seção 12 (simplify): índices para a ordem padrão de cada lista do mercado.
-- Sem eles, cada página de 30 ordenava o conjunto filtrado inteiro (filesort).
CREATE INDEX idx_ma_assinatura ON mercado_atas (data_assinatura);
CREATE INDEX idx_ma_uf_assinatura ON mercado_atas (uf, data_assinatura);
CREATE INDEX idx_mc_uf_assinatura ON mercado_contratos (uf, data_assinatura);
CREATE INDEX idx_mp_ocorrido ON mercado_publicacoes (ocorrido_em);
