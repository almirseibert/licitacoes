---
description: Implanta UMA seção do PLANO_SAAS_CONLICITACAO.md (uma conversa por seção, com economia de tokens)
argument-hint: <número da seção, ex.: 1b, 2, 3, 4, 7...>
---

Implante a **Seção $ARGUMENTS** do `PLANO_SAAS_CONLICITACAO.md`. Uma seção por conversa: o
estado vive no repositório (plano + README), não na sua memória.

## 1. Entrada barata (não leia o repositório inteiro)

- Leia **só** a seção pedida do plano: `Grep` por `^## Seção N ` (N = o número) e `Read` com
  `offset`/`limit`. **A 1b não tem heading próprio**: é o bloco "Seção 1b — pendente" dentro de
  `## Seção 1`; leia só esse bloco. Leia também a tabela "Roadmap" e "Gates" no topo, e o
  resultado medido da seção anterior (o `[x]` e o "Aceite medido").
- Se a seção depende de outra ainda não marcada ✅, **pare e diga qual falta** — não improvise.
  Dependências: 1b antes de tudo; 3 antes de 5/11/16; 8 antes de 9; 12 antes de 13; 13 antes
  de 15. Ordem sugerida: 1b → 2 → 3 → 4 → 7 → 8 → 9 → 10 → 5 → 11 → 12 → 13 → 14 → 15 → 17 → 6 → 18.
  Seção 16 está **bloqueada** (advogado revisor indefinido): não comece.
- Para varrer vários arquivos use o agente **Explore** (devolve só a conclusão). Use `Grep`
  antes de `Read`; leia faixas de linha, nunca arquivo grande inteiro; não releia o que acabou
  de editar. Chamadas independentes vão **na mesma resposta**, em paralelo.
- Respostas curtas: sem recapitular o plano, sem narrar o que vai fazer. Fale ao fim.

## 2. Regras do projeto (CLAUDE.md vale; resumo do que mais erra)

- Tudo em português. Erro de API: `{ erro, detalhe }` — `detalhe` só em log (`responderErro`).
- A coleta **não sobrescreve decisão do usuário**; IA **só sugere**, passa pelo schema; dado que
  falta vira lacuna visível, nunca valor inventado.
- Nunca autenticar em portal de terceiro, guardar senha de portal ou certificado, resolver
  CAPTCHA; nada de robô de lance nem assinatura digital.
- Toda tabela por organização leva `organizacao_id`; todo `SELECT/UPDATE/DELETE` filtra por
  `req.organizacaoId` (no `WHERE`, nunca no `SET`). Catálogo compartilhado não leva.
- Migração nova = arquivo novo em `backend/migrations/` (nunca editar uma já aplicada).

## 3. Skills por tipo de trabalho (invoque com a ferramenta Skill, só as que se aplicam)

| Seção / tipo | Skill |
|---|---|
| Qualquer seção, ao terminar o código | `code-review` (nível `medium`) e depois `simplify` |
| 1b, 3, 14 (isolamento, cobrança, token de API) e qualquer rota nova de auth | `security-review` |
| Telas novas (2, 7, 8, 10, 15, 17) | `run` — subir a API e o front e conferir com Playwright (screenshot `deviceScaleFactor: 1`) |
| Dashboard e gráficos (8, 13, 15) | `dataviz` antes de escrever o primeiro gráfico |
| IA (5, 11) | **não** use `claude-api`: o projeto usa Gemini; siga `servicos/ia.js` e o schema da seção 23.4 |
| Pagar/cobrar, tarefas recorrentes (3, 4, 9) | `loop` só se precisar vigiar algo; senão, nenhuma |

## 4. Verificar contra dado real (o aceite da seção 16 da spec)

- Banco de teste: se não houver MySQL, `apt-get install -y mariadb-server`, suba com
  `mysqld_safe` e use um `.env` **fora do git** (`.env` já é ignorado). MariaDB não aceita
  `CAST(? AS JSON)`: é limite do ambiente de teste, produção é MySQL 8 — não "conserte" isso aqui.
- Rode `npm run migrar` num banco **zerado** (migração que falha no meio deixa DDL aplicada).
- Exercite pela API real (curl) e meça: números, códigos HTTP, contagens. Para isolamento, use
  **duas organizações** e tente editar/apagar o dado da outra pelo id.
- `npm run lint` e `node --test "testes/**/*.test.js"` (o `npm test` puro falha neste ambiente
  por causa de `node --test testes/`, e já falhava antes). Testes novos, sem banco e sem rede,
  para o que erra calado.
- Se um aceite não puder ser verificado (falta portal, chave, dado), **diga** — não marque ✅.

## 5. Fechar a seção

1. Marque `[x]` no plano, com data e o **aceite medido** (números reais). O que ficou para
   depois vira `[ ]` numa "Seção Nb" no próprio plano.
2. Atualize o README (o que entregou, onde está, o aceite) e `.env.example` se houve variável.
3. Commit em português, no branch da sessão, com os trailers de atribuição; `git push -u origin
   <branch>` (até 4 tentativas). **Sem PR** e sem `main`, salvo se o usuário pedir.
4. Termine com **4 linhas**: o que entregou, o aceite medido, o que ficou pendente, e a próxima
   seção sugerida pela ordem de dependência.
5. Finalize com: "Abra uma conversa nova (`/clear`) e rode `/implantar <próxima>`" — o contexto
   desta seção não precisa ir junto.
