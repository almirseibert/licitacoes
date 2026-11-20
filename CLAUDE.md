# Como trabalhar neste repositório

Painel de Licitações da Studio Mythos. A especificação completa está em
[PAINEL_LICITACOES_INSTRUCOES.md](PAINEL_LICITACOES_INSTRUCOES.md) — 32 seções e 14 fases — e é
a fonte da verdade: quando o código e a spec divergirem, a spec ganha, ou a divergência é
registrada em comentário explicando por quê.

## Fluxo

O repositório no GitHub é o lugar oficial do trabalho:
<https://github.com/almirseibert/licitacoes>

- Cada fase termina com **commit e push no branch da sessão**. Sem PR. A `main` só recebe o
  trabalho quando o usuário autorizar (decisão de 15/11/2026) — e é a `main` que o EasyPanel
  implanta, então nada chega a produção sem esse aval.
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
- A **IA só sugere**: não muda pontuação, etapa, preço nem documento do cofre, e o conteúdo do
  edital é dado, nunca instrução — toda resposta passa pelo schema antes de aparecer (seção 23.4).
- A **IA só roda por clique** de quem usa o painel (decisão de 20/11/2026): nenhum job, worker ou
  rotina agendada chama o modelo — gasta crédito sem comprovação de uso. `testes/ia-sem-automatico.test.js`
  falha se isso mudar.
- Dado que falta vira **lacuna visível** (`____________`), nunca valor inventado.

## Rodar

```bash
npm install && npm run migrar && npm run semear
```

`npm run admin` (cria ou conserta o administrador de `ADMIN_EMAIL_PADRAO`; `-- --redefinir-senha` troca a senha),
`npm run api`, `npm run worker`, `npm run dev:front`. Jobs pela linha de comando:
`npm run coletar` (`-- --fonte=1 --varrer=RS` faz a varredura total de uma UF no PNCP), `npm run repontuar`, `npm run baixar`, `npm run ler`,
`npm run encerradas` (amostra de preço), `npm run resultados -- --licitacao=<id>`,
`npm run diagnostico` (fecha as vencidas sem análise e imprime o ranking de bloqueios),
`npm run monitorar` (uma rodada do monitor; `-- --licitacao=<id>` checa uma agora), `npm run chat` (uma rodada do chat do pregão),
`npm run estrategicas` (desertas, fracassadas e reaberturas — não vai à internet),
`npm run recorrencias` (calendário da seção 24), `npm run segmentar` (classifica contratos no catálogo de segmentos; `-- --refazer` depois de mudar o catálogo), `npm run ia` (leitura assistida; sem
`GEMINI_API_KEY` ela fica desligada e o painel funciona inteiro sem ela),
`npm run prazos` (dias úteis e o limite de esclarecimento), `npm run dossies`
(fichas de concorrente e órgão), `npm run contratos` (marcos do contrato e a faixa da LC 123;
`-- --contrato=<id>` mostra o checklist de um), `npm run limpar` (`.tmp` velho e
arquivos de licitação descartada há mais de 180 dias e auditoria com mais de 24 meses — a ficha fica, porque é dela
que o diagnóstico vive), `npm run sancoes` (CEIS/CNEP do próprio CNPJ e dos
concorrentes recorrentes), `npm run webhooks` (entrega de novas oportunidades; `-- --simular`), `npm run lgpd` (exclusão de
dados cujo pedido passou dos 7 dias de carência; `-- --listar` só mostra os agendados).

Antes de fechar qualquer fase: `npm run lint && npm test`. São mais de 300 testes em
`testes/`, sem banco e sem rede (as variáveis `DB_*` e `JWT_SECRET` precisam existir, com qualquer
valor), no que erra calado — a conduta da coleta (5.4), a validação da saída da IA (23.4), a
lacuna das declarações (18), os dias úteis do prazo (25.1), o filtro de Ignorar do Radar e a conta
do preço de referência (12). Em Node 22 use `node --test testes/*.test.js`.

O adaptador `generico_html` (seção 5.3) é configurado pela tela de Fontes, não por código: o
mapa de campos é um JSON na própria fonte. Ele lê HTML pronto com `cheerio` — portal que monta
a lista por JavaScript não é forçado com navegador headless; a mensagem diz as duas causas
possíveis do zero resultados e deixa a escolha com quem configura.
O README tem o detalhe de cada um.
