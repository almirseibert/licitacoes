# API e webhook — Painel de Licitações

Disponível nos planos **Profissional** e **Avançado** (recurso `api`). Tudo é configurado na tela
**Integrações**, por quem é administrador ou dono da organização.

- [Autenticação](#autenticação)
- [Limites](#limites)
- [Endpoints](#endpoints)
- [Erros](#erros)
- [Webhook de novas oportunidades](#webhook-de-novas-oportunidades)
- [Instalação (quem opera o painel)](#instalação-quem-opera-o-painel)

## Autenticação

1. Em **Integrações → Tokens de API**, dê um nome e (opcionalmente) a lista de IPs liberados.
2. **Copie o token na hora**: ele aparece uma única vez. O painel guarda só o hash — se você perder,
   revogue e crie outro.
3. Mande o token em todo pedido:

```bash
curl -H "Authorization: Bearer lic_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  "https://SEU-PAINEL/api/v1/eu"
```

O token tem o formato `lic_` + 43 caracteres. Ele enxerga **só a sua organização** e **só lê**:
a API não tem rota de escrita.

**Lista de IPs liberados.** Vazia, qualquer IP usa o token. Com entradas (`203.0.113.7`,
`203.0.113.0/24`, IPv6 também), pedido de outro IP recebe **403**, e a mensagem diz o IP que o painel
enxergou. Se o painel roda atrás de proxy, quem opera precisa informar `CONFIAR_PROXY` (ver o fim
deste arquivo) — sem isso o IP visto é o do proxy.

**Revogar** (lixeira ao lado do token) vale na hora: o próximo pedido recebe **401**.

## Limites

| Plano | Tokens ativos | Webhooks | Cota de chamadas por mês |
|---|---|---|---|
| Profissional | 2 | 2 | 10.000 |
| Avançado | 5 | 5 | 100.000 |

- Cada chamada autenticada consome 1 da cota. Estourou: **429** com `Retry-After`, e o corpo diz o plano
  que resolve. O contador zera no dia 1.
- Além da cota, há um teto de **60 chamadas por minuto por token** (429 com `Retry-After`, em segundos).
  O teto é contado por processo do servidor.
- Resposta traz `X-Cota-Mensal-Restante`.
- Token revogado não conta no limite de tokens.

`GET /api/v1/eu` devolve a cota usada no mês e o IP que o painel enxergou — é o jeito mais rápido de
testar um token.

## Endpoints

Base: `https://SEU-PAINEL/api/v1`. Tudo `GET`, tudo JSON.

### `GET /eu`

```json
{
  "organizacao": { "id": 2, "nome": "Empresa Alfa" },
  "plano": { "codigo": "profissional", "nome": "Profissional" },
  "token": { "id": 1, "nome": "ERP" },
  "ip_visto": "203.0.113.7",
  "cota_mensal": { "limite": 10000, "usado": 42 },
  "limite_por_minuto": 60
}
```

### `GET /licitacoes`

As licitações que **a sua organização vê no Radar**, com os mesmos filtros dele. Os campos de
pontuação, etapa e favorito são **os da sua organização** — nunca os de outra.

| Parâmetro | O que faz |
|---|---|
| `uf` | `RS` ou `RS,SC` |
| `regiao` | `Sul`, `Sudeste`… |
| `modalidade`, `esfera`, `situacao` | filtros do Radar |
| `busca` | palavra no objeto (aceita aspas para frase exata) |
| `valor_min`, `valor_max` | faixa do valor estimado |
| `prazo_dias` | propostas encerram em até N dias |
| `em_aberto=1` | só com propostas abertas |
| `inclusao_de`, `inclusao_ate` | data em que a licitação entrou (`AAAA-MM-DD`) |
| `pontuacao_min` | nota mínima. **Padrão 30**, como no Radar; use `0` para tudo |
| `ordem` | `recentes` (padrão), `prazo` ou `relevancia` |
| `pagina`, `por_pagina` | padrão 20, máximo 100 |

Resposta:

```json
{
  "dados": [
    {
      "id": 101, "orgao": "Prefeitura de Canoas", "uf": "RS", "municipio": "Canoas",
      "modalidade": "Pregão Eletrônico", "objeto": "…",
      "valor_estimado": 80000, "orcamento_sigiloso": false,
      "fim_propostas": "2026-11-22T13:00:00.000Z", "link_portal": "https://…",
      "pontuacao": 77, "etapa": "analise", "favorito": true, "etiquetas": ["nova"]
    }
  ],
  "total": 1, "pagina": 1, "por_pagina": 20, "avisos": []
}
```

`valor_estimado` é `null` quando o orçamento é sigiloso ou o valor não foi publicado — nunca zero.

### `GET /licitacoes/{id}`

A mesma licitação com os itens (`itens[]`: número, descrição, quantidade, unidade, valor unitário e total).
Aceita qualquer licitação do catálogo; se a sua organização ainda não a pontuou, `pontuacao` e `etapa`
vêm `null`.

## Erros

Sempre `{ "erro": "mensagem em português" }`.

| Código | Quando |
|---|---|
| 401 | token ausente, mal formado, inexistente ou **revogado** (a mesma resposta nos quatro casos) |
| 402 | plano sem o recurso `api`, ou organização suspensa / assinatura vencida |
| 403 | IP fora da lista do token |
| 404 | licitação inexistente |
| 429 | passou de 60 por minuto, da cota do mês, ou 30 tokens inválidos em um minuto vindos do mesmo IP |

## Webhook de novas oportunidades

O painel faz um `POST` na sua URL quando entra no catálogo uma licitação nova que casa com um **filtro
salvo** — um filtro do Boletim (palavras, exclusões, UF…) ou uma pesquisa salva do Radar.

Cadastre em **Integrações → Webhooks**: nome, endereço **https**, e o filtro. O segredo aparece uma
única vez (**guarde**; perdeu, é só girar). O botão de teste manda um evento `teste` assinado.

- Só entrega o que chegar **depois** de o webhook ser criado (criar não despeja o passado).
- Uma licitação sai **uma vez por webhook**. Descartada pela organização não sai.
- Roda de hora em hora, junto da coleta. Até 50 oportunidades por pedido; se houver mais, vão vários pedidos.
- A entrega é **pelo menos uma vez**: se o painel cair entre o seu 2xx e o registro, o lote sai de novo
  (com outro `entrega_id`). Use o `id` da licitação como chave para ignorar repetição.
- Filtro do boletim pausado não alimenta o webhook.
- Sua URL precisa responder **2xx em até 10 s**. Qualquer outra coisa (inclusive redirecionamento)
  conta como falha, e as oportunidades continuam pendentes para a próxima rodada.
- **Dez falhas seguidas pausam o webhook** (a tela mostra o motivo). Religue pelo botão depois de corrigir.
- O endereço não pode apontar para rede interna (`10.x`, `192.168.x`, `127.x`, `169.254.x`…); o nome é
  conferido de novo a cada entrega.

### Corpo

```json
{
  "evento": "oportunidades.novas",
  "entrega_id": "0b1a8f1e-…",
  "gerado_em": "2026-11-14T16:40:02.000Z",
  "filtro": { "id": 7, "nome": "Informática" },
  "webhook": { "id": 1, "nome": "ERP" },
  "total": 2,
  "itens": [
    {
      "id": 101, "objeto": "…", "orgao": "…", "uf": "RS", "municipio": "…", "modalidade": "…",
      "valor_estimado": 120000, "orcamento_sigiloso": false,
      "fim_propostas": "2026-11-24T13:00:00.000Z",
      "link_portal": "https://…", "link_painel": "https://SEU-PAINEL/?licitacao=101",
      "palavra": "monitor"
    }
  ]
}
```

Cabeçalhos: `X-Painel-Evento`, `X-Painel-Entrega` (id único, use para ignorar repetição) e
`X-Painel-Assinatura`.

### Conferir a assinatura

`X-Painel-Assinatura: t=<segundos>,v1=<hex>`, onde `v1 = HMAC-SHA256(segredo, "<t>.<corpo cru>")`.
Confira sempre sobre o **corpo cru**, antes de interpretar o JSON, e recuse se `t` estiver a mais de
5 minutos do seu relógio (impede repetir uma entrega antiga).

```js
const crypto = require('crypto');

function assinaturaValida(segredo, cabecalho, corpoCru) {
  const partes = Object.fromEntries(cabecalho.split(',').map((p) => p.split('=')));
  if (Math.abs(Date.now() / 1000 - Number(partes.t)) > 300) return false;
  const esperado = crypto.createHmac('sha256', segredo).update(`${partes.t}.${corpoCru}`).digest('hex');
  return partes.v1.length === esperado.length &&
    crypto.timingSafeEqual(Buffer.from(partes.v1), Buffer.from(esperado));
}
```

## Instalação (quem opera o painel)

- **`CONFIAR_PROXY`**: quantos proxies reversos ficam na frente da API (EasyPanel/Traefik = `1`).
  Define de onde sai o IP do cliente. Com `0`, a lista de IPs liberados compara o IP do proxy. Nunca
  ponha um número maior que o real: o cliente poderia forjar `X-Forwarded-For`.
- **`WEBHOOK_PERMITIR_LOCAL`**: só para testar contra um servidor local (aceita `http` e rede interna).
  Em produção, vazio.
- O segredo dos webhooks é derivado do `JWT_SECRET` e de um sal por webhook: **trocar o `JWT_SECRET`
  invalida o segredo de todos os webhooks** (cada cliente teria de girar o seu).
- Linha de comando: `npm run webhooks` (uma rodada), `-- --org=<id>`, `-- --webhook=<id>`, `-- --simular`.
