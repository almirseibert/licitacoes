// Executa os arquivos .sql de backend/migrations em ordem, uma vez cada.
// Uso: npm run migrar
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { obrigatorio } = require('./ambiente');

const DIR = path.join(__dirname, '..', 'migrations');
const BANCO = process.env.DB_DATABASE || 'licitacoes';

async function principal() {
  const conexao = await mysql.createConnection({
    host: obrigatorio('DB_HOST'),
    port: Number(process.env.DB_PORT || 3306),
    user: obrigatorio('DB_USER'),
    password: obrigatorio('DB_PASSWORD'),
    multipleStatements: true,
    charset: 'utf8mb4_unicode_ci',
  });

  // Em servidor gerenciado (EasyPanel, aaPanel) o usuário da aplicação costuma ter
  // privilégio só no próprio banco: não pode criar, mas pode usar. Tentamos criar e,
  // se o servidor recusar, seguimos com o banco que já existe.
  try {
    await conexao.query(
      `CREATE DATABASE IF NOT EXISTS \`${BANCO}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } catch (erro) {
    console.warn(`· sem permissão para criar o banco \`${BANCO}\` — usando o que já existir.`);
  }

  try {
    await conexao.changeUser({ database: BANCO });
  } catch (erro) {
    throw new Error(
      `o usuário \`${process.env.DB_USER}\` não alcança o banco \`${BANCO}\`. ` +
        `Crie o banco e libere o acesso:\n` +
        `  CREATE DATABASE \`${BANCO}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n` +
        `  GRANT ALL PRIVILEGES ON \`${BANCO}\`.* TO '${process.env.DB_USER}'@'%';`
    );
  }
  console.log(`Banco \`${BANCO}\` pronto.`);

  await conexao.query(`CREATE TABLE IF NOT EXISTS migracoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    arquivo VARCHAR(160) NOT NULL UNIQUE,
    aplicada_em DATETIME DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  const [aplicadas] = await conexao.query('SELECT arquivo FROM migracoes');
  const jaFeitas = new Set(aplicadas.map((l) => l.arquivo));
  const arquivos = fs.readdirSync(DIR).filter((a) => a.endsWith('.sql')).sort();

  for (const arquivo of arquivos) {
    if (jaFeitas.has(arquivo)) {
      console.log(`· ${arquivo} (já aplicada)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(DIR, arquivo), 'utf8');
    try {
      await conexao.query(sql);
      await conexao.query('INSERT INTO migracoes (arquivo) VALUES (?)', [arquivo]);
      console.log(`✓ ${arquivo}`);
    } catch (erro) {
      console.error(`✗ ${arquivo}: ${erro.sqlMessage || erro.message}`);
      await conexao.end();
      process.exit(1);
    }
  }

  await conexao.end();
  console.log('Migrations concluídas.');
}

principal().catch((erro) => {
  console.error('Falha nas migrations:', erro.message);
  process.exit(1);
});
