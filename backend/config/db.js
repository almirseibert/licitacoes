// Pool do banco PRÓPRIO do painel de licitações (nunca as tabelas do CRM).
// Credenciais só por variável de ambiente — regra de segurança da seção 2.3.
const mysql = require('mysql2/promise');
const { obrigatorio } = require('./ambiente');

const pool = mysql.createPool({
  host: obrigatorio('DB_HOST'),
  port: Number(process.env.DB_PORT || 3306),
  user: obrigatorio('DB_USER'),
  password: obrigatorio('DB_PASSWORD'),
  database: process.env.DB_DATABASE || 'licitacoes',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: 'Z',
  dateStrings: ['DATE'],
  charset: 'utf8mb4_unicode_ci',
});

pool.on('error', (erro) => {
  console.error('Erro no pool MySQL (licitacoes):', erro.code || erro.message);
});

module.exports = pool;
