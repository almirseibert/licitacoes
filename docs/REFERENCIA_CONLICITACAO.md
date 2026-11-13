# Referência funcional — ConLicitação (Consulte Online) × Painel Studio Mythos

Levantamento feito em 12/11/2026 numa conta Premium do ConLicitação, navegando com o Claude in
Chrome fora desta sessão, mais as páginas públicas de produto. Serve de **referência funcional**:
copiamos o que a ferramenta faz e como o usuário trabalha, **nunca dados, textos, vídeos ou
layout** deles. Dado da conta que foi navegada (razão social, CNPJ, nome de usuário, valores de
boleto, token) ficou de propósito fora deste arquivo.

Este documento alimenta o [PLANO_SAAS_CONLICITACAO.md](../PLANO_SAAS_CONLICITACAO.md): cada linha
da matriz aponta a seção do plano que a entrega.

## 1. O que o ConLicitação oferece (mapa das telas)

Oito grupos de ferramentas, mais conta e ajuda.

| Grupo | Ferramenta | O que faz (observado) |
|---|---|---|
| Oportunidades | Boletins | Calendário mensal de boletins numerados (2 a 3 por dia), por filtro salvo; legenda não visto / visto / visto por outro membro; "marcar como lido" em lote |
| Oportunidades | Encontrar Licitações | Banco de ~136 mil licitações; +25 filtros; cartão rico; exporta xlsx/docx; imprime; compartilha |
| Oportunidades | Licitações Estratégicas | 3 abas: iminência de deserta (abertas sem proposta), baixa concorrência, desertas |
| Oportunidades | Encontrar Acompanhamentos | ~146 mil publicações posteriores ao edital (adjudicação, homologação...) |
| IA | Resumo do Edital (beta) | Modal com dados do certame, prazos, garantias, habilitação, penalidades, possíveis questionamentos, análise crítica, campo de considerações; checklist por e-mail/.docx/impressão |
| IA | Pergunte ao Edital | Chat sobre o edital; "perguntas estratégicas" prontas (76, em 6 categorias) e "perguntas salvas" |
| IA | Consultor Jurídico 2.0 | Chat sobre a Lei 14.133 com histórico; cita artigos |
| IA | Dr. Licita (novo) | Não contratado na conta — só se sabe o nome e que é IA |
| Gestão | Gerenciar Licitações | Favoritas, gerenciadas, tarefas, andamentos, finalizadas; por mim / por todos; calendário; detalhe com abas |
| Gestão | Documentos | Por empresa, por grupo, com situação (disponível/pendente/coletando), atualização manual/automática, validade; gerador de declarações |
| Gestão | Portais (novo) | Cofre de login e senha de portais, com vencimento do login |
| Gestão | ConlicitaSeg | Cotação de seguro garantia, com termo de vínculo legal |
| Automação | Monitorar Chat | Mensagens do pregão por edital; abas todos/não lidos/importantes/arquivados; só alguns portais |
| Automação | Robô de Lance | Lances automáticos, modo aberto e aberto/fechado, valor mínimo; produto à parte |
| Análise | Análise de Mercado | Compras por região, modalidade, órgão, concorrentes, produtos, resultados |
| Análise | Concorrentes | Busca por CNPJ: alertas de vulnerabilidade, cadastro, participações, sanções, motivos de desclassificação/inabilitação |
| Análise | Atas de Registro de Preços | Banco de atas com dados do PNCP |
| Análise | Contratos | Banco de contratos com empresas contratadas, valores, vigência |
| Análise | Meu Histórico | Itens vencidos, ticket médio, órgãos, portais, por período |
| Assessoria | Assessoria Cadastral, Jurídico Fácil, Artigos, Envie sua dúvida | Serviço humano e biblioteca de conteúdo |
| Treinamento | ConLicita Go, Cursos | Vídeos e cursos |
| Outras | Assinatura Digital, Bolsa de empregos, Clipping Polícia Federal, API, Status das Ferramentas | Serviços complementares |
| Conta | Usuários, Meus Filtros, Dados da Empresa, Solicitações, Token de API (IPs liberados), Assinatura, Boletos | Administração |
| Topo | Dashboard, notificações, ajuda em vídeos, NPS | Cartões de pendência, oportunidades do dia, mapa por UF, tarefas, calendário |

### Detalhes que vale copiar o comportamento

