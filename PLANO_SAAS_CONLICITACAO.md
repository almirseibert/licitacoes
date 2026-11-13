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
- Não explore de novo o que a seção anterior já documentou aqui — leia o resultado
  medido registrado abaixo em vez de redescobrir.

## Roadmap até a versão vendável

O que o ConLicitação faz, o que já temos e o que falta está em
[docs/REFERENCIA_CONLICITACAO.md](docs/REFERENCIA_CONLICITACAO.md). As seções abaixo cobrem
**todo módulo da referência que cabe nas regras do projeto**; ficam de fora o robô de lance, o
cofre de senha de portal e a assinatura digital (ver a tabela de divergências no mesmo arquivo).

| Fase | Seções | O que o cliente ganha | Marco |
|---|---|---|---|
| **A — Fundação SaaS** | 0 ✅, 1 (1a ✅, 1b ✅, 1c), 2 ✅, 3 | Conta própria, equipe, dados isolados, tema claro/escuro, plano e cobrança | Dá para cobrar e isolar clientes |
| **B — Paridade de captação** | 4, 7, 8, 9, 10 | Boletim diário, banco de licitações completo, gestão com tarefas, avisos por tipo, documentos | Substitui o uso diário do ConLicitação na captação |
| **C — IA e inteligência** | 5, 11, 12, 13, 14, 15, 17 | Pergunte ao Edital, resumo com checklist, acompanhamentos, contratos e atas, concorrentes e mercado, API, onboarding | **Versão 1 vendável** — fim da Fase C |
| **D — Estratégia e automação** | 6, 16 | Monitor de chat, alerta de deserta por segmento, consultor jurídico | Planos mais caros |
| **E — Ecossistema** | 18 | Seguro garantia, assessoria cadastral, cursos por parceria | Receita complementar |

Ordem de dependência: **1b antes de tudo** (sem pontuação por organização o resto herda o
defeito do catálogo único), 3 antes de 5/11/16 (limite de IA por plano), 8 antes de 9 (aviso por
tipo precisa dos tipos de andamento), 12 antes de 15 (mercado e concorrente leem contratos e atas).

**Gates de cada fase** (propostos; confirme): A — nenhum segredo no repositório e duas
organizações de teste sem vazamento; B — cobertura de RS conferida contra o ConLicitação no mesmo
filtro durante duas semanas; C — primeiro cliente externo pagante usando sem apoio de quem
desenvolveu; D — cada portal de chat com consulta pública confirmada; E — um serviço
complementar vendido.

---

## Seção 0 — Fechar o levantamento do ConLicitação — ✅ feito em 13/11/2026
- [x] Levantamento da área logada feito pelo Claude in Chrome (fora desta sessão, que não tem
      navegador) e das páginas públicas; consolidado em `docs/REFERENCIA_CONLICITACAO.md` com a
      matriz recurso deles → o que temos → seção do plano.
- [x] Dado da conta navegada (razão social, CNPJ, usuário, boleto, token) deixado de fora do repositório.
- [x] Liberar rede para `conlicitacao.com.br`: **dispensado** — não foi preciso depois do levantamento.
- [ ] Ainda não observado (pedir numa próxima rodada, se for útil): resposta do Pergunte ao
      Edital, um boletim individual, o monitor de chat com vários pregões, o painel de portais
      compatíveis, Perguntas Salvas, Notificações de Documentos e o Calendário.

**Aceite:** tabela de referência publicada ✅ — falta só você revisar a seção 4 dela (divergências).

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

**Seção 1b — entregue em 13/11/2026, verificada contra MariaDB 10.11 real com 450 licitações
reais do PNCP (RS/SC, propostas abertas) e duas organizações pela API:**
- [x] Pontuação/etapa/favorito/descartada (e grupo, palavra casada, objeto social, pode
      participar, proposta, custo, resultado digitado, decisão da IA) movidos para
      `org_licitacoes` (migração `018_org_licitacoes.sql`), com cópia para a organização 1 e as
      colunas apagadas de `licitacoes`. Visões em `backend/servicos/escopo.js`; coleta e
      `repontuar` pontuam por organização; Radar, Funil, Diagnóstico, Estratégicas e
      `executar-repontuar.js` lêem a visão da organização.
