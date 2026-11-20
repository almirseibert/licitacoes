-- Atas também ganham Área e Segmento (decisão de 20/11/2026), para o painel de Mercado listar as atas
-- com adesão (carona) do segmento escolhido. Preenchido pelo job `npm run segmentar` e ao gravar.
ALTER TABLE mercado_atas
  ADD COLUMN area     VARCHAR(60) NULL,
  ADD COLUMN segmento VARCHAR(80) NULL,
  ADD INDEX idx_ma_segmento (segmento),
  ADD INDEX idx_ma_area (area);
