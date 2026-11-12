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

**Seção 1a — entregue em 12/11/2026, verificada contra MariaDB 10.11 real (migrar + API de
ponta a ponta, não mock):**
- [x] Migração `016_organizacoes.sql`: `organizacoes`, `usuarios` (próprios, bcrypt),
      `organizacao_membros` (papel: dono/admin/membro/leitor), `convites`, e `org_licitacoes`
      já criada (ainda vazia — ver Seção 1b).
- [x] Migração `017_organizacao_escopo.sql`: `organizacao_id` + índice em 16 tabelas de dado
      próprio do cliente — `palavras_chave`, `palavras_excluidas`, `palavras_sugeridas`,
      `regras_pontuacao`, `empresa_perfis`, `empresa_documentos`, `documento_kits`, `pacotes`,
      `licitacao_anexos`, `modelos_declaracao` (nulo = padrão do sistema), `anotacoes`,
      `propostas`, `monitoramentos`, `alertas`, `contratos`, `questionamentos`.
- [x] Revisão da lista original do plano contra o schema real: `fontes`, `licitacoes` e o
      resto do catálogo ficam sem `organizacao_id` (combinado); `tarefas` (fila do worker),
      `ia_execucoes` (cache por hash), `recorrencias` (padrão do órgão) e `sancoes_consultas`
      (fato do CNPJ) também ficam de fora — são infraestrutura ou fato público, não decisão do
      cliente. `configuracoes` mistura os dois e fica pendente de uma decisão de produto
      (Seção 1b).
- [x] `backend/rotas/auth.js`: cadastro, login, troca de organização, convite e aceite de
      convite. JWT passa a levar `id`, `organizacao_id` e `papel` (recuperação de senha fica
      para depois — hoje a saída é convidar de novo).
- [x] Removido `backend/config/db-auth.js` (login não vem mais do banco do CRM).
- [x] `autenticar.js` ganha `exigirPapel(...)` com a ordem leitor < membro < admin < dono;
      token no formato antigo (sem `organizacao_id`) é recusado.
- [x] `backend/rotas/palavras.js` escopada por `organizacao_id` como referência do padrão —
      toda consulta com `WHERE organizacao_id = ?`, todo `UPDATE`/`DELETE` com a organização no
      `WHERE` (nunca no `SET`). Testado: organização 2 não vê, não edita e não apaga palavra da
      organização 1.
- [x] Testes sem banco: `testes/autenticar.test.js` (7 casos) e `testes/organizacao.test.js`
      (4 casos) — `npm test` (com `node --test "testes/**/*.test.js"` nesta sessão; `node --test
      testes/` sozinho já falhava antes desta fase, é do ambiente, não desta mudança).
- [x] Registrada a divergência na migração 016 (comentário) — a seção 2/13 da spec vira
      multiempresa.

**Seção 1b — pendente, cada item exige banco real antes de fechar:**
- [ ] Mover pontuação/etapa/favorito/descartada de `licitacoes` para `org_licitacoes`, rota a
      rota (Radar, Funil, Diagnóstico, Estratégicas, `executar-repontuar.js`), sem quebrar quem
      já usa o painel hoje.
- [ ] Escopar por `organizacao_id` as ~15 rotas restantes que leem as tabelas da migração 017
      (Configurações/perfil, Cofre, Kits, Modelos, Funil, Alertas, Contratos, Questionamentos).
- [ ] Decidir o que fazer com `configuracoes` (separar ajuste de operação de preferência do
      cliente) antes de lhe dar `organizacao_id`.
- [ ] Cofre em disco por organização: hoje o caminho em `DIR_DADOS` não leva `organizacao_id` —
      a tabela já isola a referência no banco, mas o arquivo físico ainda não.
- [ ] Frontend: telas de cadastro de organização, convite, aceitar convite, trocar de
      organização e "Equipe" — o login atual continua funcionando sem nenhuma mudança porque o
      formato da resposta de `/api/auth/login` não mudou.
- [ ] Recuperação de senha.

**Aceite da Seção 1a (medido):** duas organizações criadas por `/api/auth/cadastro`; a
organização 2 só viu sua própria palavra-chave em `/api/palavras`, recebeu 404 ao tentar editar
ou apagar uma da organização 1; convite aceito uma vez (200), recusado na segunda tentativa
(409); troca para organização de que não é membro recusada (403); convite por quem não é
admin/dono recusado (403) antes de qualquer escrita no banco.

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