- [x] Escopadas por `organizacao_id` as rotas e serviços das tabelas da 017: Configurações/perfil,
      Cofre, Kits, Modelos, Envio, Declarações, Propostas, Funil/anotações, Alertas, Contratos e
      marcos, Questionamentos, Monitor, Oportunidades, IA, Preço, Concorrentes, Dossiês, Painel.
      Fontes ficam catálogo, mantidas só pela organização operadora.
- [x] `configuracoes` decidido: operação (janela de coleta, teto de download) global e só da
      operadora; destino de alerta por organização em `org_configuracoes`.
- [x] Cofre em disco por organização: `org/<id>/…` para documento, pacote, declaração, anexo e
      proposta novos (os antigos seguem pelo caminho gravado no banco).
- [x] Frontend: criar conta, aceite de convite, esqueci/redefinir senha, Equipe e seletor de
      organização.
- [x] Recuperação de senha (token de uso único, 1 h, hash no banco, 3 pedidos/hora).
- [x] Achado na revisão e corrigido: convite para e-mail com conta exige a senha dela (antes o
      link sozinho entregava a conta); papel e vínculo relidos a cada requisição.

**Aceite da Seção 1b (medido):** roteiro de 53 conferências pela API real, 53/53. Radar próprio
sobre o mesmo catálogo (org 1: topo "nobreak" 70 pts, 272 pontuadas; org 2: topo "reforma"
88 pts, 450 pontuadas); etapa, favorito, descarte, custo, valor final, anotação, monitor e
diagnóstico de uma não aparecem na outra; 404 ao ler/editar/apagar pelo id perfil, documento,
kit, modelo, proposta, questionamento, contrato, marco e alerta da outra organização; 403 para
fonte e ajuste de operação fora da operadora; leitor GET 200 / PATCH 403; rebaixado 403 e
removido 401 na hora; convite p/ conta existente sem senha 401, com senha 200; redefinir 200,
reuso 410. Cópia da 018: hash idêntico das 450 linhas da org 1 antes e depois. 20 jobs do worker
sem erro. Lint limpo, 50/50 testes.
**Não verificado:** coleta pelo adaptador do PNCP de ponta a ponta (a busca `/api/search` não
responde deste ambiente; os dados vieram da API de consulta) e envio real de e-mail (sem SMTP).

**Seção 1c — pendente (achados da revisão da 1b):**
- [ ] Monitor: a mesma licitação monitorada por N organizações vai N vezes ao portal — checar uma
      vez por licitação e espalhar o evento (conduta 5.4).
- [ ] `licitacao_exigencias.confirmado_por_usuario` ainda é do catálogo: a correção manual de uma
      organização vale para todas (CLAUDE.md lista como decisão do usuário).
- [ ] `alertas.listar` junta com a visão do catálogo inteiro; trocar por LEFT JOIN direto em
      `org_licitacoes` antes de o catálogo crescer.
- [ ] Ficha de concorrente/órgão e recorrências usam o grupo da organização operadora.
- [ ] Rodar a coleta pelo adaptador do PNCP (busca textual) num ambiente que alcance
      `/api/search` e conferir as linhas de `org_licitacoes` criadas por organização.

**Aceite da Seção 1a (medido):** duas organizações criadas por `/api/auth/cadastro`; a
organização 2 só viu sua própria palavra-chave em `/api/palavras`, recebeu 404 ao tentar editar
ou apagar uma da organização 1; convite aceito uma vez (200), recusado na segunda tentativa
(409); troca para organização de que não é membro recusada (403); convite por quem não é
admin/dono recusado (403) antes de qualquer escrita no banco.