- **Cartão da licitação**: etiquetas de situação (nova, urgente, SRP, prorrogada, adiada,
  recebendo propostas, homologada, vence hoje), valor estimado, link da disputa, "ver itens"
  que expande no próprio cartão, "ver mais informações" (processo, observação, telefone, site),
  anotações por texto e **por ditado de voz**, alerta de seguro garantia exigido, e o selo
  **CAPAG** (capacidade de pagamento do município — dado público do Tesouro).
- **Filtros do banco**: objeto com *busca exata*, estado / região / **raio de atuação**, cidade,
  nº do edital, modalidades, data de inclusão e de prazo (atalhos hoje/ontem), vigentes, com
  edital, com chat monitorado, nº do processo, situação, órgão, itens, observação, esfera,
  concorrência nacional/internacional, atividades, **salvar pesquisa**.
- **Resumo do Edital**: toda seção do resumo termina em ação — "pedir esclarecimento" e
  "impugnar" saem dos *possíveis questionamentos*. Rodapé: baixar edital, checklist por e-mail,
  checklist .docx, imprimir.
- **Gerenciar Licitações**: notificações configuráveis por **tipo** (esclarecimento, aviso,
  impugnação, recurso, status, resultado) e por **canal** (e-mail, WhatsApp, push).
- **Documentos**: regra de produto — documento sem validade é revisado a cada 90 dias.
  Declarações: menor/aprendiz, ME/EPP, habilitação, fatos impeditivos, trabalho forçado,
  elaboração independente, renúncia de vistoria, carta de credenciamento.
- **Concorrentes**: percentual de desclassificação e de inabilitação e os principais motivos.
- **Contratos**: filtros por vigência, valor estimado e contratado, empresa, CNPJ do fornecedor,
  tipo e poder; cartão lista as empresas contratadas.
- **Planos** (anuais, à vista): Premium R$ 3.190, Advanced R$ 3.790, Black R$ 6.010 (com 10% de
  desconto no boleto: R$ 2.871 / 3.411 / 5.409). A página lista **os mesmos módulos nos três
  níveis** — a diferença real não aparece na tela. Robô de lance vendido à parte (R$ 185/mês em
  oferta). Há opção bienal.
- **Limitações da observação**: a resposta do Pergunte ao Edital não chegou (ficou "digitando"
  por mais de 30 s — o chat deles é lento), Dr. Licita e Robô de Lance não estavam disponíveis,
  e nenhum boletim individual nem o monitor de chat com mais de um pregão foram abertos.

## 2. Matriz: o que o painel já tem × o que falta

Legenda: ✅ já existe · 🟡 existe em parte · ❌ não existe · 🚫 fora do escopo, por regra do projeto.

| ConLicitação | Painel Studio Mythos hoje | Status | Seção do plano |
|---|---|---|---|
| Dashboard | `/api/painel/resumo` e Radar; sem tarefas, calendário de tarefas nem pendências | 🟡 | 8 |
| Boletins | alerta por e-mail/WhatsApp avulso; sem boletim por perfil | ❌ | 4 |
| Encontrar Licitações | Radar com filtros, pontuação 0–100 e exportação Excel | 🟡 | 7 |
| — busca exata, raio, nº do edital, esfera, itens, observação | parte | 🟡 | 7 |
| — salvar pesquisa, exportar .docx, imprimir, compartilhar | ❌ | ❌ | 7 |
| — etiquetas de situação, CAPAG, alerta de seguro garantia | ❌ | ❌ | 7 |
| Licitações Estratégicas | seção 22: desertas, fracassadas, reaberturas, iminência | ✅ | 6 (alerta por segmento) |
| Acompanhamentos (banco) | `eventos_licitacao` só das licitações monitoradas | 🟡 | 12 |
| Resumo do Edital | leitura assistida (seção 23) com schema | 🟡 | 11 |
| Pergunte ao Edital | — | ❌ | 5 |
| Consultor Jurídico | — | ❌ | 16 |
| Gerenciar Licitações | funil Kanban + anotações + anexos | 🟡 | 8 |
| — tarefas com responsável, andamentos, por mim/por todos, calendário | ❌ | ❌ | 8 |
| Documentos | cofre, validade, kits, pacote PDF | ✅ | 10 (grupos, lote, e-mail) |
| Declarações | 11 modelos; faltam renúncia de vistoria e carta de credenciamento | 🟡 | 10 |
| Atualização automática de documento ("coletando") | exige CAPTCHA/login gov.br | 🚫 | 10 (lembrete + link de emissão) |
| Portais — cofre de login e senha | o painel não guarda senha de portal (CLAUDE.md) | 🚫 | 10 (agenda sem senha) |
| Monitorar Chat | monitor de andamento (seção 21); sem chat | ❌ | 6 |
| Robô de Lance | exige autenticar em portal de terceiro | 🚫 | — |
| ConlicitaSeg (seguro garantia) | — | ❌ | 18 |
| Análise de Mercado | histórico de preços, relatório mensal | 🟡 | 13 |
| Concorrentes | dossiê do concorrente + sanções CEIS/CNEP | ✅ | 13 (motivos de perda) |
| Meu Histórico | `Historico.jsx`, diagnóstico | ✅ | 15 |
| Contratos (banco de mercado) | contratos nossos (seção 28), não o mercado | 🟡 | 12 |
| Atas de Registro de Preços | — | ❌ | 12 |
| Notificações por tipo e canal | e-mail + WhatsApp globais | 🟡 | 9 |
| Usuários / Meus Filtros / Dados da Empresa | usuários (Fase 15), perfil da empresa | 🟡 | 1b, 4 |
| Token de API com IPs liberados | — | ❌ | 14 |
| Assinatura, boletos, planos | — | ❌ | 3 |
| Solicitações (suporte), Ajuda em vídeos, NPS, Status | — | ❌ | 17 |
| Assinatura Digital | o painel não assina documento (CLAUDE.md) | 🚫 | — |
| Assessoria Cadastral, Cursos, Clipping, Bolsa de empregos | serviço humano / parceria | ❌ | 18 |
| Tema claro/escuro | só escuro (Voltage Obsidian) | ❌ | 2 |

