# Plano — Painel vira SaaS multiempresa (inspirado no ConLicitação)

Este arquivo quebra o plano aprovado em seções fechadas, cada uma implantável e testável
por si, para rodar uma por vez. Cada seção termina com commit e push, segue o critério de
aceite da seção 16 da spec, e atualiza o README com o resultado medido — igual às 14 fases
já existentes. Quando terminar uma seção, risque o `[ ]` e registre a data.

## Como usar este arquivo com economia de tokens

- Comece cada seção com o skill **Explore** (agente de busca) para mapear só os arquivos
  daquela seção, em vez de reler o repositório inteiro a cada sessão.
- Para alterações repetidas em muitos arquivos (ex.: adicionar `organizacao_id` em 15
  tabelas), descreva o padrão uma vez e aplique com `grep`/`sed` ou edição em lote, não
  arquivo por arquivo narrado.
- Ao fechar cada seção, rode o skill **code-review** (nível `medium`) no diff antes do
  commit, e o skill **simplify** se sobrar duplicação.
- Not explore novamente o que a seção anterior já documentou aqui — leia o resultado
  medido registrado abaixo em vez de redescobrir.

---

## Seção 0 — Fechar o levantamento do ConLicitação
- [ ] Liberar rede para `conlicitacao.com.br`, `consulteonline.conlicitacao.com.br` e
      `licitario.com.br` (via `update_environment`, com sua aprovação).
- [ ] Ler páginas públicas de produto/planos/ajuda e preencher
      `docs/REFERENCIA_CONLICITACAO.md` com a tabela recurso deles → equivalente nosso → seção.
- [ ] Decidir com você se a área logada precisa de prints (login de terceiro não é
      replicável sem credencial, e o painel nunca guarda senha de portal — seção 5.4).

**Aceite:** tabela de referência publicada e revisada com você.

---

## Seção 1 — Base multiempresa (pré-requisito de todas as seguintes)
- [ ] Migração `016_organizacoes.sql`: `organizacoes`, `usuarios` (próprios, bcrypt),
      `organizacao_membros` (papel: dono/admin/membro/leitor), `convites`.
- [ ] Nova `org_licitacoes` (organizacao_id, licitacao_id, pontuação, etapa_funil,
      favorito, descartado, motivo) — separa decisão do usuário do catálogo coletado.
- [ ] `organizacao_id` + índice em: `palavras_chave`, `palavras_excluidas`,
      `regras_pontuacao`, `empresa_perfis`, `empresa_documentos`, kits, `pacotes`, anexos,
      `modelos_declaracao`, `anotacoes`, `propostas`, `monitoramentos`, `alertas`,
      `tarefas`, `contratos`, `questionamentos`, `configuracoes`, `ia_execucoes`,
      `recorrencias`, `palavras_sugeridas`, `sancoes_consultas`.
- [ ] `fontes`, `licitacoes`, `licitacao_itens`, `licitacao_arquivos`, `historico_precos`,
      `precos_referencia`, `propostas_concorrentes`, `orgaos`, `concorrentes`, `feriados`,
      `eventos_licitacao` continuam **sem** `organizacao_id` (catálogo compartilhado).
- [ ] `backend/rotas/auth.js`: cadastro, login, troca de organização, convite, recuperação
      de senha. JWT passa a levar `usuario_id`, `organizacao_id`, `papel`.
- [ ] Remover `backend/config/db-auth.js` (login deixa de vir do banco do CRM).
- [ ] `autenticar.js` ganha `exigirPapel(...)`; helper em `backend/config/db.js` que exige
      `organizacao_id` em toda consulta por organização; teste que falha se achar rota sem esse filtro.
- [ ] `regras/aderencia.js` e `executar-repontuar.js` pontuam o catálogo por organização.
- [ ] Cofre em `/dados/orgs/<id>/...`.
- [ ] Frontend: telas de login, cadastro, convite, troca de organização, "Equipe".
- [ ] Registrar divergência nas seções 2/2.1 da spec e no CLAUDE.md (login sai do CRM).

**Aceite:** duas organizações de teste, cada uma só vendo seus próprios dados em
`org_licitacoes`, `alertas`, cofre e funil; o catálogo (`licitacoes`) é visível para as duas.

---

## Seção 2 — Tema claro/escuro no painel
- [ ] Tokens de cor do Voltage Obsidian em variáveis CSS (`:root` para claro,
      `[data-tema="escuro"]` para escuro), sem reescrever componente por componente.
- [ ] Alternador no cabeçalho do frontend; preferência salva por usuário (coluna
      `usuarios.tema_preferido` ou `localStorage` como fallback) e respeita
      `prefers-color-scheme` no primeiro acesso.