---

## Seção 2 — Tema claro/escuro no painel — ✅ feito em 13/11/2026
- [x] Tokens de cor do Voltage Obsidian em variáveis CSS, sem reescrever componente por
      componente. **Divergência registrada:** o `:root` ficou com o **escuro** (o tema da spec,
      seção 15) e o claro em `[data-tema="claro"]` — sem atributo, nada muda para quem já usa.
      Tokens novos `realce` (hover, era `bg-white/…`) e `apagado` (faixa "Baixa").
- [x] Alternador no rodapé da navegação (o painel não tem cabeçalho; a navegação lateral é o
      cabeçalho dele) e na tela de login; `usuarios.tema_preferido` (migração 019,
      `PATCH /api/auth/tema`) com `localStorage` de reserva e `prefers-color-scheme` no primeiro
      acesso; o `index.html` aplica antes do primeiro pintar.
- [x] Contraste conferido em tabelas, anel de pontuação e etapas do funil nos dois temas
      (`testes/tema.test.js` nos tokens + medição no navegador).

**Aceite (medido):** contra MariaDB zerado (019 aplicada), 150 licitações reais do PNCP e
Playwright: alternância **sem recarregar** (marcador na `window` sobreviveu), banco gravou
`claro`; recarregar manteve; outro navegador (sistema escuro) virou claro no login; sair
limpou o `localStorage`. Contraste de todo texto visível: Radar 518, Funil 380, Documentos 22 —
**0 abaixo de 4,5:1 nos dois temas** (mínimos: escuro 6,43/5,04/6,96; claro 4,64/4,79/5,98). A
primeira medição pegou a faixa "Baixa" do Funil escuro em 3,73:1 — corrigida. API: 200 para
`claro`/`escuro`/`null`, 400 para valor inválido, 401 sem token. Lint limpo, 58/58 testes.

**Seção 2b — pendente:**
- [ ] Se o `PATCH /api/auth/tema` falhar (rede), a escolha vale só nesta sessão e o próximo login
      volta ao que está no banco — avisar ou reenviar.
- [ ] Gráficos: o painel ainda não tem gráfico com cor própria (o Relatório é tabela); quando a
      Seção 8/13/15 trouxer, usar os tokens, não hex.
- [ ] Telas fora do aceite (Proposta, Envio, Contratos…) só foram vistas por amostra; o PDF da
      proposta e o checklist seguem no Voltage escuro de propósito (documento, não tela).

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
- [ ] Três planos **de fato diferentes** (a referência lista os mesmos módulos nos três e cobra de
      R$ 2.871 a R$ 5.409 por ano — o espaço para diferenciar existe). Preços **propostos em
      13/11/2026** (até então só havia a estrutura dos planos, sem número; estes valores ficam
      abaixo da referência no plano de entrada e são revisáveis antes do lançamento):
      **Essencial R$ 149/mês ou R$ 1.490/ano** · **Profissional R$ 299/mês ou R$ 2.990/ano** ·
      **Avançado R$ 499/mês ou R$ 4.990/ano** (anual = 10 meses pagos). Teste grátis de **15 dias**,
      decidido, sem cartão. Estrutura:
      **Essencial** (captação: Radar, boletim, gestão, documentos, declarações, alertas) ·
      **Profissional** (+ Pergunte ao Edital, resumo, acompanhamentos, contratos e atas,
      concorrentes, histórico, API) · **Avançado** (+ estratégicas, mercado, consultor jurídico,
      relatórios). O recurso de cada plano vive em `planos.recursos` (JSON), nunca em `if` no código.
- [ ] Limites por plano: usuários, perfis de busca, perguntas e resumos de IA por mês,
      exportações, GB no cofre, tokens de API.

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
- [ ] Tela "Boletins": calendário mensal com boletins numerados por dia, legenda **não lido / lido
      / lido por outro membro da equipe**, "marcar boletins do filtro como lido", filtro por
      status/UF, descadastro. `boletim_leituras` (boletim_id, usuario_id, lido_em).
