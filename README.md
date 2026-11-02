# Painel de Licitações — Studio Mythos

CRM de captação e inscrição em licitações de órgãos públicos. A especificação completa
está em [PAINEL_LICITACOES_INSTRUCOES.md](PAINEL_LICITACOES_INSTRUCOES.md) — 32 seções, 14 fases.

**Estado: Fase 1 (Fundação) implementada e validada em 02/11/2026** — primeira coleta real no
PNCP trouxe **1.305 licitações em aberto, nenhuma duplicada**, todas com link que abre o edital
no portal (5 na faixa alta, 201 em "analisar", 527 "talvez"). O que existe hoje:

| Item da Fase 1 | Onde |
|---|---|
| Estrutura do app e Docker | [Dockerfile](Dockerfile), [package.json](package.json) |
| Tabelas 4.1 a 4.4 + fila + migrations | [backend/migrations/001_fundacao.sql](backend/migrations/001_fundacao.sql) |
| Login com o JWT do painel atual | [backend/rotas/auth.js](backend/rotas/auth.js) |
| Adaptador `pncp` (busca, detalhe, itens, arquivos) | [backend/adaptadores/pncp.js](backend/adaptadores/pncp.js) |
| Seed de fontes e palavras-chave | [backend/config/semear.js](backend/config/semear.js) |
| Job `coletar_fontes` com fila em tabela | [backend/jobs/coletar.js](backend/jobs/coletar.js), [backend/servicos/fila.js](backend/servicos/fila.js) |
| Motor de aderência 0–100 | [backend/regras/aderencia.js](backend/regras/aderencia.js) |
| Tela Radar com filtros e tabela | [frontend/src/paginas/Radar.jsx](frontend/src/paginas/Radar.jsx) |

Tudo em português: código, comentários, tabelas, interface.

---

## Como rodar

### 1. Variáveis de ambiente

```bash
cp .env.example .env
```

Preencha no `.env`:

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` — o mesmo servidor MySQL do painel atual.
  `DB_DATABASE=licitacoes` é um **banco separado**: nunca tabelas misturadas com as do CRM (seção 2.1).
- `AUTH_DB_DATABASE` — o banco do painel atual, lido **somente** para autenticar na tabela `usuarios`.
- `JWT_SECRET` — o mesmo segredo do painel atual, para o token valer nos dois sistemas.

Nenhuma credencial fica no código. O `.env` está no `.gitignore`.

### 2. Banco e carga inicial

```bash
npm install
```

```bash
npm run migrar
```

```bash
npm run semear
```

O seed cadastra as 7 fontes da seção 5.5 (só o PNCP ativo), as 36 palavras-chave validadas
e as palavras de corte. Rodar de novo não duplica nem desfaz o que você editou na tela.

> **MySQL gerenciado (EasyPanel, aaPanel):** o usuário da aplicação costuma ter privilégio
> apenas no próprio banco e não pode criar bancos. Nesse caso, rode uma vez no console do
> serviço MySQL, como root:
>
> ```sql
> CREATE DATABASE IF NOT EXISTS `licitacoes` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
> GRANT ALL PRIVILEGES ON `licitacoes`.* TO 'mysql'@'%';
> ```
>
> O `npm run migrar` segue em frente sozinho quando o banco já existe. Para rodar de fora do
> servidor, use o **host e a porta externos** do serviço MySQL (em Credenciais → Host Externo),
> não o host interno nem a porta da rede privada.

### 3. API, worker e tela

```bash
npm run api
```

```bash
npm run worker
```

```bash
npm run dev:front
```

A API sobe na porta 4000; o Vite na 5173, com proxy de `/api` para a API.

### 4. Primeira coleta

Pelo painel: botão **Coletar agora** no Radar (enfileira e o worker processa).
Pelo terminal, sem worker:

```bash
npm run coletar
```

Variações úteis:

```bash
npm run coletar -- --fonte=1 --termo="videomonitoramento" --simular
```

`--simular` não grava nada: devolve o que o portal retornou e a pontuação que cada licitação teria.

---

## Arquitetura

```
frontend/   React 18 + Vite + Tailwind (Voltage Obsidian, seção 15)
backend/
  adaptadores/  pncp.js — um arquivo por portal (seção 5)
  regras/       aderencia.js — pontuação 0-100 (seção 6)
  servicos/     fila.js (mysql | bullmq), http.js (boa conduta da seção 5.4)
  jobs/         coletar.js — coletar_fontes, coletar_fonte, detalhar_licitacao
  rotas/        auth, licitacoes, fontes, palavras, painel
  migrations/   SQL versionado, aplicado uma vez cada
worker/     processo separado que consome a fila
```

A fila é abstraída: `FILA_DRIVER=mysql` (padrão, tabela `tarefas` com
`FOR UPDATE SKIP LOCKED`) ou `FILA_DRIVER=bullmq` com `REDIS_URL`. Trocar é uma linha no `.env`
— o resto do código não sabe qual está em uso (seção 2.2).

### Regras de boa conduta na coleta (seção 5.4)

Implementadas em [backend/servicos/http.js](backend/servicos/http.js), valem para todo adaptador:
`User-Agent` honesto, no máximo 4 requisições simultâneas, 1,5 s entre chamadas ao mesmo domínio,
`AbortController` com 30 s em toda requisição, 3 tentativas com espera de 2 s / 8 s / 30 s em 5xx,
e `Retry-After` respeitado. Nunca autentica em portal de terceiro, nunca resolve CAPTCHA.

---

## Deploy no EasyPanel

Dois serviços a partir do **mesmo Dockerfile**, mudando só o comando:

| Serviço | Comando | Observação |
|---|---|---|
| `licitacoes-api` | `npm run api` | expõe a porta 4000, domínio `licitacoes.studiomythos.com.br` |
| `licitacoes-worker` | `npm run worker` | sem domínio, sem porta |

Volume persistente em `/dados` (editais e documentos da empresa ficam fora do container).
As variáveis do `.env` entram em **Environment** nos dois serviços. Rodar `npm run migrar`
uma vez (pelo Shell do serviço) após o primeiro deploy.

---

## Rotas da API

```
POST   /api/auth/login              GET /api/auth/eu
GET    /api/licitacoes              ?busca&grupo&uf&modalidade&valor_min&valor_max
                                    &pontuacao_min&prazo_dias&exclusivo_me&etapa&ordem&pagina
GET    /api/licitacoes/filtros      opções dos seletores do Radar
GET    /api/licitacoes/:id          com itens
PATCH  /api/licitacoes/:id          etapa, favorito, descarte
POST   /api/licitacoes/:id/detalhar enfileira detalhe + itens
GET    /api/fontes                  POST /api/fontes/:id/testar   (simula, não grava)
POST   /api/fontes/:id/coletar      POST /api/fontes/coletar-todas
GET    /api/fontes/execucoes        histórico das últimas coletas
GET    /api/palavras                GET /api/painel/resumo        GET /api/saude
```

Erro sempre no formato `{ "erro": "mensagem em português", "detalhe": "técnico" }`.

---

## Próximo passo — Fase 2

Editável pelo usuário: CRUD de Fontes com "Testar agora", CRUD de Palavras-chave com "Simular",
pesos da aderência na tabela `regras_pontuacao` com tela de Configurações, e a checagem de objeto
social por CNAE (seção 6.2). O critério de aceite é adicionar a palavra "videomonitoramento",
simular, ativar e ver as novas licitações na coleta seguinte — sem tocar em código.
