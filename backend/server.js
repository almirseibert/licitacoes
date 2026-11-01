// Entrada da API. No EasyPanel: npm run api
const { porta, ambiente } = require('./config/ambiente');
const app = require('./app');

const servidor = app.listen(porta, () => {
  console.log(`API de licitações ouvindo na porta ${porta} (${ambiente}).`);
});

function encerrar(sinal) {
  console.log(`\n${sinal} recebido. Encerrando a API...`);
  servidor.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000);
}

process.on('SIGTERM', () => encerrar('SIGTERM'));
process.on('SIGINT', () => encerrar('SIGINT'));
