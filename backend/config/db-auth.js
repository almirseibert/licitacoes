// Pool SOMENTE LEITURA no banco do painel atual, usado apenas para reaproveitar
// o login (tabela `usuarios`). Nenhuma tabela do CRM é escrita a partir daqui.
// Sem AUTH_DB_DATABASE configurado, o login cai no modo local (ver rotas/auth.js).
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
