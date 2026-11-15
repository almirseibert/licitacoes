# Implantação no EasyPanel — estado em 08/11/2026

Este arquivo é a fonte única sobre o que já está feito na implantação e o que falta,
para que qualquer sessão futura (eu ou outra pessoa) saiba exatamente onde retomar sem
reabrir o EasyPanel para descobrir. Ele é sobre **infraestrutura**; o código e as 14 fases
continuam documentados em [PAINEL_LICITACOES_INSTRUCOES.md](PAINEL_LICITACOES_INSTRUCOES.md)
e o estado de produto em [README.md](README.md).

## O que já está feito

Os dois serviços existem no EasyPanel, dentro do projeto **`studiomythos`** (não num
projeto `licitacoes` separado — o MySQL compartilhado já vive lá, e os serviços precisam
estar no mesmo projeto para se alcançarem pela rede interna do Docker):

| Serviço | Tipo | Fonte | Comando | Domínio |
|---|---|---|---|---|
| `licitacoes-api` | App | GitHub `almirseibert/licitacoes`, branch `main`, Dockerfile na raiz | padrão da imagem (`npm run api`) | `https://licitacoes.studiomythos.com.br` → porta 4000 |
| `licitacoes-worker` | App | mesmo repositório e Dockerfile | `npm run worker` (sobrescrito em Avançado → Comando) | nenhum, de propósito (seção 14: "sem domínio, sem porta") |

Configurado em ambos:
- **Variáveis de ambiente** — as 34 que não são segredo já estão preenchidas (ver tabela
  abaixo). Faltam só 6 linhas, deixadas em branco de propósito.
- **Volume** — montagem nomeada `licitacoes-dados`, montada em `/dados` nos dois serviços
  (mesmo nome nos dois = mesmo volume Docker dentro do projeto `studiomythos`, o que é o
  que faz API e worker enxergarem os mesmos arquivos).
- **Build testado de ponta a ponta** — implantei os dois na hora para confirmar o
  pipeline: o GitHub trouxe o commit `154d01a` (o mais recente), o `docker build` com o
  `Dockerfile` da raiz terminou em segundos, e o container **subiu e falhou exatamente
  como esperado**:
  ```
  Error: Variável de ambiente DB_PASSWORD não definida. Veja o .env.example.
      at obrigatorio (/app/backend/config/ambiente.js:14:11)
      at Object.<anonymous> (/app/backend/config/db.js:10:13)
  ```
  Isso prova que o Dockerfile, o clone do GitHub, a rede interna e o volume estão
  corretos — falta só o que está na próxima seção.

### Variáveis de ambiente já preenchidas (iguais nos dois serviços)

```env
PORTA=4000
NODE_ENV=production
URL_PUBLICA=https://licitacoes.studiomythos.com.br
DB_HOST=studiomythos_mysql
DB_PORT=3306
DB_USER=mysql
DB_DATABASE=licitacoes
JWT_EXPIRA=8h
FILA_DRIVER=mysql
FILA_INTERVALO_MS=30000
DIR_DADOS=/dados
LIMITE_MB_POR_LICITACAO=300
USER_AGENT=StudioMythosLicitacoes/1.0 (+https://studiomythos.com.br)
HTTP_TIMEOUT_MS=30000
HTTP_CONCORRENCIA=4
HTTP_INTERVALO_DOMINIO_MS=1500
IA_MODELO=gemini-2.5-flash
IA_TIMEOUT_MS=90000
IA_MAX_TOKENS_SAIDA=4096
IA_ORCAMENTO_RACIOCINIO=512
IA_PONTUACAO_MINIMA=55
IA_ATIVA=true
IA_MAX_CARACTERES=60000
BRASILAPI_URL=https://brasilapi.com.br/api
SMTP_PORTA=587
```

`DB_HOST=studiomythos_mysql` é o **nome interno** do serviço MySQL que já roda no projeto
(confirmado em Credenciais → Host Interno); de dentro do projeto a porta é 3306, nada
precisa sair para a internet.

## O que falta — e por que não fiz sozinho

