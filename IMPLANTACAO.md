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
AUTH_DB_DATABASE=digitalplussmysql
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

Três coisas, nenhuma delas código. Fiz tudo que dava para fazer sem credencial; o resto
exige uma pessoa, por desenho deste assistente (nunca digita senha, API key ou token de
produção num formulário, e não abre console de banco de produção):

### 1. O GRANT no MySQL — bloqueador nº 1, sem ele ninguém entra

```sql
GRANT SELECT ON digitalplussmysql.usuarios TO 'mysql'@'%';
FLUSH PRIVILEGES;
```

Rodar com um usuário **administrativo** do MySQL (não o `mysql` de todo dia), apontando
para `oehpg2.easypanel.host`, porta `3302` — ou pelo Console do serviço `mysql` dentro do
EasyPanel (`studiomythos` → `mysql` → ícone de terminal na barra do serviço), que já está
autenticado como root sem precisar digitar a senha em lugar nenhum.

### 2. Seis variáveis — só as que são segredo

Nas duas telas **Ambiente** (`licitacoes-api` e `licitacoes-worker`, já abertas com as
outras 34 preenchidas), faltam preencher, lendo do `.env` local de quem desenvolve:

| Variável | Obrigatória? | Efeito sem ela |
|---|---|---|
| `DB_PASSWORD` | **sim** | a API nem sobe (é o erro que apareceu no teste acima) |
| `JWT_SECRET` | **sim** | sobe, mas ninguém consegue logar (token não assina) |
| `GEMINI_API_KEY` | não | leitura assistida por IA fica desligada, painel funciona inteiro sem ela |
| `PORTAL_TRANSPARENCIA_CHAVE` | não | consulta de sanções CEIS/CNEP fica desligada |
| `SMTP_SENHA` | não | alerta por e-mail fica desligado, aviso segue só no sino |
| `WHATSAPP_TOKEN` | não | alerta por WhatsApp fica desligado |

Depois de colar as seis (ou pelo menos as duas obrigatórias), clicar **Implantar** de
novo nos dois serviços — a implantação de hoje ficou com o build pronto, só falta reenviar
com o ambiente completo.

### 3. O registro DNS, no Cloudflare

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

## Como confirmar que está tudo no ar

Depois dos três passos acima:

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