- [ ] "Meus filtros" = os `perfis_busca`: um filtro inicial por organização, vários depois, com a
      mesma regra valendo para licitações e para acompanhamentos (Seção 12).
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
- [ ] **Biblioteca de perguntas prontas, escrita por nós** (a referência tem 76 em seis
      categorias — proposta 9, objeto 25, habilitação 18, pagamentos 6, riscos e penalidades 15,
      contrato 3 —; os textos dela não se copiam). Arquivo `backend/config/dados/perguntas-edital.js`,
      uma pergunta por linha com `categoria` e `subtipo`; mínimo de 40 no lançamento, nas mesmas seis
      categorias, escritas sobre a Lei 14.133 e o catálogo de exigências (seção 8 da spec).
- [ ] "Perguntas salvas" por licitação (`ia_perguntas.salva`) e histórico da conversa.
- [ ] A resposta é **assíncrona** (a referência travou em "digitando" por mais de 30 s): a rota
      devolve o id, a tela consulta, e erro de modelo aparece como mensagem, nunca como silêncio.

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
- [ ] Tela "Monitor de chat" com a lista por edital, abas **todos / não lidos / importantes /
      arquivados**, marcar como lido ou importante, arquivar e desativar; e uma página "portais
      compatíveis" que diz, portal a portal, se há consulta pública (e quando não há, diz isso).
- [ ] Alerta de licitação estratégica **por segmento** da organização (iminência de deserta e
      baixa concorrência já existem na seção 22 — falta o filtro por organização e o aviso).

**Aceite:** sessão real monitorada mostra mensagem nova chegando como alerta, e um portal
que exige login aparece como `bloqueado` sem tentativa de autenticação.

---

## Seção 7 — Radar 2.0: o banco de licitações completo (Fase B)
Hoje o Radar tem filtros, pontuação e exportação Excel (`backend/rotas/licitacoes.js`,
`servicos/exportar.js`). Falta o que a referência tem no "Encontrar Licitações".
- [ ] Filtros que faltam em `montarFiltros`: **busca exata** do objeto (aspas), estado / região /
      **raio de atuação** em km a partir da cidade da organização, nº do edital, nº do processo,
      esfera, situação, órgão, texto nos itens, texto na observação, data de inclusão e de prazo com
      atalhos hoje/ontem, "com edital baixado", "com chat monitorado".
- [ ] **Salvar pesquisa**: `pesquisas_salvas` (organizacao_id, nome, filtros JSON) — é o mesmo
      objeto do `perfis_busca` da Seção 4; uma só tabela, os dois usam.
- [ ] Exportar também em **.docx** (`servicos/exportar.js` já faz xlsx), **imprimir** (folha de
      estilo própria) e **compartilhar** por link de leitura com validade (`links_publicos`).
- [ ] Etiquetas de situação no cartão (nova, urgente, SRP, prorrogada, adiada, recebendo propostas,
      homologada, vence hoje) calculadas na leitura, nunca gravadas.
- [ ] Selo **CAPAG** do município (capacidade de pagamento — dado público do Tesouro) e alerta
      "edital exige seguro garantia" (vem do resumo, Seção 11).
- [ ] "Ver itens" que expande no próprio cartão; "ver mais informações" (processo, observação,
      telefone, site); anotação com **ditado por voz** (Web Speech API do navegador, sem enviar áudio).
- [ ] Página de 20 resultados por padrão, selecionar página.

**Aceite:** o mesmo filtro rodado no Radar e no ConLicitação para RS traz conjuntos comparáveis;
cada filtro novo testado contra o banco real com a contagem anotada no commit.

---