**Atualizado em 12/11/2026 (Fase 15):** o GRANT na base `digitalplussmysql.usuarios` do CRM
**não é mais bloqueador** — a Fase 15 (ver [README.md](README.md#fase-15--base-multiempresa-saas)
e [PLANO_SAAS_CONLICITACAO.md](PLANO_SAAS_CONLICITACAO.md)) deu ao painel login e organizações
próprios, em `licitacoes.usuarios`; ele não lê mais a tabela do CRM. `AUTH_DB_DATABASE` saiu do
`.env.example` e das variáveis dos dois serviços (linha removida da lista acima). O primeiro
login agora nasce do `npm run semear`, com `ADMIN_EMAIL_PADRAO`/`ADMIN_SENHA_PADRAO` — ou pelo
cadastro direto em `/api/auth/cadastro`, já em produção, sem precisar do seed.

Restam duas coisas, nenhuma delas código. Fiz tudo que dava para fazer sem credencial; o resto
exige uma pessoa, por desenho deste assistente (nunca digita senha, API key ou token de
produção num formulário):

### 1. Cinco variáveis — só as que são segredo

Nas duas telas **Ambiente** (`licitacoes-api` e `licitacoes-worker`), faltam preencher, lendo
do `.env` local de quem desenvolve (`ADMIN_EMAIL_PADRAO`/`ADMIN_SENHA_PADRAO` são opcionais —
sem elas, cadastre a primeira organização direto pela tela):

| Variável | Obrigatória? | Efeito sem ela |
|---|---|---|
| `DB_PASSWORD` | **sim** | a API nem sobe (é o erro que apareceu no teste acima) |
| `JWT_SECRET` | **sim** | sobe, mas ninguém consegue logar (token não assina) |
| `GEMINI_API_KEY` | não | leitura assistida por IA fica desligada, painel funciona inteiro sem ela |
| `PORTAL_TRANSPARENCIA_CHAVE` | não | consulta de sanções CEIS/CNEP fica desligada |
| `SMTP_SENHA` | não | alerta por e-mail (e convite de organização) fica desligado |
| `WHATSAPP_TOKEN` | não | alerta por WhatsApp fica desligado |

Depois de colar as duas obrigatórias (e as migrações 016/017 rodarem — `npm run migrar` é
idempotente, pode rodar a qualquer momento), clicar **Implantar** de novo nos dois serviços.

### 2. O registro DNS, no Cloudflare

`licitacoes.studiomythos.com.br` ainda não resolve. O domínio raiz `studiomythos.com.br`
já está no Cloudflare e já aponta para este servidor — é questão de criar o registro do
subdomínio lá:

- **Tipo:** A
- **Nome:** `licitacoes`
- **Conteúdo:** `217.196.60.62` (IP deste servidor EasyPanel)
- **Proxy:** a mesma configuração que `studiomythos.com.br` já usa hoje

O lado do EasyPanel já está pronto para isso — o domínio
`https://licitacoes.studiomythos.com.br` já está cadastrado no serviço `licitacoes-api`,
apontando para a porta 4000, com HTTPS ligado. Assim que o DNS resolver, o EasyPanel emite
o certificado Let's Encrypt sozinho, sem mais nenhum clique.

## Primeiro acesso

**Atualizado em 15/11/2026.** Se o login dá "E-mail ou senha incorretos" ou o login e o cadastro
dão "Não foi possível entrar/criar a conta agora", a causa está numa destas três, nesta ordem:

1. **Migrações 016–041 não aplicadas.** O banco de produção só foi migrado até a 015 (07/11);
   usuários, organizações, planos e termos vêm depois. Desde 15/11 o `Dockerfile` roda
   `npm run migrar` antes de subir a API, então basta implantar de novo a `main`. Para fazer na
   hora, sem esperar: EasyPanel › `licitacoes-api` › Console → `npm run migrar`.
2. **`JWT_SECRET` vazio.** A senha confere, mas o token não assina — 500 no login.
3. **Senha do CRM.** Não vale mais desde a Fase 15. O primeiro acesso da Studio Mythos
   (organização 1 — quem é dono/admin dela é o superadmin) nasce assim: preencha
   `ADMIN_EMAIL_PADRAO` e `ADMIN_SENHA_PADRAO` no `licitacoes-api`, implante, e no Console rode
   `npm run semear`. Ele só cria o usuário se a tabela `usuarios` estiver vazia. Quem se cadastra
   pela tela cria uma organização **nova** (cliente), não entra na Studio Mythos.

Se ainda falhar, o Log do `licitacoes-api` mostra o erro técnico (o `detalhe` de `responderErro`).

**Atualizado em 15/11/2026 — rode as duas em sequência e leia o resultado.** O `&&` faz o
`semear` ser pulado se a migração falhar:

```bash
npm run migrar && npm run semear
```

Termina bem quando a última linha do `migrar` é `Migrations concluídas.` e não há `✗`. A 024
e a 026 usavam coluna gerada `STORED`, que o MySQL 8 recusa ("Cannot add foreign key
constraint") — corrigido para `VIRTUAL`, testado em MySQL 8 do zero até a 041. Quem já passou
pela 023 só precisa implantar de novo e rodar os dois comandos acima.

**Login recusado com "e-mail não cadastrado" (15/11/2026).** O `semear` só cria o administrador
quando a tabela `usuarios` está **vazia**; se já havia alguém (ou as variáveis `ADMIN_*` ainda não
estavam no serviço), ele pula e agora diz o motivo na linha "Usuário administrador: nenhum criado —
…". Para criar ou consertar o administrador mesmo assim, no Console de `licitacoes-api`:

```bash
npm run admin
```

Cria o usuário de `ADMIN_EMAIL_PADRAO` (sem espaço, em minúsculas) como dono da Studio Mythos, ou só
dá o vínculo se ele já existia. Se avisar que a senha não confere, `npm run admin -- --redefinir-senha`
troca pela de `ADMIN_SENHA_PADRAO`. A senha mínima do cadastro é 8 caracteres: `123456` entra, mas
troque-a logo depois de logar. O comando nunca imprime a senha.

## Todas as variáveis (iguais nos dois serviços)

O worker ignora `PORTA` e `ADMIN_*`, mas ter as mesmas linhas nos dois evita divergência.
Além das 25 da tabela acima:

| Variável | Valor em produção | Para quê |
|---|---|---|
| `DB_PASSWORD` | **segredo** | obrigatória — sem ela nada sobe |
| `JWT_SECRET` | **segredo** (texto longo e aleatório) | obrigatória — sem ela ninguém loga |
| `ADMIN_EMAIL_PADRAO` / `ADMIN_SENHA_PADRAO` | seu e-mail / senha inicial | primeiro login (só no `semear`) |
| `CONFIAR_PROXY` | `1` | IP real do cliente atrás do Traefik |
| `IA_PROTOCOLO` | `gemini` | |
| `IA_MAX_TOKENS_RESUMO` / `IA_TIMEOUT_RESUMO_MS` | `16000` / `240000` | Resumo do Edital 2.0 |
| `IA_PRECO_ENTRADA` / `IA_PRECO_SAIDA` | opcional | só o livro-caixa da IA |
| `GEMINI_API_KEY` | segredo, opcional | IA |
| `PORTAL_TRANSPARENCIA_CHAVE` | segredo, opcional | CEIS/CNEP |
| `MERCADO_UFS` | `RS,SC,PR` | contratos e atas do PNCP (decisão de 15/11/2026; sem custo de IA, só tempo e disco) |
| `COBRANCA_PROVEDOR` / `COBRANCA_WEBHOOK_SEGREDO` | `manual` / vazio | Asaas quando o código existir |
| `SMTP_HOST`, `SMTP_USUARIO`, `SMTP_SENHA`, `SMTP_DE`, `ALERTA_PARA` | opcional | e-mail, convite, recuperação de senha |
| `SUPORTE_EMAIL` | opcional | aviso de solicitação de suporte |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_DESTINO`, `WHATSAPP_MODELO`, `WHATSAPP_MODELO_IDIOMA`, `WHATSAPP_API_URL` | opcional | WhatsApp (`pt_BR`, `https://graph.facebook.com`) |
| `VAPID_CHAVE_PUBLICA`, `VAPID_CHAVE_PRIVADA`, `VAPID_ASSUNTO` | opcional | push do navegador |
| `OPERADORA_RAZAO_SOCIAL`, `OPERADORA_CNPJ`, `OPERADORA_ENCARREGADO_EMAIL` | dados da Studio Mythos | termos e política (vazio vira `____________`) |
| `ADVOGADO_REVISOR_NOME/OAB`, `JURIDICO_/LEGAL_/PARCEIROS_REVISADO(_EM)` | vazio / `false` | textos seguem como minuta |
| `REDIS_URL` | vazio | só com `FILA_DRIVER=bullmq` |
| `IA_URL_BASE`, `WEBHOOK_PERMITIR_LOCAL` | **não definir** | só teste local |

## Como confirmar que está tudo no ar

Depois dos dois passos acima:

```bash
curl https://licitacoes.studiomythos.com.br/api/saude
# espera: {"ok":true,"servico":"licitacoes-api", ...}
```

E no Log do serviço `licitacoes-worker`, a linha:
```
Worker de licitações iniciado. Driver da fila: mysql.
```

## Sobre a migração 015

Não mudou nada hoje: continua aplicada desde 07/11/2026 (commit `3ab0943`), direto no
MySQL do EasyPanel, de fora, pela porta 3302. Não há nada para rodar de novo — `npm run
migrar` continua seguro de rodar a qualquer momento (é idempotente), mas hoje ele não tem
o que aplicar.

## O que eu não toquei, por decisão de segurança deste assistente

- Não abri um console de shell dentro do container do MySQL em produção, mesmo tendo
  acesso de navegador logado — abrir um console remoto de banco de dados em produção é
  uma categoria de ação que este assistente não executa sozinho, mesmo com permissão
  ampla do usuário para "terminar a configuração".
- Não digitei nenhuma senha, chave de API ou token em nenhum campo do EasyPanel, mesmo
  sabendo os nomes das variáveis — essa é uma regra fixa, não uma escolha desta tarefa.
- Não fiz login no Cloudflare (a aba abriu a tela de login; fechei sem tentar entrar).
- Apaguei um domínio auto-gerado e nunca usado do `licitacoes-worker`
  (`studiomythos-licitacoes-worker.oehpg2.easypanel.host`) porque a seção 14 é explícita
  em o worker não ter domínio nem porta — essa foi a única exclusão que fiz, e era de um
  recurso vazio, criado automaticamente, sem dado nenhum.
