// Aplicação Express: rotas da API e, em produção, o frontend compilado.
// Padrão de erro da seção 13: { "erro": "mensagem em português", "detalhe": "técnico,
// só em log" } — o `detalhe` nunca sai no corpo da resposta em produção; só o
// `console.error` do serviço o recebe. Ver backend/middlewares/responder-erro.js.
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { autenticar } = require('./middlewares/autenticar');
const { responderErro } = require('./middlewares/responder-erro');
const { ambiente, urlPublica } = require('./config/ambiente');

const app = express();

// Em produção, só a origem do próprio painel (URL_PUBLICA) pode chamar a API do
// navegador — o token vai no cabeçalho Authorization, não em cookie, então não
// há roubo de sessão por CSRF; mas sem isto qualquer página na internet que
// obtivesse o token poderia chamar a API pelo navegador de quem está logado,
// e não há razão para permitir isso num painel interno. Em desenvolvimento (ou
// sem URL_PUBLICA definida) segue aberto, porque o Vite serve noutra porta.
app.use(cors(ambiente === 'production' && urlPublica ? { origin: urlPublica } : undefined));
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
app.use('/api/kits', autenticar, require('./rotas/kits'));
app.use('/api/modelos-declaracao', autenticar, require('./rotas/modelos'));
app.use('/api/alertas', autenticar, require('./rotas/alertas'));
app.use('/api/precos-referencia', autenticar, require('./rotas/precos-referencia'));
app.use('/api/concorrentes', autenticar, require('./rotas/concorrentes'));
app.use('/api/diagnostico', autenticar, require('./rotas/diagnostico'));
app.use('/api/oportunidades', autenticar, require('./rotas/oportunidades'));
app.use('/api/calendario', autenticar, require('./rotas/calendario'));
app.use('/api/ia', autenticar, require('./rotas/ia'));
app.use('/api/dossies', autenticar, require('./rotas/dossies'));
app.use('/api/feriados', autenticar, require('./rotas/feriados'));
app.use('/api/contratos', autenticar, require('./rotas/contratos'));

app.use('/api', (_req, res) => {
  res.status(404).json({ erro: 'Rota não encontrada.' });
});

// Frontend compilado (uma imagem só serve API e tela).
const dist = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// Quatro parâmetros de propósito: é a aritmética da assinatura que faz o
// Express reconhecer isto como tratador de erro, e não como rota comum.
app.use((erro, _req, res, _next) => {
  responderErro(res, 500, 'Erro interno no servidor.', erro);
});

module.exports = app;
