# Como trabalhar neste repositório

Painel de Licitações da Studio Mythos. A especificação completa está em
[PAINEL_LICITACOES_INSTRUCOES.md](PAINEL_LICITACOES_INSTRUCOES.md) — 32 seções e 14 fases — e é
a fonte da verdade: quando o código e a spec divergirem, a spec ganha, ou a divergência é
registrada em comentário explicando por quê.

## Fluxo

O repositório no GitHub é o lugar oficial do trabalho:
<https://github.com/almirseibert/licitacoes>

- Cada fase termina com **commit e push direto na `main`**. Sem branch, sem PR.
- A fase só fecha depois de **passar no critério de aceite da seção 16**, verificado contra
  dados reais — não contra mock. O resultado medido vai no commit e no README.
- O README registra o estado: o que cada fase entregou, onde está, e o aceite com os números.

## Língua

Tudo em português: código, nomes de variáveis e funções, comentários, tabelas, colunas,
mensagens de erro e interface. Mensagem de erro é escrita para quem usa o painel, com o técnico
separado:

```json
{ "erro": "mensagem em português para o usuário", "detalhe": "técnico, só em log" }
```

## O que nunca entra no git

- `.env` — credenciais só em variável de ambiente, com `.env.example` versionado (seção 2.1).
- `/dados/` — o volume: editais baixados, pacotes gerados, cofre de documentos.
  A regra é ancorada na raiz de propósito: `backend/config/dados/` é código do seed.
- `node_modules/`, `frontend/dist/`.

Nenhum e-mail de administrador fixo no frontend: permissão vem do backend.

## Conduta da coleta (seção 5.4)

Vale para todo adaptador, sem exceção: `User-Agent` honesto, no máximo 4 requisições
simultâneas, 1,5 s entre chamadas ao mesmo domínio, timeout de 30 s, 3 tentativas com espera
progressiva. **Nunca autenticar em portal de terceiro, nunca guardar senha de portal ou
certificado, nunca resolver CAPTCHA.** Portal que bloquear vira `ultimo_status = 'bloqueado'` —
não se força.

## Decisões que não se desfazem sem conversa

- **Banco separado** (`licitacoes`), nunca tabelas misturadas com as do CRM.
- A coleta **não sobrescreve decisão do usuário**: etapa do funil, favorito, descarte e
  exigência confirmada à mão ficam de fora de todo update automático.
- O painel **não assina documento** e não guarda certificado nem senha do gov.br.
- Dado que falta vira **lacuna visível** (`____________`), nunca valor inventado.

## Rodar

```bash
npm install && npm run migrar && npm run semear
```

`npm run api`, `npm run worker`, `npm run dev:front`. Jobs pela linha de comando:
`npm run coletar`, `npm run repontuar`, `npm run baixar`, `npm run ler`,
`npm run encerradas` (amostra de preço), `npm run resultados -- --licitacao=<id>`,
`npm run diagnostico` (fecha as vencidas sem análise e imprime o ranking de bloqueios).
O README tem o detalhe de cada um.