## Seção 8 — Gestão por licitação e dashboard (Fase B)
O funil já guarda etapa, anotação, anexo e linha do tempo. Falta o trabalho em equipe.
- [ ] `org_tarefas` (organizacao_id, licitacao_id, titulo, descricao, responsavel_id, prazo, status)
      com as visões **atrasadas / hoje / futuras / concluídas**. Não confundir com `tarefas`, que é a
      fila interna do worker.
- [ ] `org_andamentos` (licitacao_id, texto, autor_id, tipo) — a linha do tempo com "adicionar
      andamento"; reaproveita `LinhaDoTempo.jsx`.
- [ ] Alternância **"por mim / por todos"** em Funil e Radar; favoritas, gerenciadas, finalizadas.
- [ ] Detalhe da licitação com abas Tarefas, Anotações, Anexos, Resultados e Habilitação (a aba
      Habilitação é o cruzamento exigência × cofre que já existe — destacar, é diferencial).
- [ ] **Calendário** de licitação, tarefa e andamento, e agenda do dia (`Calendario.jsx` hoje só
      mostra recorrência).
- [ ] **Dashboard**: cartões (boletim não lido, documentos vencendo, tarefas atrasadas, novos
      andamentos), oportunidades do dia / vigentes / por UF, e **valor total em disputa**.

**Aceite:** duas pessoas da mesma organização veem a mesma tarefa; a de outra organização, nunca.

---

## Seção 9 — Avisos por tipo e por canal (Fase B)
Hoje `servicos/alertas.js`, `email.js` e `whatsapp.js` mandam um aviso só, para um destino só.
- [ ] `notificacoes_config` (usuario_id, canal e-mail / WhatsApp / push, tipos). Tipos:
      esclarecimento, aviso, impugnação, recurso, status, resultado, documento vencendo, tarefa
      atrasada, nova oportunidade.
- [ ] Destino de e-mail e de WhatsApp **por usuário e por organização** — é o que tira
      `configuracoes` (chave `alerta_*`) do escopo global (pendência da Seção 1b).
- [ ] Push do navegador (Web Push + service worker), opcional por usuário.
- [ ] WhatsApp: modelos de mensagem **submetidos à Meta antes do lançamento** (alerta de prazo,
      resumo do dia, convocação no chat). Resposta "favoritar" e "criar tarefa" é diferencial,
      mas só depois do alerta simples funcionar.

**Aceite:** um usuário desliga "recurso" por WhatsApp e continua recebendo "esclarecimento" por
e-mail, verificado com SMTP e WhatsApp reais de teste.

---

## Seção 10 — Documentos, declarações e agenda de portais (Fase B)
- [ ] Cofre com **grupos** (habilitação jurídica, regularidade fiscal/social/trabalhista,
      qualificação técnica, econômico-financeira, outros) e **situação** (disponível / pendente /
      vencendo); filtros por grupo e situação.
- [ ] Regra de produto da referência: documento **sem validade formal é revisado a cada 90 dias**
      (alerta, não bloqueio).
- [ ] Download em lote e **enviar por e-mail**.
- [ ] Declarações: o painel tem 11 modelos; **faltam "renúncia de vistoria" e "carta de
      credenciamento"** (`backend/config/dados/modelos-declaracao.js`). Cada modelo mantém o aviso
      "confira o texto do edital".
- [ ] 🚫 **Certidão automática ("coletando")**: não se faz — a emissão exige CAPTCHA ou gov.br. No
      lugar: lembrete de vencimento e um botão que abre a página oficial de emissão.
- [ ] 🚫 **Cofre de login e senha de portal**: não se faz (CLAUDE.md). No lugar, uma **agenda de
      portais**: nome, URL, tipo, **vencimento do login**, observação — sem login e sem senha — com
      alerta no dashboard quando o cadastro no portal está para vencer.

**Aceite:** documento sem validade aparece para revisão aos 90 dias; nenhuma coluna do banco guarda
senha de portal (conferido por `SHOW COLUMNS`).

---

