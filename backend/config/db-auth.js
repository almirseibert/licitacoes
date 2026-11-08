// Pool SOMENTE LEITURA no banco do painel atual, usado apenas para reaproveitar
// o login (tabela `usuarios`). Nenhuma tabela do CRM é escrita a partir daqui.
// Sem AUTH_DB_DATABASE configurado não existe login nenhum: `rotas/auth.js`
// responde 503 dizendo que a base de usuários não está configurada. Não há modo
// local de propósito — um login de emergência no próprio painel seria uma senha
// a mais para vazar, e a seção 2.1 manda reaproveitar a do CRM.
const mysql = require('mysql2/promise');
require('./ambiente');

const base = process.env.AUTH_DB_DATABASE;

const pool = base
  ? mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: base,
      waitForConnections: true,
      connectionLimit: 3,
      queueLimit: 0,
      charset: 'utf8mb4_unicode_ci',
    })
  : null;

if (pool) {
  pool.on('error', (erro) => {
    console.error('Erro no pool MySQL (auth):', erro.code || erro.message);
  });
}

module.exports = pool;
