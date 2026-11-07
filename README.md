# Painel de Licitações — Studio Mythos

CRM de captação e inscrição em licitações de órgãos públicos. A especificação completa
está em [PAINEL_LICITACOES_INSTRUCOES.md](PAINEL_LICITACOES_INSTRUCOES.md) — 32 seções, 14 fases.

**Estado: Fases 1 a 8 implementadas e validadas — as seis primeiras em 02/11/2026, as Fases 7 e 8 em 07/11/2026.**

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
GET    /api/palavras               POST /api/palavras            PATCH /api/palavras/:id
DELETE /api/palavras/:id           POST /api/palavras/simular
POST   /api/palavras/excluidas     PATCH /api/palavras/excluidas/:id
DELETE /api/palavras/excluidas/:id
POST   /api/fontes                 PATCH /api/fontes/:id         DELETE /api/fontes/:id
GET    /api/configuracoes          PATCH /api/configuracoes/pesos
POST   /api/configuracoes/pesos/:chave/restaurar
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
GET    /api/painel/resumo          GET /api/saude
```

Erro sempre no formato `{ "erro": "mensagem em português", "detalhe": "técnico" }`.

---

## Antes de usar para valer

O perfil da empresa está com os valores do seed. Complete em **Configurações** o CNPJ, a razão
social, o endereço e o representante legal com CPF: sem eles, a capa do pacote e as declarações
saem com lacuna (`____________`), de propósito — o painel nunca inventa dado.

## Próximo passo — Fase 9

Diagnóstico de descarte (seção 20): motivos padronizados com o código da exigência que barrou,
tela de diagnóstico com ranking de bloqueios e valor em jogo, simulação "se você tivesse X" e
descarte automático por prazo vencido com motivo `nao_analisada`. O aceite é, com 90 dias de uso,
a tela apontar o bloqueio nº 1 e o valor que ele custou.

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
