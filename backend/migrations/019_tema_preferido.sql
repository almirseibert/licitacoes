-- Seção 2 do PLANO_SAAS_CONLICITACAO.md — tema claro/escuro.
-- Preferência do USUÁRIO, não da organização: quem troca de organização leva o
-- tema junto. NULL = nunca escolheu; o painel segue `prefers-color-scheme`.
ALTER TABLE usuarios
  ADD COLUMN tema_preferido ENUM('claro','escuro') NULL DEFAULT NULL AFTER ativo;
