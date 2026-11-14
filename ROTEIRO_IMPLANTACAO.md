# Roteiro de implantação — o que falta nos dois planos, na ordem

Gerado em 14/11/2026 a partir da leitura dos dois planos e do código; a tabela do plano SaaS
foi atualizada depois da Seção 13. A ordem da seção 2 abaixo continua valendo; as linhas 1 a 13
já foram feitas. Não substitui nenhum
deles: a spec (`PAINEL_LICITACOES_INSTRUCOES.md`) e o plano SaaS (`PLANO_SAAS_CONLICITACAO.md`)
continuam sendo a fonte da verdade; este arquivo só ordena o que ainda está aberto.

## 1. Estado dos dois planos

### Spec original — 14 fases + 32 seções
Entregue: **as 14 fases** (git: "Fase 1" a "Fase 14 — extras") e a revisão de 07–08/11.
Sobram 3 itens abertos, nenhum é código novo de funcionalidade:

| Item | Onde está | Quem resolve | Onde entra no roteiro |
|---|---|---|---|
| Deploy no EasyPanel + subdomínio HTTPS (`GRANT`, colar `DB_PASSWORD`/`JWT_SECRET`, DNS) | spec Fase 1; `IMPLANTACAO.md` | **uma pessoa** (segredo de produção) | Marco D, logo após a 1b |
| Tela funciona em 390 px de largura | spec seção 32 | código | junto da Seção 2 |
| Contraste do texto ≥ 4,5:1 sobre `#0A0E1A` | spec seção 32 | código | junto da Seção 2 (o aceite dela é contraste) |

### Plano SaaS — Seções 0 a 18 (estado em 14/11/2026, depois da Seção 13)
| Seção | Estado | Pendências (`- [ ]` no plano) |
|---|---|---|
| 0 Levantamento | ✅ 13/11 | 1 (resposta do Pergunte ao Edital ainda não observada no ConLicitação) |
| 1a Base multiempresa | ✅ 12/11 | — |
| 1b Isolamento | ✅ 13/11 | — |
| **1c** Achados da revisão da 1b | ❌ aberta | 5 |
| 2 Tema claro/escuro | ✅ 13/11 | 3 (2b) |
| 3 Planos e cobrança | ✅ 13/11 | 6 (3b) — gateway real não escolhido |
| 4 Boletim diário | ✅ 13/11 | 5 (4b) |
| 5 Pergunte ao Edital | ✅ 14/11 | 5 (5b) — **aceite com Gemini real pendente** |
| 6 Monitor de chat | ❌ não iniciada | 5 |
| 7 Radar 2.0 | ✅ 13/11 | 6 (7b) — CAPAG, chat (depende da 6) |
| 8 Gestão e dashboard | ✅ 13/11 | 3 (8b) |
| 9 Avisos por tipo e canal | ✅ 14/11 | 7 (9b) — **aceite com SMTP/WhatsApp reais pendente** |
| 10 Documentos e portais | ✅ 14/11 | 3 (10b) |
| 11 Resumo do Edital 2.0 | ⚠️ código 14/11 | 4 (11b) — **aceite da spec (10 editais, Gemini real) pendente** |
| 12 Mercado: contratos e atas | ✅ 14/11 | 3 (12b) — carga histórica além de ~16 dias |
| 13 Concorrentes e mercado | ✅ 14/11 | 3 (13b) |
| 14 API, token e webhook | ❌ não iniciada | 4 |
| 15 Meu desempenho | ❌ não iniciada | 1 |
| 16 Consultor jurídico | 🚫 bloqueada (advogado revisor) | 3 |
| 17 Onboarding, ajuda, LGPD, auditoria | ❌ não iniciada | 5 |
| 18 Ecossistema | ❌ não iniciada | 3 (um deles é a lista do que fica fora) |

Seções novas ainda por fazer: **14 → 15 → 17 → 6 → 18** (16 bloqueada). O detalhe de cada
pendência está no próprio plano, na seção e na sua "Nb".

## 2. Ordem de implantação

Uma conversa por linha (`/implantar <id>`). Dependências conferidas contra o texto de cada seção.

### Fase A — Fundação (marco: dá para cobrar e isolar clientes)
| # | Seção | Por que nesta posição |
|---|---|---|
| 1 | **1b-A — isolamento no backend**: `org_licitacoes` (pontuação/etapa/favorito/descarte por organização) rota a rota e em `executar-repontuar.js`; escopar as ~15 rotas da migração 017; decidir `configuracoes`; cofre em disco por organização | Tudo depois herda o defeito do catálogo único. Sem isto, `/api/v1` (14) vaza e o gate A reprova. Exige banco real e duas organizações. |
| 2 | **1b-B — frontend e senha**: cadastro de organização, convite, aceitar convite, trocar organização, "Equipe", recuperação de senha | Sem tela, nenhum cliente entra. Separada da 1b-A porque a 1b-A já é grande e a 1b-B é só interface + e-mail. |
| — | **Marco D — deploy** (humano, em paralelo) | Faz as migrações 016–017 (e as da 1b) rodarem no **MySQL 8 de verdade** (aqui só se testa em MariaDB, que não aceita `CAST(? AS JSON)`). Quanto antes, mais barato corrigir. |
| 3 | **2 — Tema claro/escuro** + 390 px + contraste 4,5:1 | Pequena, independe das outras; fecha dois itens da spec seção 32. Fazer antes de mais telas evita retrabalho em cada tela nova. |
| 4 | **3 — Planos e cobrança** (planos/assinaturas, `exigirRecurso`, teste de 15 dias, cobrança manual, superadmin) | Pré-requisito de 5, 11, 14, 16 (limite por plano) e de 6 (monitores). **Gate A** fecha aqui: nenhum segredo no repo + duas organizações sem vazamento. |

