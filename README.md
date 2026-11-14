# Painel de Licitações — Studio Mythos

CRM de captação e inscrição em licitações de órgãos públicos. A especificação completa
está em [PAINEL_LICITACOES_INSTRUCOES.md](PAINEL_LICITACOES_INSTRUCOES.md) — 32 seções, 14 fases.

**Estado: as 14 fases implementadas e validadas — as seis primeiras em 02/11/2026, as Fases 7 a 14 em 07/11/2026.**

**O que falta não é fase, é implantação:** os serviços `licitacoes-api` e
`licitacoes-worker` já existem no EasyPanel (08/11/2026) — GitHub ligado, build
testado com sucesso, variáveis não sensíveis preenchidas, volume `/dados`
compartilhado, domínio cadastrado. Falta colar 2 segredos obrigatórios
(`DB_PASSWORD`, `JWT_SECRET`), rodar um `GRANT` no MySQL e criar o registro DNS
no Cloudflare — os três são ações que só uma pessoa pode fazer, detalhadas com
os valores exatos em [IMPLANTACAO.md](IMPLANTACAO.md). O banco já está lá, com
as 15 migrações aplicadas (a 015 rodou em 07/11/2026, depois da coleta de 1.362
licitações) e os dados de produção intactos. Até esses três passos, o painel só
roda na máquina de quem desenvolve. O passo a passo original está em
[Deploy no EasyPanel](#deploy-no-easypanel); o estado de hoje está em
[IMPLANTACAO.md](IMPLANTACAO.md).

## Fase 15 — Base multiempresa (SaaS)

O painel vira produto vendável com login: cada cliente é uma **organização**, com usuários e
senha próprios (não mais lidos do banco do CRM) e dados isolados. O plano completo está em
[PLANO_SAAS_CONLICITACAO.md](PLANO_SAAS_CONLICITACAO.md); esta é a Seção 1 (base multiempresa),
entregue em duas partes — 1a em 12/11/2026 e 1b em 13/11/2026:

- **Pronto e verificado contra MariAB 10.11 real** (migrações, não mock): login, cadastro de
  organização, convite por e-mail/link, aceite de convite e troca entre organizações sem digitar
  senha de novo. Migrações `016_organizacoes.sql` e `017_organizacao_escopo.sql` acrescentam
  `organizacao_id` a 16 tabelas de dado próprio do cliente (palavras-chave, perfil da empresa,
  cofre, kits, pacotes, anotações, propostas, monitoramentos, alertas, contratos,
  questionamentos, modelos de declaração, palavras sugeridas) e deixam de fora, de propósito, o
  catálogo compartilhado (fontes, licitações, preços, órgãos, feriados), a infraestrutura
  (`tarefas`) e o cache (`ia_execucoes`, `recorrencias`, `sancoes_consultas`) — são fato público
  ou operação do sistema, não dado do cliente.
- **Aceite medido**: duas organizações criadas pela API real (`/api/auth/cadastro`), cada uma
  com sua própria palavra-chave cadastrada em `/api/palavras` — a organização 2 não via a palavra
  da organização 1 nem conseguia editar ou apagar pelo id (404, não 200). Convite por link criado,
  aceito uma vez, recusado na segunda tentativa (409) e vencido após 72 h (410). Troca de
  organização recusada para quem não é membro (403). Papel insuficiente bloqueado antes de chegar
  ao banco (403 em `/api/auth/convites` para quem não é admin/dono).
- **Seção 1b — entregue em 13/11/2026** (verificada contra MariaDB 10.11 real e 450 licitações
  reais do PNCP, RS/SC, propostas abertas):
  - **Decisão por organização.** A migração `018_org_licitacoes.sql` move para `org_licitacoes`
    tudo o que depende de quem olha — pontuação, grupo, palavra que casou, objeto social, pode
    participar, etapa, favorito, descarte, proposta, custo, o resultado digitado e a
    confirmação da leitura da IA — copia o que existia para a organização 1 (hash idêntico das 450
    linhas antes e depois) e **apaga essas colunas de `licitacoes`**, para que consulta esquecida
    falhe alto em vez de mostrar a decisão de outra organização. Toda rota lê pela visão
    `escopo.daOrganizacao(id)` (`backend/servicos/escopo.js`); os jobs que servem a todos usam
    `porOrganizacao()` (aviso nasce para a organização certa) ou `agregadoDasOrganizacoes()`
    (baixar e ler edital: maior nota entre as ativas).
  - **Coleta por organização.** A busca usa a união das palavras das organizações ativas; cada
    licitação é pontuada com as palavras, os pesos e os CNAEs de cada uma. Organização nova
    recebe uma repontuação na fila ao se cadastrar.
  - **Rotas escopadas**: Radar, Funil, filtros, painel, exportação e relatório, Configurações
    (pesos e perfis), Cofre, Kits, Modelos (os do sistema continuam de todos), Envio, Declarações,
    Propostas, Preço, Concorrentes e dossiês ("encontrou você" calculado na hora, por
    organização), Alertas, Contratos e marcos, Questionamentos, Monitor, Oportunidades (descarte
    e observação em `org_oportunidades`), Diagnóstico, IA (sugestões de palavra por organização;
    o gasto do serviço só a operadora vê). Fontes são catálogo: só a organização operadora (1,
    admin/dono) cria, muda, apaga e dispara coleta.
  - **`configuracoes`, decidido**: janela da coleta e teto de download são **operação** (globais,
    só a operadora muda); destino do e-mail e do WhatsApp de alerta é **preferência** e mora em
    `org_configuracoes`. O destino do `.env` (`ALERTA_PARA`, `WHATSAPP_DESTINO`) só vale para a
    operadora — senão o alerta de um cliente iria para a caixa da Studio Mythos.
  - **Cofre em disco por organização**: arquivo novo vai para `org/<id>/empresa/<perfil>/`,
    pacotes para `org/<id>/pacotes/`, declarações, anexos e propostas idem. Os arquivos já
    guardados continuam onde estão — o caminho está no banco.
  - **Papéis valem na hora**: `confirmarVinculo` relê o papel em `organizacao_membros` (cache de
    15 s, limpo quando a Equipe muda alguém); o papel `leitor` só lê (`leitorSoLe`, 403 em
    qualquer escrita).
  - **Telas**: entrar / criar conta / esqueci minha senha (`Login.jsx`), aceite de convite
    (`/convite/<token>`), senha nova (`/redefinir-senha/<token>`), **Equipe** (papéis, remover,
    convidar, cancelar convite; sem e-mail configurado mostra o link para mandar à mão) e o
    seletor de organização na barra lateral.
  - **Recuperação de senha**: link de uso único, 1 hora, só por e-mail (o banco guarda o
    sha256 do token), resposta igual exista ou não a conta, no máximo 3 pedidos por hora.
  - **Correção de segurança** da 1a: aceitar convite para um e-mail que já tem conta agora
    exige a senha dessa conta. Antes, quem tinha o link (o próprio admin, quando o e-mail não
    está configurado) entrava como aquela pessoa e, com `trocar-organizacao`, abria as outras
    organizações dela.
  - **Aceite medido** (roteiro com duas organizações pela API real, 53/53): org 1 e org 2 com
    Radar próprio sobre o mesmo catálogo (topo "nobreak" 70 pts × "reforma" 88 pts; 272 × 450
    pontuadas); a org 2 vê em Triagem a licitação que a org 1 pôs em "Vou disputar", e o
    descarte da org 2 não muda a org 1 nem entra no diagnóstico dela; valor final digitado pela
    org 2 não muda o da org 1 (990); 404 ao tentar ler, editar ou apagar pelo id perfil,
    documento do cofre, kit, modelo, proposta, questionamento, contrato, marco e alerta da outra;
    403 para fonte e ajuste de operação fora da operadora; convite para conta existente sem
    senha ou com senha errada 401, com a senha 200; leitor 200 no GET e 403 no PATCH; rebaixado
    a leitor 403 e removido 401 **na hora**; redefinir senha 200, reuso 410, senha velha 401,
    nova 200. Os 20 jobs do worker rodaram sem erro contra o banco migrado, com os alertas
    nascendo por organização (`limpar` tinha um bug antigo, `a.tamanho` → `tamanho_bytes`,
    corrigido aqui). `npm run lint` limpo e 50/50 testes (6 novos em `testes/escopo.test.js`).
  - **Não verificado aqui**: a busca textual do PNCP (`/api/search`) não respondeu deste
    ambiente, então a coleta pelo adaptador não rodou de ponta a ponta — as 450 licitações
    vieram da API de consulta do PNCP e a pontuação foi feita pelo `repontuar` novo. E-mail
    (convite e senha) não foi enviado: não há SMTP no ambiente de teste.
  - Pendente (Seção 1c no plano): monitor que checa a mesma licitação uma vez por organização,
    correção manual de exigência ainda compartilhada, visão de alertas mais leve, ficha de órgão
    e concorrente que mostra o grupo da operadora.
- **Seção 2 — tema claro/escuro, entregue em 13/11/2026.** As cores do Voltage Obsidian viraram
  variáveis CSS (`frontend/src/estilo.css`, trios RGB em `:root`/`[data-tema='escuro']` e
  `[data-tema='claro']`) que o `tailwind.config.js` lê como `rgb(var(--cor-x) / alfa)`: nenhum
  componente sabe do tema, e `bg-voltagem/10` continua valendo. Dois tokens novos: `realce`
  (película de hover/selecionado, que era `bg-white/…` e sumia no claro) e `apagado` (faixa
  "Baixa" da pontuação, que estava em 2,5:1 no escuro). Alternador no rodapé da navegação e na
  tela de login (`componentes/AlternarTema.jsx`, `servicos/tema.js`); o `index.html` aplica o tema
  antes do primeiro pintar. Preferência em `usuarios.tema_preferido` (migração
  `019_tema_preferido.sql`, `PATCH /api/auth/tema`, devolvida no login e no `/eu`), com
  `localStorage` de reserva e `prefers-color-scheme` no primeiro acesso; sair apaga a escolha
  local para o próximo do navegador não herdá-la.
  - **Aceite medido** (MariaDB 10.11 zerado, 150 licitações reais do PNCP de RS/SC, Playwright):
    primeiro acesso com o sistema em claro abriu claro; o login trouxe o escuro salvo no banco; o
    clique trocou para claro **sem recarregar** (marcador na `window` sobreviveu) e o banco passou
    a `claro`; recarregar manteve; outro navegador com o sistema em escuro abriu escuro e virou
    claro no login. Contraste medido em todo texto visível (cor contra o fundo composto):
    Radar 518 textos, Funil 380, Documentos 22 — **0 abaixo de 4,5:1 nos dois temas**, mínimo
    6,43 / 5,04 / 6,96 no escuro e 4,64 / 4,79 / 5,98 no claro. API: `PATCH /api/auth/tema` 200
    para `claro`/`escuro`/`null`, 400 para `"azul"` e corpo vazio, 401 sem token; só a linha do
    próprio usuário muda. `testes/tema.test.js` refaz a conta de contraste dos tokens a cada
    `npm test` (58/58).
- **Seção 3 — planos e cobrança, entregue em 13/11/2026.** Migração `020_planos.sql`: `planos`
  (catálogo; recursos e limites em JSON — `null` = sem teto, chave ausente = 0), `assinaturas`
  (uma por organização: plano, ciclo, `pago_ate`, provedor, pedido em aberto),
  `assinatura_eventos` (livro de tudo, idempotência do webhook) e `uso_mensal` (IA e exportações).
  Essencial R$ 149/mês · Profissional R$ 299 · Avançado R$ 499 (anual = 10 meses); organização
  nova nasce em **teste de 15 dias no Avançado**. `backend/servicos/limites.js`: situação da
  assinatura (teste / teste vencido e assinatura vencida = só leitura / suspensa = 402 em tudo;
  5 dias de carência após o `pago_ate`), `assinaturaValida`, `exigirRecurso('<módulo>')` e
  `exigirLimite('<limite>')` — 402 com `{ erro, upgrade: { plano_sugerido } }` dizendo o plano mais
  barato que resolve. A operadora não tem teto. `backend/servicos/cobranca.js`: provedor `manual`
  (o cliente pede pela tela, o administrador ativa) e `POST /api/cobranca/webhook/:provedor`
  fechado até `COBRANCA_PROVEDOR` ≠ manual e `COBRANCA_WEBHOOK_SEGREDO` definido (HMAC-SHA256 do
  corpo cru em `X-Assinatura`). Telas **Assinatura**, **Uso do plano** e **Organizações** (só para
  admin da operadora — o backend diz `superadmin`); cadeado no menu para o módulo fora do plano e
  aviso no topo para teste/assinatura vencidos.
  - **Aceite medido** (MariaDB 10.11, 150 licitações reais, duas organizações novas pela API,
    roteiro de 44 conferências, **44/44**): Essencial recebe 402 em IA, oportunidades, contratos,
    concorrentes, diagnóstico, preço de referência, relatório, leitura de edital e monitor, com o
    plano sugerido certo; Radar 200. Limites estourados no ponto exato: 3º usuário, 2º perfil,
    31ª palavra-chave, 21ª exportação do mês (a 1ª contou 1), upload que passa de 1 GB. Pedido de
    Profissional anual apareceu no superadmin; ativar somou 12 meses ao já pago (2026-12-13 →
    2027-12-13) e liberou IA e o 3º usuário. Suspensa: Radar e convite 402, Assinatura 200;
    teste vencido: GET 200, POST 402; +7 dias reabriu. Cliente no `/api/admin` 403. Webhook:
    404 no manual, 401 com assinatura errada, 200 com a certa (ativou no banco), repetido
    idempotente. O painel do superadmin listou o uso real (org A: 3 usuários, 30 palavras,
    20 exportações, 1 GB). Monitor automático: organização no Essencial com favorita não ganhou
    monitor, a do Avançado ganhou. Lint limpo, 67/67 testes (`testes/limites.test.js`).
  - Pendente (Seção 3b no plano): trava contra corrida no limite, cache do plano por processo,
    gateway real, e-mail ao administrador no pedido.
- **Seção 4 — boletim diário por e-mail, entregue em 13/11/2026.** Migração `021_boletins.sql`:
  `perfis_busca` ("Meus filtros": palavras, exclusões, UFs, municípios, modalidades, faixa de
  valor, nota mínima, horários), `boletins`, `boletim_itens` (UNIQUE filtro × licitação — a
  mesma licitação nunca vai duas vezes no mesmo filtro), `boletim_leituras` e
  `boletim_descadastros`; limite `perfis_busca` por plano (1 / 5 / 20).
  - O filtro roda no nosso banco (`backend/regras/boletim.js`), sobre o objeto **e** o texto
    extraído do edital — nunca no `palavraChave` do PNCP. Palavra casa no começo da palavra
    ("monitor" pega "monitores", "ti" não casa dentro de "gestião"); exclusão só no objeto;
    sem valor informado a licitação entra com a lacuna; filtro sem palavra não gera boletim.
  - `backend/jobs/boletim.js` roda de hora em hora no worker e solta o boletim no último horário
    vencido do filtro (padrão 7h, 12h, 18h, fuso de São Paulo), uma vez por filtro × dia ×
    horário; e-mail por pessoa da equipe com link de descadastro assinado (HMAC com
    `JWT_SECRET`; o GET só confirma, o POST descadastra). Toda organização ganha um "Filtro
    principal" com as palavras-chave e exclusões que já tinha.
  - Tela **Boletins** (`frontend/src/paginas/Boletins.jsx`): calendário do mês com boletins
    numerados por dia, legenda não lido / lido / lido por outro membro, filtro por filtro,
    status e UF, "marcar boletins do filtro como lidos"; aba "Meus filtros"; receber ou não o
    e-mail vale por pessoa.
  - `npm run boletim -- --org=<id> --simular` mostra o que sairia agora sem gravar;
    sem `--simular` gera e envia já; `-- --dias=N` muda a janela (padrão 3 dias).
  - **Aceite medido** (MariaDB 10.11, 150 licitações reais do PNCP, SMTP local de teste):
    simulação do filtro principal da organização 1 deu **11 de 150**, exatamente a conferência
    independente por SQL `LIKE` (12) menos 1 em que o termo só aparece no meio da palavra
    ("videomonitoramento"). Roteiro pela API com duas organizações novas: **41/41** — filtro com
    "monitor, periféricos", exclusão "glicose", UF RS trouxe os 7 esperados; filtro SC 0; boletim
    nº 1 com 7 itens e 1 e-mail; segunda rodada na mesma hora "já gerado"; nova simulação e slot
    da hora seguinte com **0 itens** (nada repetido); palavra nova trouxe só o item novo (nº 2).
    Isolamento: a outra organização recebeu 404 ao editar, apagar, ler ou marcar o que era da
    primeira, e "marcar todos" dela marcou 0. Essencial: 2º filtro → 402 com Profissional
    sugerido. Leitura por outro membro, descadastro pelo link (token forjado 404) e recadastro
    conferidos. Lint limpo, 76/76 testes (`testes/boletim.test.js`).
  - Não verificado: casamento no texto do edital com edital baixado de verdade (o PNCP não
    respondeu neste ambiente; o caminho foi conferido com um texto inserido numa licitação real)
    e envio por SMTP de produção.
- **Seção 7 — Radar 2.0, entregue em 13/11/2026.** Migração `022_radar.sql`: `municipios`
  (catálogo, 5.570 municípios do IBGE com coordenadas — `backend/config/dados/municipios.csv`,
  carregado pelo `npm run semear`), `perfis_busca.origem`/`filtros` (a pesquisa salva do Radar
  mora na mesma tabela dos filtros do boletim, com `origem = 'radar'`, sem gerar boletim nem
  contar no limite dele), `links_publicos` (só o SHA-256 do token) e, no catálogo, `srp`,
  `informacao_complementar` (a observação do PNCP), `abertura_original` e
  `fim_propostas_original` (primeira data vista — é dela que sai "prorrogada"/"adiada").
  - Filtros (`backend/regras/filtros-radar.js`, função pura usada pela lista, pelas exportações
    e pelo link): palavras soltas = todas, em qualquer ordem; **"entre aspas" = frase exata** no
    objeto; região; **raio em km** (haversine sobre `municipios`, a partir da cidade escolhida ou
    da `radar_cidade_base` da organização; sem cidade, aviso em vez de filtro mudo); esfera,
    situação, órgão (nome ou CNPJ), nº do edital, nº do processo, texto nos itens, texto na
    observação, inclusão e prazo de/até com atalhos hoje/ontem/amanhã, SRP, com edital baixado,
    monitorada. `%` e `_` digitados são texto, não curinga.
  - Etiquetas calculadas na leitura (`backend/regras/etiquetas.js`): nova, vence hoje, urgente,
    recebendo propostas, SRP, prorrogada, adiada, suspensa, revogada, homologada; e "exige
    garantia" quando o edital lido pede garantia contratual.
  - Saídas: Excel e **Word** (`backend/servicos/docx.js`, A4 deitado, lacuna visível),
    **imprimir** (folha de estilo de impressão em `estilo.css`) e **compartilhar** por link de
    leitura de 1 a 30 dias (`/publico/radar/<token>`), revogável. O link tira os filtros de
    decisão (nota, favorito, etapa, descarte, grupo, monitorada) e mostra só o fato público.
  - Cartão: "ver itens" e "mais informações" (processo, observação, telefone e site — o PNCP não
    dá telefone: lacuna) abrem no próprio cartão; anotação com **ditado por voz** (Web Speech API
    do navegador; nenhum áudio vai ao painel). 20 por página, com "ir para" e 20/50/100.
  - O detalhe do PNCP passou a gravar SRP, observação e esfera (`adaptadores/pncp.js`).
  - **Aceite medido**: ver o plano (Seção 7) — contagem de cada filtro pela API igual à
    conferência por SQL independente no banco real; isolamento entre duas organizações; link
    público. Testes em `testes/radar.test.js`.
  - Não verificado: comparação com o ConLicitação no mesmo filtro (sem acesso a ele daqui).
    Pendente (Seção 7b no plano): CAPAG, monitor de chat, município por código IBGE.
- **Seção 8 — Gestão por licitação e dashboard, entregue em 13/11/2026.** Migração
  `023_gestao.sql`: `org_tarefas` (tarefa da equipe — não confundir com `tarefas`, a fila do
  worker), `org_andamentos` (o que aconteceu no processo, com os tipos da Seção 9) e
  `org_licitacoes.responsavel_id`. Regras puras em `backend/regras/gestao.js`; rotas em
  `backend/rotas/gestao.js` (`/api/gestao/*`, módulo `gestao` do plano).
  - **Tarefas** (tela nova e aba no detalhe): visões atrasadas / hoje / futuras / concluídas,
    "por mim / por todos", responsável só da própria equipe (membro ativo). "Hoje" é o dia de
    Brasília, não o `CURDATE()` do banco em UTC.
  - **Andamentos** na Linha do tempo ("adicionar andamento", com tipo e quando aconteceu),
    junto dos eventos do monitor; só quem registrou ou um admin apaga.
  - **Por mim / por todos** no Radar, no Funil e na Agenda (responsável pela licitação ou com
    tarefa nela) e as listas **favoritas / gerenciadas / finalizadas** no Radar. Nenhum dos dois
    passa para o link público.
  - **Detalhe** com Tarefas, Anotações, Anexos, Resultados e **Habilitação** (exigência ×
    cofre) à frente, e o seletor de responsável no cabeçalho.
  - **Calendário**: agenda do mês (prazo e abertura das licitações acompanhadas, tarefas,
    andamentos) com a agenda do dia; as recorrências viraram a segunda aba.
  - **Dashboard** (tela inicial): boletins não lidos, documentos vencendo, tarefas atrasadas,
    novos andamentos, oportunidades do dia e vigentes, vigentes por UF (gráfico + tabela) e
    **valor total em disputa**.
  - Tirar alguém da equipe deixa as licitações e tarefas abertas dela sem responsável.
  - **Aceite medido**: ver o plano (Seção 8) — duas pessoas da organização 1 veem a mesma
    tarefa; a organização 16 não a vê e recebe 404 ao editar/apagar pelo id. Testes em
    `testes/gestao.test.js`.
- `backend/config/db-auth.js` foi removido; `AUTH_DB_DATABASE` não é mais lida. `.env.example`
  ganhou `ADMIN_EMAIL_PADRAO`/`ADMIN_SENHA_PADRAO` para o primeiro login do seed.

A primeira coleta real no PNCP trouxe **1.305 licitações em aberto, nenhuma duplicada**, todas
com link que abre o edital no portal. Depois, pela tela, a palavra "videomonitoramento" foi
simulada (82 no portal), ativada e trouxe **57 licitações novas na coleta seguinte — sem tocar
em código**, que é o aceite da Fase 2.

Em seguida, a documentação de **20 licitações seguidas foi baixada sem erro (57 arquivos,
38 MB)** e, rodando de novo, **nada foi rebaixado** — o aceite da Fase 3.

Por fim, esses **10 editais foram lidos e conferidos um a um** contra o trecho que o painel
recortou: **152 exigências e 11 dispensas**, com **1 marcação discutível** (uma cláusula
condicional de amostra) — o aceite da Fase 4 admite no máximo uma errada.

Com cinco documentos no cofre, o envio de uma licitação real saiu em **segundos**: kit escolhido
sozinho, quatro peças marcadas pelo cruzamento com o edital, **a certidão vencida bloqueada** e
o **PDF único de 42 folhas** com capa, índice e numeração contínua — o aceite da Fase 5.

As declarações entraram em seguida: **9 geradas sozinhas** com o número, o órgão e o objeto da
licitação, e o pacote passou a 13 peças em 51 folhas — o aceite da Fase 5.1, sem digitar nada.

Por fim, mover um card para **"Vou disputar"** criou na hora o aviso de 48 h, que apareceu no
sino do painel — o aceite da Fase 6.

A Fase 7 mediu o preço: **3.817 contratações encerradas** coletadas do PNCP, e as medianas que o
painel calculou sozinho bateram com o levantamento da seção 12 — **Geral · Pregão: 30,8% de
desconto mediano contra os 32% do estudo, e 3º quartil de 49,3% contra 50%**. Abrindo a licitação
de **portal institucional da Câmara de Canoas** (Pregão eletrônico, R$ 17.282,40), a tela mostrou
**"fecha normalmente por R$ 12.878,84"** com a faixa provável de R$ 9.227 a R$ 15.456 — o aceite
da Fase 7. Com o custo de R$ 9.000 preenchido, o painel respondeu **margem de 30% no preço
mediano: licitação para disputar**.

A Fase 8 fechou o ciclo com a proposta. Na licitação real de **registro de preços de material
permanente do Município de Aparecida/SP** (Pregão eletrônico 17, R$ 3.106.412,59, **62 itens**
puxados do edital), 20 itens entraram na disputa com custo e margem informados: total de
**R$ 1.043.736,42**, custo de R$ 777.505,65 e o rodapé respondendo **"a esse preço, sobram
R$ 266.230,77 no contrato inteiro"** — 7 itens verdes e 13 amarelos pelo semáforo da seção 19.
Forçando um item a 20% do estimado, o painel marcou vermelho e levantou o **alerta de
inexequibilidade**. O **PDF saiu com 2 páginas e os 20 itens, sem um único valor de custo e sem
a palavra "margem"**; o **XLSX, aberto no Excel 16.0**, trouxe as colunas Item, Descrição,
Marca/Modelo, Unidade, Quantidade, Valor unitário e Valor total — nenhuma de custo — com
`=SUM(G8:G27)` fechando nos mesmos R$ 1.043.736,42 do PDF e, **ao mudar a quantidade do item 1 de
20 para 40, a linha foi a R$ 67.322,85 e o total a R$ 1.077.397,85 sozinho**. Esse é o aceite da
Fase 8. Os dois arquivos entraram no **bloco 3 de "Montar envio"** já marcados: o pacote saiu com
9 peças, a proposta mesclada no PDF único de 47 folhas e a planilha ao lado, como manda a
seção 17.5 para arquivo que não é PDF.

A Fase 9 ligou o diagnóstico. Rodado contra a base real de 1.362 licitações, o job da seção 20.4
fechou **235 licitações de pontuação abaixo de 30 que venceram o prazo sem ninguém olhar — R$
725.785.370,50 estimados** — e a tela avisou o que isso quer dizer: mais venceram sem análise do
que foram descartadas por um motivo, ou seja, volume demais chegando. O ranking de bloqueios foi
conferido contra um agregado SQL independente, linha por linha, e bateu: mesma ordem, mesma
contagem, mesmo valor. Com 61 licitações reais classificadas por bloqueio, a tela apontou o
**bloqueio nº 1 — Atestado de capacidade técnica, 24 licitações, R$ 654.421.977,36 em jogo** —
com o caminho da seção 20.3 ao lado (*fechar um contrato pequeno, inclusive por dispensa, e pedir
o atestado ao final — custo baixo*) e a simulação ao desconto mediano do grupo: **R$
449.201.159,78 em contratos disputáveis**. Esse é o aceite da Fase 9 na mecânica inteira; o
número de 90 dias só vai existir com 90 dias de uso — a base hoje tem cinco dias, e a tela mostra
o que há nela, sem completar o resto.

A Fase 10 pôs o painel para olhar sozinho. O aceite do hash: adulterando à mão o `hash_arquivos`
da licitação **195 — IPPUC, plataforma de IA generativa** —, a checagem seguinte **detectou a
alteração, gravou o evento com o diff, levantou o alerta vermelho** *"O edital mudou. Reveja
antes de enviar"* e **baixou `01_..._EDITAL_v2.pdf` ao lado do original, sem apagá-lo**. Rodando
o monitor de verdade sobre a base, **246 monitoramentos** foram ligados e as primeiras checagens
já pegaram mudança real no portal: a licitação **29 passou a Suspensa** e a **260 voltou de
Suspensa para Divulgada**, cada uma com seu evento na linha do tempo. A captura de resultado foi
conferida com os vencedores reais da licitação **677**: com o CNPJ da empresa igual ao do
vencedor o card foi para **Ganhamos** (IVM Telecomunicações, R$ 6.554.088); com outro CNPJ, para
**Perdemos**; **sem CNPJ no perfil o card não se move** e o painel diz por quê; e card em
**"Descartada" não é tocado** — decisão do usuário não se sobrescreve. A varredura de
estratégicas achou, na base real, **45 oportunidades de retomada em 180 dias (36 em 90 dias,
R$ 11.863.724 em jogo)** e **175 contratações de baixa concorrência** — o aceite pedia 20.

A Fase 11 trouxe a leitura assistida e o calendário. Os **10 editais com texto extraído na base
foram lidos pelo Gemini e conferidos um a um**: os 10 resumos batem com o objeto que o PNCP
publica, que é fonte independente do PDF, e das **22 afirmações que a IA fez e que não estavam
no objeto** — vigência de 60 meses em Porto Velho, as 2 horas para enviar habilitação em São
Bento do Sul, a prorrogação por até 10 anos em Medianeira, o "não haverá exigência de garantia
contratual" em Dom Joaquim — **22 foram encontradas literalmente no texto do próprio edital**.
O aceite pedia 8 de 10. Nenhuma invenção; a validação de schema descartou o que veio fora do
formato e a tela mostra o que descartou. Custou **131.528 tokens de entrada e 15.436 de saída**
em 10 chamadas, com o 10º edital servido pelo cache (mesmo texto do 9º, mesmo hash, zero
chamada). Do outro lado, a detecção de recorrência achou **65 recorrências com duas ocorrências
ou mais, 64 com janela prevista** — o aceite pedia 5 — entre elas o São Paulo Penitenciária
comprando kit de higiene cinco vezes e a Câmara de São João da Paraúna renovando o site cinco
vezes. A sugestão de palavras-chave (seção 23.5) devolveu 10 termos novos, cada um citando a
licitação que o justifica.

A Fase 12 fechou os prazos e os dossiês. O aceite do prazo: nas **10 licitações cujo edital foi
lido, o painel acertou as 10 datas limite de esclarecimento**, conferidas contra o texto do
próprio edital — seis repetem os 3 dias úteis da Lei 14.133 e as outras quatro não escrevem
prazo nenhum, caso em que vale a regra legal. Os feriados reais entraram na conta: São Bento do
Sul pulou **Nossa Senhora Aparecida (12/10)** e Curral Novo do Piauí pulou **Finados (02/11)**,
cada um deslocando o limite um dia útil. Cadastrando um feriado municipal de teste em
Garanhuns, o prazo daquela licitação andou de 19/10 para 16/10 e o de uma licitação de Recife
**não se moveu** — o feriado de um município não suspende prazo de outro. O aceite do dossiê:
as fichas de **quatro concorrentes bateram com a contagem manual** em todos os campos, incluindo
o desconto mediano na quarta casa decimal. Os dossiês saíram em **1,2 s para 22 concorrentes e
1.007 órgãos**.

A Fase 13 fechou o pós-vitória. O aceite foi feito com um contrato real: o **Pregão Eletrônico
61/2026 de Orleans/SC** (processo 183/2026, solução de BI municipal, R$ 47.800,00). Mover o card
para "Ganhamos" abriu o contrato sozinho com **5 marcos** no checklist — garantia e renovação de
fora, porque a cláusula 10.1 do contrato dispensa garantia e a vigência ainda não estava
informada. A **assinatura caiu em 13/11**, 5 dias úteis da convocação; o edital, no item 10.1,
dá **3 dias**, e corrigida a data para 10/11 o **alerta do primeiro marco saiu em vermelho**, com
o objeto e o órgão na mensagem — o aceite da fase. Informada a vigência de 12 meses da cláusula
2.1, o marco de **renovação entrou em 11/08/2027**, 90 dias antes do fim; marcada a garantia como
exigida, o marco dela nasceu com **R$ 2.390,00 — 5% exatos do valor — em 25/11**, 10 dias úteis
da assinatura, **pulando o feriado de 20/11**. O marco atrasado voltou a avisar, em vermelho e com
chave própria. Na faixa da LC 123: com R$ 300.000,00 do contador, o painel acusou **83% do teto de
ME e R$ 60.000,00 para a EPP**; com R$ 1.200.000,00, acusou em vermelho que o perfil declara ME e
a receita já é de EPP. O contrato de teste foi removido da base e o card voltou para a Triagem:
a licitação 582 não foi ganha de verdade.

A Fase 14 fechou os extras, cada um medido contra coisa real. O adaptador `generico_html` foi
configurado pela tela, sem uma linha de código, contra o **portal da Prefeitura de Mairiporã/SP**
— um município que já está na base — e trouxe **as 10 licitações que a página publica**, com
link, objeto e situação. Contra o **Portal de Compras Públicas**, que monta a lista no navegador,
ele não devolve zero calado: diz que o seletor não casou com nada e que a página carrega scripts,
sem afirmar qual das duas causas é — as duas produzem o mesmo HTML, e escolher uma mandaria você
caçar um problema que pode não existir. O Radar em Excel saiu com **184 linhas e 18 colunas**, e
as **184 linhas e os 21 campos conferidos bateram com o banco**, um a um. O relatório mensal foi
medido com 8 licitações reais espalhadas em 4 meses: os **32 números dos 4 meses bateram com a
contagem manual**, inclusive o desconto médio na quarta casa. A conversão de imagem pegou a
página de um documento real do Pregão 61/2026 de Orleans em JPG e a **embutiu como folha 24 de um
pacote de 24 folhas**, com o índice dizendo "convertida de imagem" e **nenhuma peça sobrando fora
do PDF** — antes, aquela peça ficava de fora. O cenário do relatório foi desfeito e o funil voltou
ao que era.

O que existe hoje:

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

| Item da Fase 2 | Onde |
|---|---|
| CRUD de Fontes com "Testar agora" | [backend/rotas/fontes.js](backend/rotas/fontes.js), [frontend/src/paginas/Fontes.jsx](frontend/src/paginas/Fontes.jsx) |
| CRUD de Palavras-chave e excluídas com "Simular" | [backend/rotas/palavras.js](backend/rotas/palavras.js), [frontend/src/paginas/Palavras.jsx](frontend/src/paginas/Palavras.jsx) |
| Pesos da aderência em tabela + Configurações | [backend/regras/pesos.js](backend/regras/pesos.js), [frontend/src/paginas/Configuracoes.jsx](frontend/src/paginas/Configuracoes.jsx) |
| Objeto social por CNAE (seção 6.2) | [backend/regras/objeto-social.js](backend/regras/objeto-social.js), [backend/config/dados/perfil-padrao.js](backend/config/dados/perfil-padrao.js) |
| Repontuar sem ir aos portais | [backend/jobs/coletar.js](backend/jobs/coletar.js) (`repontuar`) |

| Item da Fase 3 | Onde |
|---|---|
| `licitacao_arquivos` + job `baixar_edital` idempotente | [backend/migrations/003_arquivos.sql](backend/migrations/003_arquivos.sql), [backend/jobs/baixar.js](backend/jobs/baixar.js) |
| Pastas no volume e nomes de arquivo (seção 7.1) | [backend/servicos/arquivos.js](backend/servicos/arquivos.js) |
| Aba Arquivos com visualizador de PDF e download | [frontend/src/paginas/Detalhe.jsx](frontend/src/paginas/Detalhe.jsx) |
| "Baixar tudo (.zip)" | [backend/rotas/licitacoes.js](backend/rotas/licitacoes.js) |

| Item da Fase 4 | Onde |
|---|---|
| Extração de texto (PDF, DOCX, TXT, conteúdo de ZIP) | [backend/servicos/texto-documento.js](backend/servicos/texto-documento.js) |
| Catálogo de 34 exigências + detecção com negação | [backend/regras/exigencias.js](backend/regras/exigencias.js) |
| Job `ler_edital` | [backend/jobs/ler-edital.js](backend/jobs/ler-edital.js) |
| Tela de checklist com o trecho do edital | [frontend/src/paginas/Exigencias.jsx](frontend/src/paginas/Exigencias.jsx) |

| Item da Fase 5 | Onde |
|---|---|
| Cofre com validade, semáforo e versionamento | [backend/rotas/cofre.js](backend/rotas/cofre.js), [frontend/src/paginas/Cofre.jsx](frontend/src/paginas/Cofre.jsx) |
| Validades padrão e alerta de vencimento | [backend/regras/validades.js](backend/regras/validades.js), [backend/jobs/validades.js](backend/jobs/validades.js) |
| Os quatro kits do seed | [backend/config/dados/kits-padrao.js](backend/config/dados/kits-padrao.js), [backend/rotas/kits.js](backend/rotas/kits.js) |
| Cruzamento kit × exigências × cofre | [backend/servicos/envio.js](backend/servicos/envio.js) |
| ZIP numerado e PDF único com capa e índice | [backend/servicos/pacote.js](backend/servicos/pacote.js) |
| Tela "Montar envio" e "Repetir envio" | [frontend/src/paginas/Envio.jsx](frontend/src/paginas/Envio.jsx) |

| Item da Fase 5.1 | Onde |
|---|---|
| Os 11 modelos do seed | [backend/config/dados/modelos-declaracao.js](backend/config/dados/modelos-declaracao.js) |
| Substituição de variáveis e geração em PDF | [backend/servicos/declaracao.js](backend/servicos/declaracao.js) |
| CRUD dos modelos e pré-visualização | [backend/rotas/modelos.js](backend/rotas/modelos.js), [frontend/src/paginas/Modelos.jsx](frontend/src/paginas/Modelos.jsx) |
| Declarações da licitação | [backend/rotas/declaracoes.js](backend/rotas/declaracoes.js) |

| Item da Fase 6 | Onde |
|---|---|
| As 8 etapas, com o que cada uma pede e dispara | [backend/regras/funil.js](backend/regras/funil.js) |
| Kanban com arrastar e soltar | [frontend/src/paginas/Funil.jsx](frontend/src/paginas/Funil.jsx) |
| Anotações e histórico do card | [frontend/src/paginas/Historico.jsx](frontend/src/paginas/Historico.jsx) |
| Alerta de 48 h e 2 h | [backend/jobs/prazos.js](backend/jobs/prazos.js) |
| Sino de alertas | [frontend/src/componentes/Alertas.jsx](frontend/src/componentes/Alertas.jsx) |
| Alerta por e-mail (opcional) | [backend/servicos/email.js](backend/servicos/email.js) |

| Item da Fase 7 | Onde |
|---|---|
| Tabelas `historico_precos`, `precos_referencia`, `propostas_concorrentes` | [backend/migrations/008_precos.sql](backend/migrations/008_precos.sql) |
| Medianas, quartis, faixa e margem | [backend/regras/preco.js](backend/regras/preco.js) |
| Escolha da referência e recálculo | [backend/servicos/preco.js](backend/servicos/preco.js) |
| Jobs `coletar_encerradas` e resultado por item | [backend/jobs/encerradas.js](backend/jobs/encerradas.js) |
| Adaptador `comprasgov` (e por que ele bloqueia) | [backend/adaptadores/comprasgov.js](backend/adaptadores/comprasgov.js) |
| Aba Preço da licitação | [frontend/src/paginas/Preco.jsx](frontend/src/paginas/Preco.jsx) |
| Aba Concorrentes | [frontend/src/paginas/Concorrentes.jsx](frontend/src/paginas/Concorrentes.jsx) |
| Tela de preço de referência | [frontend/src/paginas/Precos.jsx](frontend/src/paginas/Precos.jsx) |

| Item da Fase 8 | Onde |
|---|---|
| Tabelas `propostas` e `proposta_itens` | [backend/migrations/009_propostas.sql](backend/migrations/009_propostas.sql) |
| Preço, margem, semáforo e inexequibilidade | [backend/regras/proposta.js](backend/regras/proposta.js) |
| Itens do edital, totais e geração da saída | [backend/servicos/proposta.js](backend/servicos/proposta.js) |
| PDF sem custo e XLSX com fórmula viva | [backend/servicos/proposta-saida.js](backend/servicos/proposta-saida.js) |
| Escritor de XLSX (fórmula sem valor colado) | [backend/servicos/planilha.js](backend/servicos/planilha.js) |
| Rotas da proposta | [backend/rotas/propostas.js](backend/rotas/propostas.js) |
| Aba Proposta da licitação | [frontend/src/paginas/Proposta.jsx](frontend/src/paginas/Proposta.jsx) |
| Proposta no bloco 3 de "Montar envio" | [backend/servicos/envio.js](backend/servicos/envio.js), [frontend/src/paginas/Envio.jsx](frontend/src/paginas/Envio.jsx) |

| Item da Fase 9 | Onde |
|---|---|
| Motivos da seção 20.1 e tabela "como resolver" da 20.3 | [backend/regras/descarte.js](backend/regras/descarte.js) |
| Conversão dos motivos antigos e `descartado_em` | [backend/migrations/010_diagnostico.sql](backend/migrations/010_diagnostico.sql) |
| Ranking, valor em jogo e simulação | [backend/servicos/diagnostico.js](backend/servicos/diagnostico.js) |
| Descarte automático por prazo vencido (20.4) | [backend/jobs/descartar-vencidas.js](backend/jobs/descartar-vencidas.js) |
| Código que barrou cobrado na API e escolhido em lista | [backend/rotas/licitacoes.js](backend/rotas/licitacoes.js), [frontend/src/paginas/Funil.jsx](frontend/src/paginas/Funil.jsx) |
| Rotas do diagnóstico | [backend/rotas/diagnostico.js](backend/rotas/diagnostico.js) |
| Tela Diagnóstico | [frontend/src/paginas/Diagnostico.jsx](frontend/src/paginas/Diagnostico.jsx) |
| Mesma conta no terminal | [backend/jobs/executar-diagnostico.js](backend/jobs/executar-diagnostico.js) |

| Item da Fase 10 | Onde |
|---|---|
| `monitoramentos`, `eventos_licitacao` e `oportunidades_retomada` | [backend/migrations/011_monitor.sql](backend/migrations/011_monitor.sql) |
| Cadência da seção 21.2 e hashes de arquivos e datas | [backend/regras/monitor.js](backend/regras/monitor.js) |
| Assinatura de objeto e similaridade por trigramas (24.3) | [backend/regras/similaridade.js](backend/regras/similaridade.js) |
| Linha do tempo, ligar/desligar e alerta vermelho | [backend/servicos/monitor.js](backend/servicos/monitor.js) |
| Job `monitorar`: edital alterado, `_v2` e captura de resultado | [backend/jobs/monitorar.js](backend/jobs/monitorar.js) |
| Job `varrer_estrategicas` e reaberturas | [backend/jobs/estrategicas.js](backend/jobs/estrategicas.js) |
| Rotas de oportunidades e da linha do tempo | [backend/rotas/oportunidades.js](backend/rotas/oportunidades.js), [backend/rotas/licitacoes.js](backend/rotas/licitacoes.js) |
| Aba Linha do tempo e tela Oportunidades | [frontend/src/paginas/LinhaDoTempo.jsx](frontend/src/paginas/LinhaDoTempo.jsx), [frontend/src/paginas/Oportunidades.jsx](frontend/src/paginas/Oportunidades.jsx) |
| Os mesmos jobs no terminal | [backend/jobs/executar-monitor.js](backend/jobs/executar-monitor.js), [backend/jobs/executar-estrategicas.js](backend/jobs/executar-estrategicas.js) |

| Item da Fase 11 | Onde |
|---|---|
| `ia_execucoes`, `recorrencias` e `palavras_sugeridas` | [backend/migrations/012_ia_recorrencias.sql](backend/migrations/012_ia_recorrencias.sql) |
| Schema de saída e validação contra injeção (23.4) | [backend/regras/ia-schema.js](backend/regras/ia-schema.js) |
| Chamada ao modelo, recorte por seção, cache e livro-caixa | [backend/servicos/ia.js](backend/servicos/ia.js) |
| Job `ia_resumos` e sugestão de palavras (23.5) | [backend/jobs/ia-resumos.js](backend/jobs/ia-resumos.js) |
| Job `detectar_recorrencias` e alertas de 60/30 dias | [backend/jobs/recorrencias.js](backend/jobs/recorrencias.js) |
| Rotas da IA e do calendário | [backend/rotas/ia.js](backend/rotas/ia.js), [backend/rotas/calendario.js](backend/rotas/calendario.js) |
| Bloco "Leitura assistida" e tela Calendário | [frontend/src/paginas/LeituraIA.jsx](frontend/src/paginas/LeituraIA.jsx), [frontend/src/paginas/Calendario.jsx](frontend/src/paginas/Calendario.jsx) |
| Os mesmos jobs no terminal | [backend/jobs/executar-ia.js](backend/jobs/executar-ia.js), [backend/jobs/executar-recorrencias.js](backend/jobs/executar-recorrencias.js) |

| Item da Fase 12 | Onde |
|---|---|
| `feriados`, `questionamentos`, `concorrentes`, `orgaos` e `sancoes_consultas` | [backend/migrations/013_prazos_dossies.sql](backend/migrations/013_prazos_dossies.sql) |
| Dia útil e os 3 dias úteis da Lei 14.133 | [backend/regras/prazos.js](backend/regras/prazos.js) |
| Feriados: BrasilAPI mais cadastro local | [backend/servicos/feriados.js](backend/servicos/feriados.js) |
| Modelos de esclarecimento e impugnação, e a resposta do órgão | [backend/servicos/questionamento.js](backend/servicos/questionamento.js) |
| CEIS e CNEP com cache de 30 dias | [backend/servicos/sancoes.js](backend/servicos/sancoes.js) |
| Job `agregar_dossies` e `prazos_questionamento` | [backend/jobs/dossies.js](backend/jobs/dossies.js), [backend/jobs/questionamentos.js](backend/jobs/questionamentos.js) |
| Rotas dos dossiês e dos feriados | [backend/rotas/dossies.js](backend/rotas/dossies.js), [backend/rotas/feriados.js](backend/rotas/feriados.js) |
| Aba Questionar e tela Órgãos | [frontend/src/paginas/Questionamentos.jsx](frontend/src/paginas/Questionamentos.jsx), [frontend/src/paginas/Orgaos.jsx](frontend/src/paginas/Orgaos.jsx) |
| Os mesmos jobs no terminal | [backend/jobs/executar-prazos.js](backend/jobs/executar-prazos.js), [backend/jobs/executar-dossies.js](backend/jobs/executar-dossies.js) |

| Item da Fase 13 | Onde |
|---|---|
| `contratos` e `contrato_marcos` | [backend/migrations/014_contratos.sql](backend/migrations/014_contratos.sql) |
| Os sete marcos da seção 28.3 e as faixas da LC 123 | [backend/regras/contrato.js](backend/regras/contrato.js) |
| Checklist automático ao entrar em "Ganhamos" | [backend/servicos/contrato.js](backend/servicos/contrato.js), [backend/regras/funil.js](backend/regras/funil.js) |
| Job `alertas_contrato` e o aviso de 80% da faixa | [backend/jobs/contratos.js](backend/jobs/contratos.js) |
| Rotas do contrato e dos marcos | [backend/rotas/contratos.js](backend/rotas/contratos.js) |
| Tela Contratos | [frontend/src/paginas/Contratos.jsx](frontend/src/paginas/Contratos.jsx) |
| O mesmo job no terminal | [backend/jobs/executar-contratos.js](backend/jobs/executar-contratos.js) |

| Item da Fase 14 | Onde |
|---|---|
| Adaptador `generico_html`, com robots.txt lido de verdade | [backend/adaptadores/generico_html.js](backend/adaptadores/generico_html.js) |
| Radar em Excel e relatório mensal | [backend/servicos/exportar.js](backend/servicos/exportar.js) |
| Imagem de certidão virando página do PDF | [backend/servicos/imagem-pdf.js](backend/servicos/imagem-pdf.js), [backend/servicos/pacote.js](backend/servicos/pacote.js) |
| Configuração da fonte pela tela | [frontend/src/paginas/Fontes.jsx](frontend/src/paginas/Fontes.jsx) |
| Tela Relatório mensal e o botão de exportar do Radar | [frontend/src/paginas/Relatorio.jsx](frontend/src/paginas/Relatorio.jsx), [frontend/src/paginas/Radar.jsx](frontend/src/paginas/Radar.jsx) |

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
- `URL_PUBLICA` — o endereço do painel. Entra no link do e-mail e do WhatsApp de
  alerta; vazio, o aviso sai só com o texto.

Opcionais, e cada um desligado significa desligado — nada quebra sem eles:

- `GEMINI_API_KEY` liga a leitura assistida (seção 23); `IA_ATIVA=false` desliga sem
  apagar a chave.
- `PORTAL_TRANSPARENCIA_CHAVE` liga a consulta de CEIS/CNEP (seção 26.3).
- `SMTP_*` liga o e-mail de alerta; `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_ID` ligam o
  WhatsApp pela Meta Cloud API (seção 14).
- `LIMITE_MB_POR_LICITACAO` é o teto de download por licitação (padrão 300).

Três variáveis têm a última palavra na **tela** de Configurações, não aqui:
`ALERTA_PARA`, `WHATSAPP_DESTINO` e `LIMITE_MB_POR_LICITACAO`. O `.env` é o padrão de
quem sobe o serviço; o que estiver preenchido na tela vence, e campo vazio na tela
devolve a chave ao `.env`.

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

Antes de entregar qualquer coisa (seção 32):

```bash
npm run lint && npm test
```

São 30 testes, em `testes/`, sem banco e sem rede. Eles cobrem o que erra calado:
o semáforo e o intervalo por domínio da coleta (seção 5.4), a validação da saída da
IA (seção 23.4), a lacuna das declarações (seção 18) e a contagem de dias úteis do
prazo de questionamento (seção 25.1).

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

### 5. Depois de mexer em pesos, CNAEs ou palavras de corte

```bash
npm run repontuar
```

Recalcula a pontuação, o objeto social e o "pode participar" de tudo que já está gravado, sem
ir aos portais. Pela tela, o botão **Repontuar o Radar** em Configurações faz o mesmo pela fila.

### 8. Cofre e envio

Não há comando de terminal: o cofre e a montagem do envio vivem na tela.

- **Documentos** (menu lateral) — sobe contrato social, certidões e atestados, com data de
  emissão. Deixe a validade em branco e o painel calcula pela regra do documento. Subir o mesmo
  tipo de novo vira versão nova; a anterior fica no histórico.
- **Montar envio** (aba na licitação) — escolhe o kit, marca sozinho o que o edital pede,
  bloqueia documento vencido e gera **PDF único** (capa, índice, numeração contínua) ou **ZIP
  numerado** com `00_CHECKLIST.pdf` e `00_FALTANDO.txt`.
- **Repetir envio** — traz a seleção de um envio anterior já com as versões atuais do cofre.
- **Declarações** (menu lateral) — os 11 modelos da seção 18, com editor, variáveis clicáveis e
  pré-visualização usando uma licitação real. Modelo do sistema não se edita: duplique e edite a
  cópia. No envio, o bloco 2 gera os PDFs com o número, o órgão e o objeto daquela licitação.

O worker confere as validades todo dia e cria alerta em 30, 15 e 3 dias antes do vencimento.

### 9. Funil e alertas

O **Funil** (menu lateral) é o Kanban das oito etapas da seção 10. Arraste o card ou use o
seletor dentro dele. Cada etapa cobra o que precisa: data e valor na proposta enviada, vencedor
na derrota, motivo em lista fechada no descarte — e, quando o motivo é exigência, qual código
barrou. É isso que alimenta o diagnóstico da Fase 9.

Duas automações, como manda a seção 10:

- entrar em **Analisando** enfileira o download da documentação;
- entrar em **Vou disputar** passa a vigiar o prazo e cria o aviso de **48 h** e de **2 h** antes
  do fim das propostas.

Os avisos aparecem no sino da navegação. Para receber também por e-mail, preencha `SMTP_HOST`,
`SMTP_DE` e `ALERTA_PARA` no `.env` — sem isso o envio fica desligado e o painel segue avisando
na tela.

### 7. Leitura do edital e checklist

```bash
npm run ler
```

Lê os editais já baixados (não vai à internet) e monta o checklist das 34 exigências da seção
8.2. `--licitacao=582` lê só uma; `--refazer` relê o que já tinha sido lido, que é o que fazer
depois de mexer no catálogo. O que você corrigir à mão na tela fica marcado como confirmado e a
leitura seguinte não encosta nele.

### 6. Documentação dos editais

```bash
npm run baixar
```

Baixa os documentos das 20 melhores licitações ainda sem arquivo, para
`$DIR_DADOS/editais/<data UF cidade - órgão (SIGLA nº)>/`. Variações:

```bash
npm run baixar -- --licitacao=582 --confirmado
```

`--confirmado` libera o limite de 300 MB por licitação. O job é **idempotente**: arquivo já
gravado com tamanho maior que zero é pulado, então rodar de novo só busca o que faltou ou o que
o portal publicou depois. Pela tela, a aba **Arquivos** de cada licitação faz o mesmo pela fila,
abre PDF ali mesmo e entrega a pasta inteira em `.zip`.

### 10. Preço de referência e concorrentes

A amostra de preço vem das contratações **já encerradas**, que o painel guarda separadas das do
radar — encerrada não serve para disputar, serve para saber por quanto fecha:

```bash
npm run encerradas
```

Varre o PNCP com as palavras ativas, grava estimado × homologado em `historico_precos` e
recalcula as medianas por grupo e modalidade. Leva alguns minutos: a conduta da seção 5.4 pede
1,5 s entre chamadas. No worker isso roda sozinho uma vez por dia, às 03h.

Com a amostra de pé, a aba **Preço** de cada licitação mostra o bloco da seção 12 — estimado,
"fecha normalmente por", faixa provável — e o campo **Seu custo**, que é o que transforma a faixa
em decisão. A tela **Preço de referência** mostra as duas origens lado a lado: o levantamento de
10/10/2026 e o que o painel mediu, com o tamanho de cada amostra.

Quem ficou com cada item vem do resultado homologado do PNCP:

```bash
npm run resultados -- --licitacao=677
```

O mesmo botão existe na aba **Concorrentes** da licitação.

### 11. Proposta

Também não tem comando de terminal: a aba **Proposta** da licitação faz tudo. O botão **Gerar
proposta** copia os itens do edital — descrição, unidade e quantidade — e você preenche só
**custo** e **margem**; o preço, o total e o semáforo saem da conta. Para licitação de muitos
itens, o campo **margem em todos os itens com custo** resolve de uma vez e você corrige as
exceções.

Cada linha mostra as três referências lado a lado: o **estimado do órgão**, o que **costuma
fechar** naquele grupo (mediana da seção 12 aplicada ao item) e o **seu preço**. Verde é abaixo
da mediana, amarelo entre a mediana e o estimado, vermelho acima do estimado — ou abaixo do seu
custo, ou abaixo de 30% do estimado, que é o **alerta de inexequibilidade**. Item que você não
vai disputar sai da proposta pela caixa `disp`, sem perder a linha.

**Gerar PDF e XLSX** escreve os dois no volume e eles aparecem marcados no bloco 3 de **Montar
envio**. Custo e margem ficam na tela e **não saem em nenhum dos dois arquivos** (seção 19.4).

### 12. Diagnóstico de descarte

A tela **Diagnóstico** responde o que mais te barrou em 90 dias, 6 ou 12 meses, ordenado por
quantas vezes o bloqueio apareceu, com o valor em jogo ao lado. Clicando na linha, ela abre o
caminho de solução da seção 20.3 — e o custo dele — mais o valor disputável ao desconto mediano
do grupo e as últimas licitações que caíram por ali.

Ela se alimenta do que você responde ao soltar um card em **Descartada** no funil: motivo em
lista fechada (seção 20.1) e, quando for exigência ou documento, **qual código do catálogo
barrou**, escolhido numa lista, nunca digitado. Sem o código o descarte conta no total e some do
ranking, então a API recusa: é esse campo que faz o diagnóstico existir.

O botão **fechar vencidas** roda na hora o job da seção 20.4 — licitação de pontuação abaixo de
30 que ficou em Triagem até o prazo vencer vira descartada com motivo `nao_analisada`. Ela não
polui o ranking (nada barrou, ninguém analisou) e conta no total, onde revela o outro problema.
O worker roda o mesmo job de hora em hora; pela linha de comando é `npm run diagnostico`, que
fecha as vencidas e imprime o ranking inteiro no terminal.

O job nunca sobrescreve decisão sua: só toca em card parado em Triagem, não favoritado e sem
descarte. E tirar um card de "Descartada" apaga o descarte inteiro — motivo, código e data —
para que ele não continue pesando num ranking que já foi desfeito.

### 13. Monitor e linha do tempo

Depois de enviar a proposta, acompanhar deixou de ser trabalho manual. A aba **Linha do tempo**
da licitação mostra publicação, alterações, sessão e resultado, com data e hora de cada evento,
e é também a prova documental do que aconteceu, útil se houver recurso: nada ali é editável e
nada some.

O painel liga o monitoramento sozinho no que está em disputa, no que é favorito e nas encerradas
recentes que alimentam a base de preços. A cadência é a da seção 21.2 — de 30 em 30 minutos no
dia da sessão, de 3 em 3 horas na véspera, semanal para o resto — e se encerra sozinha depois de
30 dias sem resultado ou 90 sem novidade. Na tela há **vigiar / parar de vigiar** e **checar
agora**, que vai ao portal na hora.

A cada checagem o painel compara o SHA-256 da lista de arquivos (sequencial, título e tamanho) e
o das datas. Se mudou, grava o evento, **baixa a versão nova sem apagar a antiga** —
`01_Edital.pdf` e `01_Edital_v2.pdf` convivem — e levanta o alerta **vermelho**: *"O edital
mudou. Reveja antes de enviar."* A leitura de exigências passa a usar só a versão mais recente.

Quando o portal publica resultado, os vencedores entram nos itens, o card vai para **Ganhamos**
ou **Perdemos** conforme o CNPJ, e a base de preços e a de concorrentes são alimentadas. Sem
CNPJ no perfil da empresa o card fica parado e o painel diz por quê — ele não chuta. Card que
você já classificou à mão não é tocado.

### 14. Oportunidades

Três abas, ordenadas por valor estimado dentro de 90 dias (180 e 365 também), porque aqui se
escolhe onde investir o dia.

**Desertas** é o filão: ninguém apresentou proposta, o órgão ainda precisa comprar e o art. 75,
III da Lei 14.133 abre caminho para contratação direta. **Fracassadas** tem o mesmo tratamento
legal e um aviso na tela — houve interessados, leia o que desclassificou as propostas antes de
montar a sua. **Baixa concorrência** não é oportunidade imediata: revela nicho.

Cada linha tem **"acompanhar este órgão"**, que liga o monitoramento no que ele já tem aberto na
base. A varredura roda sozinha às 5h e liga reaberturas: quando o mesmo órgão abre de novo um
objeto que ficou sem vencedor, as duas são ligadas e sai o alerta com o novo prazo. O que
reconhece "o mesmo objeto" é a assinatura da seção 24.3 — *"Contratação de empresa especializada
para hospedagem do site institucional da Prefeitura"* vira `hospedagem institucional site` — com
similaridade de trigramas a partir de 0,70.

Duas ressalvas ficam escritas na própria tela, porque o número vale o que vale a fonte:
oportunidade sem item vem da amostra de encerradas, e o PNCP não diz ali se foi deserta ou
fracassada; e baixa concorrência é **inferida pelo desconto** (1º quartil do grupo ou abaixo),
não por contagem de propostas — essa é do Compras.gov.br, que hoje bloqueia.

### 15. Leitura assistida

Na aba **Resumo** da licitação, abaixo dos fatos do portal, o bloco **Leitura assistida**: o que
o órgão quer, o que pedem, o prazo, as exigências críticas com o código do catálogo, as
**armadilhas** — custo e risco que não aparecem na planilha — e um parecer de participação.

Tudo ali é **sugestão até você confirmar**, e a tela diz isso o tempo todo. Não é modéstia: a
detecção por expressão regular da seção 8 continua sendo a fonte principal, porque é
determinística e auditável, e misturar as duas faria você confiar na mais frágil. A IA não
encosta em pontuação, etapa, preço nem documento do cofre — só neste quadro.

O conteúdo do edital é tratado como **dado, nunca instrução**. Ele vai entre delimitadores
aleatórios, o prompt diz que ali dentro não há comando, e — a defesa que de fato conta — a
resposta é validada campo a campo contra o schema: código de exigência que não existe no
catálogo é descartado, enum fora da lista é descartado, confiança fora de 0–1 é cortada. O
rodapé do bloco mostra o que foi descartado, porque resposta torta é sinal, não detalhe.

Custo sob controle (seção 23.3): só roda em licitação com pontuação ≥ 55 ou favorita, manda no
máximo 60 mil caracteres priorizando objeto, habilitação, obrigações e penalidades, e guarda o
resultado pelo SHA-256 do texto — reprocessar o mesmo edital não chama a API. Cada chamada fica
em `ia_execucoes` com modelo, tokens e custo. Para o custo sair em reais, preencha
`IA_PRECO_ENTRADA` e `IA_PRECO_SAIDA` com o preço por milhão de tokens; sem eles os tokens são
registrados do mesmo jeito.

**Sem `GEMINI_API_KEY` a leitura fica desligada e o painel funciona inteiro sem ela** — a IA é
acréscimo, não alicerce. Pela linha de comando: `npm run ia`, `npm run ia -- --licitacao=<id>`,
`npm run ia -- --lote=10`, `npm run ia -- --palavras`.

### 16. Calendário

Órgão público repete contratação, e quase sempre no mesmo mês, porque segue o ciclo
orçamentário. Quem sabe disso chega preparado; quem não sabe descobre com três dias de prazo.

A tela **Calendário** mostra doze meses a partir do corrente — ninguém planeja o ano olhando
para trás — com o que cada órgão costuma abrir, o valor médio, o último vencedor e a confiança.
O botão **preparar** cria o lembrete da janela com o checklist: certidões em dia, atestado
compatível e pesquisa de preço.

A recorrência nasce de **duas ocorrências do mesmo objeto, no mesmo órgão, em anos diferentes** —
0,5 de confiança; três valem 0,8; daí em diante 0,95. Com menos de duas o painel não cria linha
nenhuma: prever a partir de uma compra é adivinhação, e adivinhação na tela estraga a confiança
em tudo o mais. O que reconhece "o mesmo objeto" é a assinatura da seção 24.3, a mesma da Fase
10. Alertas saem 60 e 30 dias antes da janela.

### 17. Questionar o edital

A aba **Questionar** da licitação mostra até quando dá para pedir esclarecimento ou impugnar: os
3 dias úteis antes da abertura que a Lei 14.133 fixa. A conta fica aberta na tela — os dias
úteis contados, um a um, e o que foi pulado, com o motivo (sábado, domingo, Finados). Prazo é
coisa que se confere contra o edital, não que se acredita. A hora limite de 18h é suposição do
painel, e ele diz que é: a lei não fixa, os editais seguem o expediente do órgão.

Os feriados vêm da BrasilAPI para os nacionais; os estaduais e municipais são cadastrados em
**Configurações**, porque não existe fonte única e confiável para eles no Brasil. Feriado
municipal só suspende prazo do próprio município — o de Garanhuns não mexe no de Recife.

Mas isto não é lembrete. O pedido de esclarecimento é ferramenta de trabalho: destrava exigência
desproporcional, confirma por escrito que um documento seu serve, e corrige especificação
impossível antes que o item fracasse. Por isso há **três modelos** — esclarecimento, impugnação
por exigência restritiva e impugnação por erro de especificação — já com o número do pregão, o
órgão e os seus dados, pelo mesmo motor das declarações. O que o painel não sabe vira lacuna
visível: o item do edital e a razão são seus. E a **resposta do órgão fica guardada** com
protocolo e data, porque ela vale como parte do edital.

Depois de vencido o prazo, exigência restritiva já não se discute — só resta decidir se disputa
assim. A tela diz isso.

### 18. Órgãos e concorrentes

Duas perguntas que se respondem antes de gastar o dia montando proposta.

**Este órgão costuma exigir o quê?** A ficha do órgão traz contratações, quanto homologou,
itens que ficaram sem vencedor, desconto médio obtido, modalidade e plataforma mais usadas, os
fornecedores que se repetem, as recorrências detectadas e o **perfil de exigência** — atestado
em 10 de 14, balanço em 2 de 14. Órgão que quase sempre pede atestado avisa o que você precisa
resolver antes de mirar nele; taxa de deserto alta é sinal de preço estimado defasado.

**Qual o piso que estes três praticam?** A ficha do concorrente traz quantas disputou, quantas
ganhou, desconto médio e mediano, desclassificações, onde atua, quantas vezes encontrou você — e
o **menor preço já praticado por grupo**. Se o seu custo está acima disso, aquela disputa não é
sua.

**Sanções** em CEIS e CNEP, pelo Portal da Transparência, com cache de 30 dias porque a API
limita requisições. Serve para dois usos: checar o próprio CNPJ antes de ser inabilitado por
engano, e checar o vencedor quando você fica em segundo — empresa impedida que vence abre
caminho para recurso. Sem `PORTAL_TRANSPARENCIA_CHAVE` a consulta fica desligada, e a tela diz
isso em vez de mostrar "nenhuma sanção" — que seria uma afirmação sem consulta.

Nada aqui é coletado à parte: é tudo derivado da base que já temos, recalculado pelo job mensal
ou pelo botão **recalcular**.

---

### 19. Depois de ganhar

Ganhar é metade. A outra metade tem prazos com multa, e perder prazo contratual custa mais caro
do que perder a licitação — ainda gera sanção que atrapalha as próximas. Por isso, mover um card
para **"Ganhamos"** abre o contrato sozinho, com o **checklist da Lei 14.133** montado: assinar
ou retirar o empenho, apresentar a garantia quando exigida, entregar, aceite, nota fiscal com os
dados do empenho corretos, pagamento e a decisão de renovação, 90 dias antes do fim da vigência.

As datas que o painel calcula são **prazo típico, e a tela diz que são**: 5 dias úteis da
convocação para assinar, 10 para a garantia, 30 dias do aceite para o pagamento. O edital pode
fixar outro — o de Orleans dá 3 dias para assinar — e aí o número do edital ganha: a data é um
campo, não um fato. Marco que depende de data que o painel não tem nasce **sem data**, em vez de
com data chutada, porque alerta errado só ensina a ignorar alerta. Quando a data de que ele
depende aparece, o marco a recebe; o que você já preencheu nunca é sobrescrito.

Cada marco vira alerta datado — assinatura e garantia em **vermelho**, porque inabilitam —, e
marco atrasado volta a avisar, com chave própria, enquanto estiver atrasado.

No topo da tela: **faturado em 12 meses**, **faixa atual** e **quanto falta para a próxima**,
pelas faixas da LC 123 — ME até R$ 360 mil, EPP até R$ 4,8 milhões. ME e EPP mantêm os mesmos
benefícios em licitação, então cruzar de uma para a outra não tira nada; o que muda é o
enquadramento declarado, e a declaração vai em cada proposta. O painel avisa ao passar de 80% da
faixa, e em vermelho quando o perfil declara ME e a receita já é de EPP. São **dois números, e a
tela mostra os dois**: o que passou pelo painel e o que o contador informou em Configurações. A
faixa usa o do contador quando ele existe, porque é ele que vale para a declaração — o painel só
soma o que passou por ele, e diz isso.

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

Duas dessas promessas estavam **escritas e não cumpridas** até a revisão de 07/11/2026,
e vale registrar porque nenhuma das duas dava erro em tela — só fazia o painel bater
mais rápido do que prometeu no portal de terceiro:

- **o intervalo de 1,5 s não valia entre chamadas simultâneas.** `ultimoAcesso` era
  gravado *depois* do sono, então duas chamadas ao mesmo domínio liam o mesmo instante
  anterior, dormiam o mesmo tanto e saíam juntas. Com quatro requisições em voo quase
  todas no PNCP, o espaçamento era decorativo. Agora a janela é **reservada antes** de
  dormir: quatro chamadas ao mesmo domínio saem em 0 s, 1,5 s, 3 s e 4,5 s, em fila.
- **a concorrência podia passar de 4.** `liberarVaga` decrementava o contador e
  acordava o próximo da fila num microtask; nesse intervalo um chamador novo passava na
  frente, e quando o da fila acordava os dois incrementavam. Agora a vaga é entregue
  direto ao próximo, sem voltar ao balcão.

Os dois casos estão em [testes/http.test.js](testes/http.test.js), que falha se alguém
reintroduzir qualquer um deles.

### Jobs pela linha de comando

Todos idempotentes, todos com a conduta acima. O worker roda os mesmos jobs sozinho; a
linha de comando serve para rodar um agora e ver o número:

| Comando | O que faz |
|---|---|
| `npm run coletar` | varre as fontes ativas |
| `npm run repontuar` | recalcula a pontuação do que já está gravado, sem ir aos portais |
| `npm run baixar` | documentação das licitações que valem a pena |
| `npm run ler` | extrai texto e detecta exigências do que já foi baixado |
| `npm run encerradas` | amostra de preço (contratações encerradas) |
| `npm run resultados -- --licitacao=<id>` | resultado de uma licitação |
| `npm run diagnostico` | fecha as vencidas sem análise e imprime o ranking de bloqueios |
| `npm run monitorar` | uma rodada do monitor (`-- --licitacao=<id>` checa uma agora) |
| `npm run estrategicas` | desertas, fracassadas e reaberturas — não vai à internet |
| `npm run recorrencias` | calendário da seção 24 |
| `npm run ia` | leitura assistida (sem `GEMINI_API_KEY`, fica desligada) |
| `npm run prazos` | dias úteis e o limite de esclarecimento |
| `npm run dossies` | fichas de concorrente e órgão |
| `npm run contratos` | marcos do contrato e a faixa da LC 123 |
| `npm run limpar` | `.tmp` com mais de 24 h e arquivos de descartada com mais de 180 dias |
| `npm run sancoes` | CEIS/CNEP do próprio CNPJ e dos concorrentes recorrentes |
| `npm run boletim` | boletim diário; `-- --org=<id> --simular` mostra sem gravar, sem `--simular` envia já |

O `npm run limpar` aceita `-- --dias=365` e `-- --horas=48`; o `npm run sancoes` aceita
`-- --quantos=25`. A limpeza apaga os **arquivos** da licitação descartada, não a ficha:
o motivo do descarte é o que alimenta a tela de diagnóstico, e uma base que se apaga a
cada 180 dias nunca responderia "quanto esse bloqueio me custou no ano".

---

## Deploy no EasyPanel

Dois serviços a partir do **mesmo Dockerfile**, mudando só o comando:

| Serviço | Comando | Observação |
|---|---|---|
| `licitacoes-api` | `npm run api` | expõe a porta 4000, domínio `licitacoes.studiomythos.com.br` |
| `licitacoes-worker` | `npm run worker` | sem domínio, sem porta |

Volume persistente em `/dados` (editais e documentos da empresa ficam fora do container).
As variáveis do `.env` entram em **Environment** nos dois serviços.

**Atualizado em 08/11/2026: os dois serviços já existem**, criados e testados —
veja o estado exato, com os valores já preenchidos e o que falta colar, em
[IMPLANTACAO.md](IMPLANTACAO.md). O roteiro abaixo é o original, para quem for
recriar do zero ou entender a ordem; `licitacoes.studiomythos.com.br` ainda não
resolve no DNS, que é o passo 4.

1. **New Service → App**, nome `licitacoes-api`, apontado para este repositório
   (`almirseibert/licitacoes`, branch `main`), build pelo `Dockerfile` da raiz.
2. **Environment**: colar o conteúdo do `.env` de produção. `DIR_DADOS=/dados`,
   `NODE_ENV=production` e `URL_PUBLICA=https://licitacoes.studiomythos.com.br`.
   `DB_HOST` passa a ser o nome **interno** do serviço MySQL, não `oehpg2.easypanel.host`
   — de dentro do projeto a porta é 3306, e nada precisa ficar exposto para a internet.
3. **Mounts**: volume persistente em `/dados`.
4. **Domains**: `licitacoes.studiomythos.com.br` → porta 4000, com HTTPS pelo
   Let’s Encrypt. O registro DNS do subdomínio tem de existir **antes**, apontando
   para a VPS (hoje o domínio está atrás do Cloudflare: o registro do subdomínio
   precisa ser criado lá).
5. **Deploy** e, pelo **Shell** do serviço, `npm run migrar` uma vez — é idempotente
   e garante o estado das 15 migrações num banco novo; no banco de hoje não tem o
   que aplicar, porque todas já rodaram da máquina de quem desenvolve.
6. **New Service → App** de novo, nome `licitacoes-worker`, **mesmo repositório e
   mesmo Dockerfile**, mesmas variáveis, mesmo volume, sem domínio e sem porta,
   trocando só o comando para `npm run worker`.
7. Conferir: `https://licitacoes.studiomythos.com.br/api/saude` tem de responder
   `{"ok":true}`, e o log do worker tem de dizer
   `Worker de licitações iniciado. Driver da fila: mysql.`

Enquanto o worker não subir, nada roda sozinho: coleta, download, leitura, monitor,
alertas e limpeza são todos dele. A API funciona sem o worker — só não anda sozinha.

---

## Rotas da API

```
POST   /api/auth/login              GET /api/auth/eu
PATCH  /api/auth/tema               { tema: 'claro' | 'escuro' | null } — preferência do usuário
GET    /api/assinatura              plano, situação, recursos, catálogo   GET /api/assinatura/uso
POST   /api/assinatura/pedido       { plano, ciclo } — só o dono; o administrador ativa
GET    /api/boletins?mes=&perfil_id=&status=&uf=   calendário do mês (status por pessoa)
GET    /api/boletins/:id            itens do boletim       POST /api/boletins/:id/lido  { lido }
POST   /api/boletins/marcar-lidos   mesmo filtro da lista
GET    /api/boletins/perfis         "Meus filtros"         POST/PUT/DELETE /api/boletins/perfis/:id
PUT    /api/boletins/perfis/:id/email  { receber } — só para quem está logado
GET    /api/boletins/descadastro/:token  página de confirmação; POST descadastra (sem login)
GET    /api/licitacoes?…&pagina=&por_pagina=   Radar (20 por página) com `etiquetas` e `avisos`
GET    /api/licitacoes/municipios?busca=      cidade de partida do raio
GET    /api/licitacoes/pesquisas              pesquisas salvas   POST { nome, filtros }   DELETE /:id
POST   /api/licitacoes/compartilhar           { filtros, dias ≤ 30, nome } → caminho do link (uma vez)
GET    /api/licitacoes/compartilhados         links válidos      DELETE /:id revoga
GET    /api/publico/radar/:token?pagina=      lista compartilhada, sem login, só o fato público
GET    /api/admin/organizacoes      superadmin: todas, com uso          GET .../:id/eventos
POST   /api/admin/organizacoes/:id/acao  { acao: ativar|suspender|reativar|estender_teste }
POST   /api/cobranca/webhook/:provedor   pública, HMAC em X-Assinatura; fechada no provedor manual
GET    /api/licitacoes              ?busca&grupo&uf&modalidade&valor_min&valor_max
                                    &pontuacao_min&prazo_dias&exclusivo_me&etapa&ordem&pagina
GET    /api/licitacoes/filtros      opções dos seletores do Radar
GET    /api/licitacoes/:id          com itens
PATCH  /api/licitacoes/:id          etapa, favorito, descarte
POST   /api/licitacoes/:id/detalhar enfileira detalhe + itens
GET    /api/fontes                  POST /api/fontes/:id/testar   (simula, não grava)
POST   /api/fontes/:id/coletar      POST /api/fontes/coletar-todas
GET    /api/fontes/execucoes        histórico das últimas coletas
GET    /api/palavras               POST /api/palavras            PATCH /api/palavras/:id
DELETE /api/palavras/:id           POST /api/palavras/simular
POST   /api/palavras/excluidas     PATCH /api/palavras/excluidas/:id
DELETE /api/palavras/excluidas/:id
POST   /api/fontes                 PATCH /api/fontes/:id         DELETE /api/fontes/:id
GET    /api/configuracoes          PATCH /api/configuracoes/pesos
POST   /api/configuracoes/pesos/:chave/restaurar
PATCH  /api/configuracoes/ajustes            # destino do alerta, teto de download, janela de coleta
POST   /api/configuracoes/repontuar
GET    /api/empresa/perfis         POST /api/empresa/perfis      PATCH /api/empresa/perfis/:id
GET    /api/empresa/documentos     POST /api/empresa/documentos   (multipart, 25 MB)
PATCH  /api/empresa/documentos/:id DELETE /api/empresa/documentos/:id
GET    /api/empresa/documentos/:id/arquivo
GET    /api/kits                   POST /api/kits                 PATCH /api/kits/:id
PUT    /api/kits/:id/itens         DELETE /api/kits/:id
GET    /api/alertas                PATCH /api/alertas/:id/lido    POST /api/alertas/lidos
GET    /api/licitacoes/:id/anotacoes   POST /api/licitacoes/:id/anotacoes
GET    /api/modelos-declaracao     POST /api/modelos-declaracao
POST   /api/modelos-declaracao/:id/duplicar    POST /api/modelos-declaracao/previa
GET    /api/modelos-declaracao/:id/previa.pdf
GET    /api/licitacoes/:id/declaracoes         POST /api/licitacoes/:id/declaracoes
GET    /api/licitacoes/:id/declaracoes/:modeloId   PDF já preenchido
GET    /api/licitacoes/:id/envio   POST /api/licitacoes/:id/envio
POST   /api/licitacoes/:id/envio/repetir/:pacoteId
GET    /api/licitacoes/:id/envio/pacotes/:pacoteId/arquivo
POST   /api/licitacoes/:id/envio/anexos
POST   /api/licitacoes/:id/ler     GET /api/licitacoes/:id/exigencias
POST   /api/licitacoes/:id/exigencias/:codigo          correção manual
POST   /api/licitacoes/:id/exigencias/:codigo/soltar   volta ao automático
POST   /api/licitacoes/:id/baixar  GET /api/licitacoes/:id/arquivos
GET    /api/licitacoes/:id/arquivos/:arqId     ?baixar=1 força download
GET    /api/licitacoes/:id/zip     a pasta inteira
GET    /api/licitacoes/:id/preco   PATCH /api/licitacoes/:id/preco   grava o seu custo
GET    /api/licitacoes/:id/concorrentes        POST /api/licitacoes/:id/concorrentes
GET    /api/licitacoes/:id/propostas           POST /api/licitacoes/:id/propostas
GET    /api/licitacoes/:id/propostas/:pid      PATCH /api/licitacoes/:id/propostas/:pid
PATCH  /api/licitacoes/:id/propostas/:pid/itens/:itemId
POST   /api/licitacoes/:id/propostas/:pid/itens    traz item novo do edital
POST   /api/licitacoes/:id/propostas/:pid/margem   mesma margem em todos com custo
POST   /api/licitacoes/:id/propostas/:pid/saida    gera o PDF e o XLSX
GET    /api/licitacoes/:id/propostas/:pid/arquivo/:formato   pdf | xlsx, ?baixar=1
DELETE /api/licitacoes/:id/propostas/:pid
GET    /api/precos-referencia      POST /api/precos-referencia/recalcular
POST   /api/precos-referencia/coletar          varre as encerradas (leva minutos)
GET    /api/concorrentes           GET /api/concorrentes/:cnpj
GET    /api/diagnostico?periodo=90|182|365     ranking, simulação e vencidas sem análise
POST   /api/diagnostico/descartar-vencidas     job da seção 20.4 na mão
GET    /api/licitacoes/:id/linha-do-tempo      eventos + estado do monitoramento
POST   /api/licitacoes/:id/monitorar           { acao: ligar | desligar | checar }
GET    /api/oportunidades?dias=90|180|365      desertas, fracassadas e baixa concorrencia
POST   /api/oportunidades/varrer               varredura da secao 22.3 na mao
PATCH  /api/oportunidades/:id                  situacao e observacao
POST   /api/oportunidades/:id/acompanhar       acompanhar este orgao
GET    /api/licitacoes/:id/ia                  leitura assistida da licitacao
POST   /api/licitacoes/:id/ia                  le agora ({ forcar } ignora o cache)
PATCH  /api/licitacoes/:id/ia                  { situacao: confirmado | recusado }
GET    /api/ia                                 estado e livro-caixa da IA
GET    /api/ia/palavras-sugeridas              POST para pedir uma rodada
PATCH  /api/ia/palavras-sugeridas/:id          { situacao: aceita | recusada }
GET    /api/calendario                         doze meses de recorrencias previstas
POST   /api/calendario/detectar                recalcula as recorrencias
POST   /api/calendario/:id/preparar            lembrete com checklist da janela
GET    /api/licitacoes/:id/questionamentos     prazo, modelos e o que ja foi enviado
POST   /api/licitacoes/:id/questionamentos/montar   texto do modelo pronto
POST   /api/licitacoes/:id/questionamentos     registra o pedido
PATCH  /api/licitacoes/:id/questionamentos/:qid     protocolo, resposta e resultado
GET    /api/dossies/orgaos                     GET /api/dossies/orgaos/:cnpj
GET    /api/dossies/concorrentes/:cnpj         POST .../sancoes  consulta CEIS/CNEP
POST   /api/dossies/minhas-sancoes             checa o proprio CNPJ
POST   /api/dossies/agregar                    recalcula as fichas
GET    /api/feriados?ano=2026                  POST /api/feriados  (estadual/municipal)
POST   /api/feriados/importar                  baixa os nacionais da BrasilAPI
DELETE /api/feriados/:id                       so os cadastrados a mao
GET    /api/contratos                          lista, faturado em 12m e faixa
GET    /api/gestao/tarefas                     ?visao=atrasadas|hoje|futuras|concluidas&por=mim&licitacao_id=
POST   /api/gestao/tarefas                     cria (responsavel_id da equipe; padrao: quem cria)
PATCH  /api/gestao/tarefas/:id                 titulo, prazo, responsavel, status
DELETE /api/gestao/tarefas/:id
GET    /api/gestao/andamentos?licitacao_id=    andamentos da licitacao, com os tipos
POST   /api/gestao/andamentos                  { licitacao_id, tipo, texto, ocorrido_em ISO com fuso }
GET    /api/gestao/agenda?de=&ate=&por=mim     licitacao, tarefa e andamento por dia (ate 62 dias)
GET    /api/gestao/dashboard                   cartoes, oportunidades, por UF, valor em disputa
GET    /api/gestao/membros                     quem pode ser responsavel
GET    /api/gestao/anexos?licitacao_id=        anexos da licitacao
GET    /api/contratos/:id                      contrato com o checklist
POST   /api/contratos                          abre o contrato de uma licitacao ganha
PATCH  /api/contratos/:id                      datas, valores, gestor e situacao
POST   /api/contratos/:id/marcos               marco a mao (medicao, por exemplo)
PATCH  /api/contratos/:id/marcos/:marcoId      data prevista e conclusao
DELETE /api/contratos/:id/marcos/:marcoId      so os acrescentados a mao
POST   /api/contratos/avisos/rodar             roda os alertas de marco agora
GET    /api/licitacoes/exportar                o Radar em Excel (`?formato=docx` em Word), com os filtros da tela
GET    /api/licitacoes/relatorio?meses=12      relatorio mensal (&formato=xlsx baixa)
GET    /api/painel/resumo          GET /api/saude
```

Erro sempre no formato `{ "erro": "mensagem em português", "detalhe": "técnico" }`.

---

## Antes de usar para valer

O perfil da empresa está com os valores do seed: `razao_social`, `cnpj`, `endereco`,
`representante` e `cpf_representante` estão **vazios** no banco. Complete-os no bloco
**Dados da empresa**, em Configurações — a tela avisa quais faltam e diz o que acontece
enquanto faltarem: a capa do pacote e as declarações saem com lacuna (`____________`),
de propósito, porque o painel nunca inventa dado.

Dois detalhes de formato que a tela explica e valem repetir aqui:

- o CNPJ vai para o documento **exatamente** como digitado, com ou sem pontuação;
- o endereço deve terminar em `Cidade/UF` — é de lá que sai o local da assinatura
  ("Lajeado, 7 de novembro de 2026").

E, no bloco **Alertas e limites**, quem recebe o aviso. A linha de cima diz quais canais
estão de fato ligados: preencher o e-mail sem `SMTP_HOST` no ambiente não faz e-mail
nenhum sair, e a tela precisa dizer isso em vez de deixar parecer configurado.

Das sete fontes do seed, só o **PNCP** está ativa. O Compras.gov.br monta a lista por
JavaScript e fica de fora de propósito (ver abaixo); as cinco `generico_html` — Portal
de Compras Públicas, BLL, Licitanet, BNC e CELIC — vêm semeadas mas **sem o mapa de
campos preenchido**, e cada uma precisa ser configurada e testada pela tela de Fontes
antes de ser ativada.

## Portal novo sem API — o adaptador `generico_html`

Boa parte dos portais municipais não tem API, mas publica a lista de licitações em HTML. Em vez
de um arquivo de código por portal, a fonte é configurada na própria tela: o botão de engrenagem
em **Fontes** abre a configuração, e o modelo da seção 5.3 entra pronto.

O exemplo que foi usado para validar, contra o portal real da Prefeitura de Mairiporã/SP:

```json
{
  "url_busca": "https://www.mairipora.sp.gov.br/licitacoes",
  "seletor_lista": ".list-item",
  "campos": {
    "identificador": { "seletor": ".list-item__link", "atributo": "href" },
    "objeto":        { "seletor": ".list-item__description" },
    "situacao":      { "seletor": ".list-item__label" },
    "link":          { "seletor": ".list-item__link", "atributo": "href" }
  },
  "uf_padrao": "SP",
  "municipio_padrao": "Mairiporã"
}
```

Depois de salvar, **Testar agora** busca de verdade e mostra o que o seletor pegou, sem gravar.
O `robots.txt` do domínio é lido antes da primeira busca e respeitado; regra que o painel não
entende vale como proibição, porque errar para o lado de não buscar é o lado certo de errar.

Duas coisas que ele não faz, de propósito. Não usa navegador headless: portal que monta a lista
por JavaScript fica de fora, como o Compras.gov.br, em vez de 300 MB de Chromium na imagem. E,
quando o seletor não casa com nada, ele **não afirma qual é a causa** — seletor errado e lista
por JavaScript produzem o mesmo HTML daqui, e dizer "é JavaScript" mandaria você caçar um
problema que pode não existir. A mensagem diz as duas e quanto do seletor chegou a casar.

---

## Próximo passo

As 14 fases da especificação estão entregues, e a revisão de 07/11/2026 fechou o que
tinha ficado para trás no código: os dois defeitos do cliente HTTP, a tela que faltava
para os dados da empresa, os jobs `limpar_temporarios` e `checar_sancoes`, a cadência de
30 minutos do prazo e do monitor, o alerta por WhatsApp, as variáveis da seção 29 que
estavam fixas no código, e o lint e os testes que a seção 32 pede.

**Atualizado em 08/11/2026.** Os serviços `licitacoes-api` e `licitacoes-worker` já
existem no EasyPanel, com GitHub ligado, build testado (o container chegou a subir e
falhou exatamente onde devia — `DB_PASSWORD` ausente, prova de que o resto do caminho
está certo), variáveis não sensíveis preenchidas e volume `/dados` compartilhado. O
que falta agora é **implantação**, não código, em três passos e nesta ordem — os três
exigem uma pessoa, porque nenhum é algo que se faça colando segredo de produção num
formulário sem ser o dono dele:

1. **O `GRANT` no MySQL** — sem ele ninguém loga, nem antes nem depois do deploy.
2. **Colar `DB_PASSWORD` e `JWT_SECRET`** (e os quatro opcionais, se quiser os canais
   ligados) nas telas de Ambiente dos dois serviços, e implantar de novo.
3. **Criar o registro DNS** de `licitacoes.studiomythos.com.br` no Cloudflare.

Os valores exatos — IP do servidor, nome interno do MySQL, a lista completa do que já
está preenchido — estão em [IMPLANTACAO.md](IMPLANTACAO.md), para não ter de reabrir o
EasyPanel para descobrir onde isso parou.

**Completar os dados da empresa** em Configurações, e decidir quem recebe os alertas,
continua pendente também — mas isso já dá para fazer hoje, local, sem esperar o deploy.

O **botão de acesso na página da Studio Mythos** também já está no lugar: no menu do
painel protegido, ao lado de CRM e Financeiro, apontando para o subdomínio — o login é o
mesmo, com o mesmo `JWT_SECRET` e os mesmos usuários, então quem já entrou no CRM entra aqui
com as mesmas credenciais.

### Sobre o XLSX — por que escrito à mão

O edital que pede planilha editável quer **fórmula viva**, não número colado: o pregoeiro muda a
quantidade e o total tem de acompanhar. Nenhuma biblioteca leve de planilha entrega isso sem
gravar o valor em cache junto, então [backend/servicos/planilha.js](backend/servicos/planilha.js)
escreve o XLSX direto — seis XMLs num zip, com `adm-zip`, que já era dependência por causa do
edital compactado. A célula de fórmula sai sem `<v>` e a pasta declara `fullCalcOnLoad`: sem esse
par, Excel e LibreOffice mostram célula vazia até alguém editar o arquivo.

Duas armadilhas custaram tempo e ficaram registradas no código:

- o código de formato de moeda leva aspas (`"R$" #,##0.00`) e **precisa ir escapado** dentro do
  atributo XML; sem isso o `styles.xml` fica inválido e o Excel recusa a planilha inteira;
- o total da linha é `ROUND(qtd × unitário; 2)`, e o painel arredonda **meio para cima**, como o
  Excel — com `toFixed` do JavaScript, R$ 25.608,405 virava 25.608,40 no PDF e 25.608,41 na
  planilha, e dois totais diferentes no mesmo envelope é pedido de impugnação.

### Sobre o Compras.gov.br — o que a Fase 7 encontrou

A seção 5.2 supõe que a lista completa de propostas possa ser lida "do HTML público renderizado"
do Compras.gov.br. **Não pode.** A página de acompanhamento é uma aplicação Angular: o HTML que o
servidor entrega (52 kB, medido em 07/11/2026) é só a casca, e os dados chegam depois por uma API
JSON que exige token de hCaptcha. A própria seção 5.2 diz o que fazer nesse caso, e é o que o
painel faz: `ultimo_status = 'bloqueado'`, link para abrir à mão, e **nunca resolver CAPTCHA**.

No lugar das dezessete propostas por item, o painel usa o que o PNCP publica em API aberta: o
**resultado homologado por item**, com CNPJ, porte e valor unitário. É menos, é real, e a tela diz
de onde veio. Em registro de preços o PNCP devolve vários fornecedores para o mesmo item — foi
assim na licitação de telefonia da ALEPE, com TIM, Telefônica, Claro e a IVM (ME/EPP) no mesmo
item, e a IVM levando por R$ 91,80 contra R$ 99,90 das três.

### O que o PNCP nos ensinou até aqui

- **Itens e arquivos vivem em `/pncp-api/v1`**, não na API de consulta. Em 01/11 esse serviço
  respondeu 503 geral; em 02/11 voltou. O adaptador tenta duas bases antes de desistir.
- **O download de arquivo devolve 422 em cerca de uma chamada a cada cinco**, com
  "Erro ao tentar carregar arquivo &lt;bucket&gt;" — é falha dele ao puxar do bucket, não pedido
  inválido. A mesma URL responde 200 na tentativa seguinte, por isso 422 entra na retentativa
  só no download ([backend/adaptadores/pncp.js](backend/adaptadores/pncp.js)).
- **O portal publica documento novo depois da coleta** (retificação, resposta a
  esclarecimento). Rodar o download de novo traz só isso — foi o que aconteceu no aceite.