- [ ] Conferir contraste em tabelas, gráficos e badges de etapa do funil nos dois temas.

**Aceite:** alternância sem recarregar a página, preferência mantida entre sessões,
contraste adequado nos dois temas nas telas de painel, funil e cofre.

---

## Seção 3 — Planos e cobrança
- [ ] Seed de `planos` (limites em JSON: usuários, perfis de busca, perguntas de IA/mês,
      monitores de chat, GB no cofre, recursos ligados/desligados) e `assinaturas`.
- [ ] `servicos/limites.js` + middleware `exigirRecurso('<recurso>')`; erro no formato
      `{erro, detalhe}` com sugestão de upgrade quando o limite estoura.
- [ ] Teste grátis de 15 dias; telas "Assinatura" e "Uso do plano".
- [ ] `servicos/cobranca.js` com provedor inicial "manual" (administrador ativa o plano) e
      webhook preparado para gateway a escolher depois (Asaas ou Stripe) — nenhuma chave no git.
- [ ] Painel do superadmin (Studio Mythos): organizações, planos, uso, suspensão.

**Aceite:** organização que estoura o limite de um recurso recebe o erro certo e o painel
do superadmin lista uso real das organizações de teste.

---

## Seção 4 — Boletim diário por e-mail
- [ ] `perfis_busca` (organizacao_id, palavras, exclusões, UFs, municípios, modalidades,
      faixa de valor, nota mínima) e `boletins`/`boletim_itens` (histórico).
- [ ] Filtro de palavra-chave roda no nosso banco sobre objeto **e** texto extraído do
      edital — nunca confiar no filtro da API do PNCP (ela ignora `palavraChave` em
      silêncio, achado documentado na seção 0).
- [ ] `jobs/boletim.js` agendado no worker (7h/12h/18h, configurável por perfil), sem
      repetir item já enviado, via `servicos/email.js`. WhatsApp opcional.
- [ ] Tela "Boletins": calendário, histórico, filtro por status/UF, descadastro.
- [ ] `npm run boletim -- --org=<id> --simular`.

**Aceite:** rodar `--simular` contra dado real e confirmar que o boletim de cada perfil só
traz o que casa com suas palavras/UFs, sem duplicar envios anteriores.

---

## Seção 5 — Pergunte ao Edital
- [ ] `POST /api/licitacoes/:id/perguntar` sobre `servicos/ia.js` (já existe, com schema).
- [ ] Busca por trecho no texto já extraído (`jobs/ler-edital.js`), sem banco vetorial;
      resposta cita página/trecho.
- [ ] Conteúdo do edital como dado delimitado; resposta sempre passa pelo schema (23.4).
- [ ] Sem `GEMINI_API_KEY`: botão desligado com o motivo visível.
- [ ] Contagem por organização no limite do plano; histórico em `ia_perguntas`.

**Aceite:** pergunta sobre um edital real baixado retorna resposta com citação de
trecho/página e passa pela validação de schema; edital com texto tipo "ignore as
instruções anteriores" não muda o comportamento da IA.

---

## Seção 6 — Monitor de chat do pregão
- [ ] Estender `jobs/monitorar.js`/`servicos/monitor.js`: adaptador de mensagens da sessão
      **só** onde há consulta pública sem login (candidato: Compras.gov.br — confirmar na seção 0).
- [ ] Portal que exigir login vira `ultimo_status = 'bloqueado'`, com mensagem clara —
      nunca se força (seção 5.4: 4 conexões simultâneas, 1,5 s entre chamadas, User-Agent honesto).
- [ ] Mensagem nova do pregoeiro gera alerta (e-mail/WhatsApp), destacando palavras como
      "convocado", "anexo", "diligência", "prazo".

**Aceite:** sessão real monitorada mostra mensagem nova chegando como alerta, e um portal
que exige login aparece como `bloqueado` sem tentativa de autenticação.

---

## Fluxo de git (válido para todas as seções)
Esta sessão só envia para `claude/admiring-gates-i8k4yg`. Uma seção por commit; ao final de
cada seção, perguntar se já pode seguir para a `main` (o CLAUDE.md pede commit direto na
`main`, mas essa branch é a desta sessão).

## Verificação (repetir a cada seção)
`npm run lint && npm test` antes de qualquer commit. Testes novos sem banco e sem rede:
isolamento entre organizações, limites do plano, montagem/dedup do boletim, schema do
Pergunte ao Edital, portal de chat sem login virando `bloqueado`. Depois, com MySQL local:
`npm run migrar && npm run semear`, duas organizações de teste, coleta real e a seção
correspondente do checklist acima. Resultado medido vai para o commit e o README.