## 3. Onde nós já somos melhores (manter e destacar na venda)

Coisas que o ConLicitação não mostrou: pontuação de aderência 0–100 com motivo, **diagnóstico
do que está barrando a empresa** (seção 20), **gerador de proposta e de declarações** com o dado
da empresa, pacote de habilitação em PDF único com a certidão vencida bloqueada, **preço de
referência** e margem, **prazo de impugnação em dias úteis** com feriado, dossiê do órgão e do
concorrente, calendário de recorrência, contrato e marcos pós-vitória, e a regra de **IA que só
sugere**, com schema e citação do trecho.

## 4. Divergências entre o plano do documento "Plano de Implantação" e as regras do repositório

O documento gerado no claude.ai (Studio Mythos, monorepo) propôs coisas que este repositório
decidiu de outro jeito. A decisão do repositório vale; a linha abaixo diz por quê.

| O documento propõe | Decisão neste repositório | Motivo |
|---|---|---|
| Tabelas `lic_*` no MySQL do monorepo | Banco `licitacoes` separado, repositório próprio | CLAUDE.md: "banco separado, nunca misturado com o CRM" |
| Cofre de portais com senha cifrada | Só **agenda de acessos** (portal, URL, vencimento do login), sem senha | CLAUDE.md: nunca guardar senha de portal ou certificado |
| Robô de lance em beta fechado (Fase 4) | **Fora do escopo** | Exige logar no portal em nome do cliente; seção 5.4 |
| Assinatura digital como serviço | Fora | O painel não assina documento nem guarda certificado |
| Documentos "coletando" (certidão automática) | Lembrete de vencimento + botão que abre a página de emissão | Emissão exige CAPTCHA ou gov.br |
| Monitor de chat "por portal" | Só portal com consulta pública, sem login | Seção 5.4; portal que bloqueia vira `bloqueado` |
| Fase 0: rotacionar credenciais fixas do monorepo | Não se aplica a este repositório (segredos só em variável de ambiente) | Vale para o monorepo `studiomythos`; se aquelas credenciais vazaram, rotacione lá |
| Teste grátis de 7 dias | **15 dias** (decidido em 13/11/2026) | Decisão do dono do produto |
| Planos Essencial / Profissional / Avançado + automação | Mesmos três níveis, sem o "adicional de automação" enquanto não houver robô | Ver Seção 3 do plano |

## 5. Perguntas prontas do "Pergunte ao Edital" (contagem observada)

Proposta (9), objeto (25), habilitação (18, por subtipo), pagamentos (6), riscos e penalidades
(15), contrato (3) — 76 no total. **Os textos delas não foram copiados.** O painel escreve a sua
própria biblioteca nas mesmas seis categorias, a partir da lei 14.133 e do que o nosso
`checklist` de exigências (seção 8 da spec) já cataloga.
