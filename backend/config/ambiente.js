// Carrega o .env uma única vez, a partir da raiz do repositório.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

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
    modelo: process.env.IA_MODELO || 'gemini-2.5-flash',
    timeoutMs: Number(process.env.IA_TIMEOUT_MS || 90000),
    // Teto da resposta e quanto dela o modelo pode gastar raciocinando. Os
    // dois saem do mesmo orçamento no Gemini 2.5 — ver o comentário em
    // servicos/ia.js.
    maxTokensSaida: Number(process.env.IA_MAX_TOKENS_SAIDA || 4096),
    orcamentoRaciocinio: Number(process.env.IA_ORCAMENTO_RACIOCINIO || 512),
    // Pontuação a partir da qual vale gastar token (seção 23.3).
    pontuacaoMinima: Number(process.env.IA_PONTUACAO_MINIMA || 55),
    // Preço por milhão de tokens, em reais, para o livro-caixa. Fica em
    // variável porque muda sem aviso e não se reescreve código por tabela de
    // preço.
    precoEntrada: Number(process.env.IA_PRECO_ENTRADA || 0),
    precoSaida: Number(process.env.IA_PRECO_SAIDA || 0),
  },
  http: {
    userAgent: process.env.USER_AGENT || 'StudioMythosLicitacoes/1.0 (+https://studiomythos.com.br)',
    timeoutMs: Number(process.env.HTTP_TIMEOUT_MS || 30000),
    concorrencia: Number(process.env.HTTP_CONCORRENCIA || 4),
    intervaloDominioMs: Number(process.env.HTTP_INTERVALO_DOMINIO_MS || 1500),
  },
};
