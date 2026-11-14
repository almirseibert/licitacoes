# Modelos de mensagem do WhatsApp (Seção 9)

Fora da janela de 24 h, a Meta só entrega mensagem de **modelo aprovado**. Estes são os três
que precisam ser submetidos no WhatsApp Manager **antes do lançamento** (categoria
*Utility*, idioma `pt_BR`). O painel manda o texto dos avisos em `{{1}}`, sem quebra de linha
(a Meta recusa `\n`, tabulação e mais de quatro espaços seguidos dentro de variável).

| Nome sugerido | Uso | Corpo |
|---|---|---|
| `alerta_licitacao` | todo aviso do despacho (prazo, recurso, esclarecimento…) | `Painel de Licitações: {{1}}` |
| `resumo_do_dia` | resumo diário (boletim) | `Seu resumo de licitações de hoje: {{1}}. Abra o painel para ver tudo.` |
| `convocacao_chat` | convocação no chat do pregão (Seção 6) | `Atenção: você foi convocado no pregão {{1}}. Responda pelo portal dentro do prazo.` |

Depois de aprovado, configure no ambiente:

```
WHATSAPP_MODELO=alerta_licitacao
WHATSAPP_MODELO_IDIOMA=pt_BR
```

Hoje só `alerta_licitacao` é usado pelo código; os outros dois entram com o boletim por
WhatsApp e com o monitor de chat (Seção 6). Responder "favoritar" / "criar tarefa" pela
mensagem fica para depois do alerta simples funcionar (Seção 9b).
