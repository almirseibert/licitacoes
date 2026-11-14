// Carrega o .env uma única vez, a partir da raiz do repositório.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

function semBarraFinal(url) {
  let u = String(url || '');
  while (u.endsWith('/')) u = u.slice(0, -1);
  return u;
}

function obrigatorio(nome) {
  const valor = process.env[nome];
  if (!valor) {
    throw new Error(`Variável de ambiente ${nome} não definida. Veja o .env.example.`);
  }
  return valor;
}

module.exports = {
  obrigatorio,
  porta: Number(process.env.PORTA || 4000),
  ambiente: process.env.NODE_ENV || 'development',
  // Endereço público do painel (seção 29). Entra nos links do e-mail e do
  // WhatsApp de alerta: sem ele o aviso chega sem o caminho de volta. Vazio,
  // o alerta sai só com o texto.
  urlPublica: semBarraFinal(process.env.URL_PUBLICA),
  // Sempre absoluto: um DIR_DADOS relativo (`./dados`) resolvido contra o
  // diretório de trabalho mudaria de lugar conforme de onde o processo subiu.
  dirDados: path.resolve(
    path.join(__dirname, '..', '..'),
    process.env.DIR_DADOS || 'dados'
  ),
  // E-mail de alerta (Fase 6). Sem SMTP_HOST o envio fica desligado e o aviso
  // vive só no painel — nenhuma credencial no código, como manda a seção 2.1.
  smtp: {
    host: process.env.SMTP_HOST || '',
    porta: Number(process.env.SMTP_PORTA || 587),
    usuario: process.env.SMTP_USUARIO || '',
    senha: process.env.SMTP_SENHA || '',
    de: process.env.SMTP_DE || '',
    para: process.env.ALERTA_PARA || '',
  },
  // Seção 3 do plano SaaS: 'manual' = o administrador ativa o plano pela tela.
  // O webhook do gateway (Asaas ou Stripe, a escolher) só abre com provedor
  // diferente de 'manual' E segredo definido — nenhuma chave no git.
  cobranca: {
    provedor: process.env.COBRANCA_PROVEDOR || 'manual',
    segredoWebhook: process.env.COBRANCA_WEBHOOK_SEGREDO || '',
  },
  jwt: {
    get segredo() { return obrigatorio('JWT_SECRET'); },
    expira: process.env.JWT_EXPIRA || '8h',
  },
  fila: {
    driver: process.env.FILA_DRIVER || 'mysql',
    intervaloMs: Number(process.env.FILA_INTERVALO_MS || 30000),
    redisUrl: process.env.REDIS_URL || '',
  },
  // Leitura assistida (seção 23). Sem GEMINI_API_KEY a IA fica desligada e o
  // painel funciona inteiro sem ela — é acréscimo, não alicerce.
  ia: {
    chave: process.env.GEMINI_API_KEY || '',
    // Desliga a IA sem apagar a chave (seção 29).
    ativa: (process.env.IA_ATIVA || 'true').toLowerCase() !== 'false',
    modelo: process.env.IA_MODELO || 'gemini-2.5-flash',
    // Só para teste local com um servidor que imita a API; em produção, vazio.
    urlBase: (process.env.IA_URL_BASE || 'https://generativelanguage.googleapis.com').replace(/\/+$/, ''),
    // Teto de texto do edital enviado ao modelo (seção 23.3).
    maxCaracteres: Number(process.env.IA_MAX_CARACTERES || 60000),
    timeoutMs: Number(process.env.IA_TIMEOUT_MS || 90000),
    // Teto da resposta e quanto dela o modelo pode gastar raciocinando. Os
    // dois saem do mesmo orçamento no Gemini 2.5 — ver o comentário em
    // servicos/ia.js.
    maxTokensSaida: Number(process.env.IA_MAX_TOKENS_SAIDA || 4096),
    // Seção 11: a ficha completa do edital, com uma citação por campo, não
    // cabe nos 4096 da leitura curta.
    maxTokensResumo: Number(process.env.IA_MAX_TOKENS_RESUMO || 16000),
    // ...e leva mais que os 90 s da leitura curta para ser escrita.
    timeoutResumoMs: Number(process.env.IA_TIMEOUT_RESUMO_MS || 240000),
    // 'gemini' (API nativa, chave em x-goog-api-key) ou 'openai' (endpoint
    // compatível do próprio Gemini, chave em Authorization: Bearer — é o que
    // um cofre de credenciais que só injeta Bearer consegue entregar).
    protocolo: (process.env.IA_PROTOCOLO || 'gemini').toLowerCase() === 'openai' ? 'openai' : 'gemini',
    orcamentoRaciocinio: Number(process.env.IA_ORCAMENTO_RACIOCINIO || 512),
    // Pontuação a partir da qual vale gastar token (seção 23.3).
    pontuacaoMinima: Number(process.env.IA_PONTUACAO_MINIMA || 55),
    // Preço por milhão de tokens, em reais, para o livro-caixa. Fica em
    // variável porque muda sem aviso e não se reescreve código por tabela de
    // preço.
    precoEntrada: Number(process.env.IA_PRECO_ENTRADA || 0),
    precoSaida: Number(process.env.IA_PRECO_SAIDA || 0),
  },
  // CEIS e CNEP pelo Portal da Transparência (seção 26.3). A chave é gratuita,
  // pelo cadastro no gov.br. Sem ela a consulta fica desligada e a tela diz
  // isso — em vez de devolver "nenhuma sanção", que seria uma mentira com data.
  sancoes: {
    chave: process.env.PORTAL_TRANSPARENCIA_CHAVE || '',
  },
  http: {
    userAgent: process.env.USER_AGENT || 'StudioMythosLicitacoes/1.0 (+https://studiomythos.com.br)',
    timeoutMs: Number(process.env.HTTP_TIMEOUT_MS || 30000),
    concorrencia: Number(process.env.HTTP_CONCORRENCIA || 4),
    intervaloDominioMs: Number(process.env.HTTP_INTERVALO_DOMINIO_MS || 1500),
  },
  // Download da documentação (seções 7.2 e 29). O teto por licitação era uma
  // constante no job; virou variável porque é limite de disco, e disco muda de
  // servidor para servidor.
  download: {
    limiteMbPorLicitacao: Number(process.env.LIMITE_MB_POR_LICITACAO || 300),
  },
  // Feriados nacionais (seção 25.1). A URL fica em variável para o dia em que
  // a BrasilAPI mudar de endereço ou precisar de um espelho interno.
  brasilApi: {
    url: semBarraFinal(process.env.BRASILAPI_URL || 'https://brasilapi.com.br/api'),
  },
  // WhatsApp pela Meta Cloud API (seção 14; opcional). Sem token, telefone e
  // destino o envio fica desligado e o alerta segue no painel e no e-mail —
  // nenhum número e nenhum token no código.
  whatsapp: {
    token: process.env.WHATSAPP_TOKEN || '',
    telefoneId: process.env.WHATSAPP_PHONE_ID || '',
    destino: process.env.WHATSAPP_DESTINO || '',
    // Seção 9: modelo aprovado pela Meta. Sem ele, só texto livre (janela de 24 h).
    modelo: process.env.WHATSAPP_MODELO || '',
    modeloIdioma: process.env.WHATSAPP_MODELO_IDIOMA || 'pt_BR',
    // Só muda para apontar a um espelho/simulador em teste; o padrão é a Meta.
    apiUrl: semBarraFinal(process.env.WHATSAPP_API_URL || 'https://graph.facebook.com'),
  },
  // Push do navegador (Web Push, Seção 9). Sem as chaves VAPID fica desligado.
  // Gere uma vez com: npx web-push generate-vapid-keys
  push: {
    chavePublica: process.env.VAPID_CHAVE_PUBLICA || '',
    chavePrivada: process.env.VAPID_CHAVE_PRIVADA || '',
    assunto: process.env.VAPID_ASSUNTO || '',
  },
};
