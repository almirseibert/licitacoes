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
  http: {
    userAgent: process.env.USER_AGENT || 'StudioMythosLicitacoes/1.0 (+https://studiomythos.com.br)',
    timeoutMs: Number(process.env.HTTP_TIMEOUT_MS || 30000),
    concorrencia: Number(process.env.HTTP_CONCORRENCIA || 4),
    intervaloDominioMs: Number(process.env.HTTP_INTERVALO_DOMINIO_MS || 1500),
  },
};