## Seção 11 — Resumo do Edital 2.0 (Fase C)
A leitura assistida (seção 23, `servicos/ia.js`, `LeituraIA.jsx`) já resume com schema. Ampliar a
estrutura do que ela devolve, sem perder a regra "IA só sugere".
- [ ] Novo schema com: cabeçalho (valor, modalidade, sessão), identificação, sessão pública (modo
      de disputa e **intervalo mínimo entre lances**), órgão, detalhes (execução, ME/EPP, visita
      técnica, amostra, critério de julgamento, regionalidade, prova de conceito), **garantias**
      (proposta, contrato, adicional, retomada), prazos, proposta (validade, desempate), itens,
      habilitação, legislação, pagamento, **penalidades e multas**.
- [ ] **Possíveis questionamentos**: ponto do edital + trecho citado + lei invocada, com botão que
      já abre o pedido de esclarecimento ou de impugnação (`Questionamentos.jsx`, seção 25).
- [ ] **Análise crítica** (subcontratação, reajuste, renovação, conflito entre edital e minuta) e o
      campo "considerações do licitante" (salvo por organização).
- [ ] Saídas: checklist por e-mail, **.docx**, impressão.
- [ ] Toda afirmação cita o trecho; campo vazio vira "Não informado", nunca palpite. Data de geração
      e aviso "a IA pode errar" sempre visíveis; **gera uma vez e só refaz a pedido** (cache por hash
      já existe em `ia_execucoes`).

**Aceite:** 10 editais reais resumidos e conferidos um a um contra o trecho citado, com o número de
afirmações erradas no commit (o aceite da Fase 4 da spec admite no máximo uma marcação discutível).

---

## Seção 12 — Acompanhamentos, contratos e atas do mercado (Fase C)
O painel conhece os eventos das licitações que monitora e os contratos que a organização ganhou.
Falta o banco **de mercado**.
- [ ] Adaptador PNCP para **contratos** e **atas de registro de preços** (ID da ata, ID da
      contratação, vigência, valor, empresa, CNPJ, data de assinatura) em tabelas de catálogo
      compartilhado — `mercado_contratos`, `mercado_atas` (sem `organizacao_id`, é dado público).
      Mesma conduta da seção 5.4; confirmar no PNCP o formato e os limites antes de codar.
- [ ] **Acompanhamentos**: publicações posteriores ao edital (adjudicação, homologação, resultado)
      de **qualquer** licitação do catálogo, com filtros por objeto, UF, cidade, órgão, esfera,
      edital, modalidade, data e atividade; alerta quando uma **favorita** recebe publicação nova.
- [ ] Telas "Contratos do mercado" e "Atas" com filtros de vigência, valor estimado e contratado,
      empresa, CNPJ do fornecedor, tipo e poder; aviso de **ata perto do fim da vigência**.
- [ ] Nome claro nas telas: "Meus contratos" (os da organização, seção 28) × "Contratos do mercado".

**Aceite:** contagem de contratos e atas de RS por mês conferida contra o próprio portal do PNCP em
uma amostra de 30 registros, com divergências anotadas.

---

## Seção 13 — Concorrentes, histórico e mercado (Fase C)
Dossiê do concorrente (seção 26), sanções CEIS/CNEP e o histórico já existem. Completar com o que
a referência mostra por CNPJ.
- [ ] Perfil por CNPJ: total de disputas e vencidas, valor ganho, contratos por UF e por
      modalidade, itens vencidos e não vencidos — a partir de `mercado_contratos` (Seção 12).
- [ ] **Motivos de desclassificação e inabilitação** (percentual e principais motivos). Depende de o
      PNCP expor o motivo — **verificar antes de prometer**; sem o dado, a tela diz "não disponível"
      em vez de inventar.
- [ ] **Concorrentes recorrentes nos meus segmentos**: lista pela palavra-chave da organização.
- [ ] **Análise de mercado**: compras por região, modalidade, órgão, concorrentes e produtos, por
      período e filtro salvo; **relatório mensal por segmento** em PDF (já existe `Relatorio.jsx`).
