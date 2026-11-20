-- Catálogo de segmentos (20/11/2026): cada contrato/encerrada ganha Área e Segmento, classificados
-- pelo texto do objeto (regras/segmentos.js). Preço de referência e Mercado passam a filtrar por eles.
-- NULL = ainda não classificado (o job `npm run segmentar` preenche); "Outros › Sem classificação" =
-- classificado e sem assunto reconhecido.
ALTER TABLE historico_precos
  ADD COLUMN area     VARCHAR(60) NULL,
  ADD COLUMN segmento VARCHAR(80) NULL,
  ADD INDEX idx_hp_segmento (segmento, familia),
  ADD INDEX idx_hp_area (area, familia);

ALTER TABLE mercado_contratos
  ADD COLUMN area     VARCHAR(60) NULL,
  ADD COLUMN segmento VARCHAR(80) NULL,
  ADD INDEX idx_mc_segmento (segmento),
  ADD INDEX idx_mc_area (area);