### Fase B — Paridade de captação
| # | Seção | Por que nesta posição |
|---|---|---|
| 5 | **4 — Boletim diário** | Cria `perfis_busca`, que a 7 reaproveita (`pesquisas_salvas` é o mesmo objeto) e que o webhook da 14 consome. Primeiro uso real de `org_licitacoes` + plano. |
| 6 | **7 — Radar 2.0** | Estende `montarFiltros` e o `perfis_busca`. **Começa o relógio do gate B** (duas semanas comparando RS com o ConLicitação): não esperar a 10 para medir. |
| 7 | **8 — Gestão e dashboard** | Dá os tipos de andamento que a 9 precisa; o dashboard recebe os alertas da 10. |
| 8 | **9 — Avisos por tipo e canal** | Depende da 8. Também tira `configuracoes.alerta_*` do escopo global. WhatsApp: submeter os modelos à Meta **no começo** (aprovação demora). |
| 9 | **10 — Documentos, declarações, agenda de portais** | A agenda de portais alerta no dashboard (8). Sem senha de portal, sem certidão automática. **Gate B** fecha aqui (+ as duas semanas medidas). |

### Fase C — IA e inteligência (marco: versão 1 vendável)
| # | Seção | Por que nesta posição |
|---|---|---|
| 10 | **5 — Pergunte ao Edital** | Precisa do limite de IA (3). Estabelece o padrão de IA por organização que a 11 reusa. |
| 11 | **11 — Resumo do Edital 2.0** | Amplia o schema da IA; alimenta o selo "exige seguro garantia" que a 7 deixou como pendente. |
| 12 | **12 — Acompanhamentos, contratos e atas do mercado** | Cria `mercado_contratos` / `mercado_atas`. Confirmar no PNCP formato e limites **antes** de codar. |
| 13 | **13 — Concorrentes, histórico e mercado** | Lê o que a 12 criou. |
| 14 | **14 — API, token e webhook** | Precisa de 3 (limite), 4 (filtro salvo do webhook), 1b (isolamento). Fica depois da 13 para a API já expor o que existe. Pode subir antes se um cliente pedir. |
| 15 | **15 — Meu desempenho** | Lê contratos/atas (12) e motivos (13). |
| 16 | **17 — Onboarding, ajuda, LGPD, auditoria** | Aceite exige chegar ao primeiro boletim (4) em <15 min, então só no fim. **Exceção:** termos, política de privacidade e exclusão de dados (LGPD) têm de existir **antes do primeiro cliente externo** — se um beta entrar antes, puxe esse pedaço para a frente. **Gate C**: primeiro cliente externo pagante usando sem apoio. |

### Fase D e E
| # | Seção | Observação |
|---|---|---|
| 17 | **6 — Monitor de chat** | Depende de 3 (limite) e 9 (canais). Só onde há consulta pública sem login; portal com login vira `bloqueado`. Confirmar portal a portal antes. |
| — | **16 — Consultor jurídico** | **Bloqueada** até haver advogado revisor. Não começar. |
| 18 | **18 — Ecossistema** | Por parceria; por último. |

## 3. Pendências de documentação a corrigir no caminho
- `PLANO_SAAS_CONLICITACAO.md`, "Fluxo de git": cita o branch `claude/admiring-gates-i8k4yg`; o desta
  sessão é `claude/exciting-einstein-r6coyq`. Além disso o `CLAUDE.md` manda commit direto na `main`
  e o comando `/implantar` manda branch sem PR — decidir qual vale (sugestão: branch por sessão,
  `main` só quando você autorizar, como o plano já diz).
- `README.md`, "Próximo passo": ainda diz que o login é o do CRM ("mesmo `JWT_SECRET` e os mesmos
  usuários"). Desde a 1a o painel tem usuários próprios; o `IMPLANTACAO.md` já está certo.
  Corrigir no commit da 1b-B.
- `npm test` puro falha neste ambiente (`node --test testes/`); usar
  `node --test "testes/**/*.test.js"` ou corrigir o script no `package.json` (uma linha).
- A spec menciona "33 testes", o `CLAUDE.md` diz 30: conferir e alinhar.

## 4. Riscos que valem decisão sua antes de começar
1. **Preços do plano** (R$ 149/299/499) são propostos, não decididos — só travam na Seção 3.
2. **Gateway de cobrança** (Asaas ou Stripe): a Seção 3 entrega só o provedor "manual"; sem gateway
   não há cobrança automática. Decidir antes de vender, não antes de codar.
3. **Banco de teste é MariaDB**; produção é MySQL 8. O Marco D é o único jeito de validar de fato.