- [ ] Meu histórico com **motivos de perda e recomendação** (diagnóstico da seção 20 já calcula).

**Aceite:** relatório de mercado de um segmento conferido contra amostra manual, com a diferença
medida no commit.

---

## Seção 14 — API, token e webhook (Fase C)
- [ ] `tokens_api` (organizacao_id, hash do token, ips_liberados, ultimo_uso). O token aparece **uma
      vez**, na criação; no banco só o hash. Rota `/api/v1/*` autenticada por token, com limite por plano.
- [ ] Lista de IPs liberados (vazia = qualquer); recusa fora da lista.
- [ ] **Webhook de novas oportunidades** por filtro salvo (assinatura HMAC no cabeçalho).
- [ ] Documentação da API em `docs/API.md`.

**Aceite:** chamada com token válido de IP liberado responde; de IP fora da lista, 403; token
revogado, 401; nenhum token em texto puro no banco.

---

## Seção 15 — Painel de mercado do cliente: histórico e relatórios (Fase C)
Reunir o que o cliente consulta toda semana numa só tela "Meu desempenho": participações, itens
vencidos, ticket médio, órgãos, portais, motivos de perda, margem por licitação (Preço de
referência + contrato). A margem é **diferencial** — a referência não calcula.
- [ ] Tela única com os blocos acima, por período (todo, 1/3/6 meses, 1 ano, definido) e impressão.

**Aceite:** os números batem com `contratos`, `propostas` e `historico_precos` da organização,
conferidos por consulta direta.

---

## Seção 16 — Consultor jurídico (Fase D)
- [ ] Chat sobre a Lei 14.133 com histórico e "novo chat", **sempre citando o artigo**.
- [ ] **Base jurídica revisada por advogado antes de publicar**, e aviso fixo "não substitui
      advogado". **Bloqueada: o advogado revisor ainda não foi definido (13/11/2026).** Sem ele
      a Seção 16 não sai; as demais seções da Fase D (monitor de chat) seguem normalmente.
- [ ] Biblioteca "Jurídico Fácil": artigos curtos, busca, filtros por tema. Conteúdo **nosso**.

**Aceite:** 20 perguntas de teste respondidas com artigo correto, conferidas pelo advogado revisor.

---

## Seção 17 — Onboarding, ajuda e suporte (Fase C — entra na versão 1)
- [ ] Assistente de primeiro acesso: cadastra a empresa, os CNAEs, as palavras-chave e o primeiro
      filtro em poucos passos (hoje o seed faz isso só para a Studio Mythos).
- [ ] Central de ajuda com vídeos curtos por ferramenta, e "Solicitações" (protocolo, assunto, data,
      status) para falar com o suporte.
- [ ] Pesquisa NPS depois de 30 dias de uso; **status das ferramentas** (coleta e worker de pé).
- [ ] Termos de uso, política de privacidade, aviso de que a IA pode errar; exclusão de dados sob
      pedido (LGPD).
- [ ] Trilha de auditoria: quem entrou, quem alterou documento, tarefa e etapa.

**Aceite:** uma organização nova, sem apoio de ninguém da equipe, chega ao primeiro boletim em
menos de 15 minutos.

---

## Seção 18 — Ecossistema (Fase E)
- [ ] **Seguro garantia** como captação de lead para corretora parceira (a referência abre uma
      cotação com termo de vínculo legal; aqui o painel só encaminha o lead, não emite apólice).
- [ ] Assessoria cadastral (CRC), cursos, clipping e bolsa de empregos **por parceria**, vendidos
      junto com o plano.
- [ ] 🚫 Fora: assinatura digital e robô de lance (CLAUDE.md e seção 5.4).

**Aceite:** um serviço complementar vendido a um cliente ativo.

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
