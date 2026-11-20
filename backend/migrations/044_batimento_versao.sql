-- O status do volume (/dados) passa a dizer POR QUE está vermelho. Para isso o worker informa, a cada
-- batimento, a versão do código que está rodando e o diretório em que grava; a API compara com os dela.
-- (Caso real de 20/11/2026: worker com deploy anterior ao sinal do volume parecia "volume separado".)
ALTER TABLE worker_batimentos
  ADD COLUMN versao_codigo VARCHAR(16) NULL,
  ADD COLUMN dir_dados     VARCHAR(255) NULL;
