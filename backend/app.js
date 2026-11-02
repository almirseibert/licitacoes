// Aplicação Express: rotas da API e, em produção, o frontend compilado.
// Padrão de erro da seção 13: { erro: "mensagem em português", detalhe: "técnico" }.
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { autenticar } = require('./middlewares/autenticar');

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/saude', (_req, res) => {
  res.json({ ok: true, servico: 'licitacoes-api', quando: new Date().toISOString() });
});

app.use('/api/auth', require('./rotas/auth'));

// Tudo abaixo exige token.
app.use('/api/licitacoes', autenticar, require('./rotas/licitacoes'));
app.use('/api/fontes', autenticar, require('./rotas/fontes'));
app.use('/api/palavras', autenticar, require('./rotas/palavras'));
app.use('/api/painel', autenticar, require('./rotas/painel'));
app.use('/api/configuracoes', autenticar, require('./rotas/configuracoes'));
app.use('/api/empresa', autenticar, require('./rotas/empresa'));

app.use('/api', (_req, res) => {
  res.status(404).json({ erro: 'Rota não encontrada.' });
});

// Frontend compilado (uma imagem só serve API e tela).
const dist = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// eslint-disable-next-line no-unused-vars
app.use((erro, _req, res, _next) => {
  console.error('Erro não tratado:', erro);
  res.status(500).json({ erro: 'Erro interno no servidor.', detalhe: erro.message });
});

module.exports = app;
