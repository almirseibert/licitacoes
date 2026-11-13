// Aplicação Express: rotas da API e, em produção, o frontend compilado.
// Padrão de erro da seção 13: { "erro": "mensagem em português", "detalhe": "técnico,
// só em log" } — o `detalhe` nunca sai no corpo da resposta em produção; só o
// `console.error` do serviço o recebe. Ver backend/middlewares/responder-erro.js.
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { autenticar, confirmarVinculo, leitorSoLe } = require('./middlewares/autenticar');
const { responderErro } = require('./middlewares/responder-erro');
const { assinaturaValida, exigirRecurso } = require('./servicos/limites');
const { ambiente, urlPublica } = require('./config/ambiente');

const app = express();

// Em produção, só a origem do próprio painel (URL_PUBLICA) pode chamar a API do
// navegador — o token vai no cabeçalho Authorization, não em cookie, então não
// há roubo de sessão por CSRF; mas sem isto qualquer página na internet que
// obtivesse o token poderia chamar a API pelo navegador de quem está logado,
// e não há razão para permitir isso num painel interno. Em desenvolvimento (ou
// sem URL_PUBLICA definida) segue aberto, porque o Vite serve noutra porta.
app.use(cors(ambiente === 'production' && urlPublica ? { origin: urlPublica } : undefined));
// O webhook de cobrança confere o HMAC do corpo CRU: entra antes do parser JSON.
app.use('/api/cobranca', require('./rotas/cobranca'));
app.use(express.json({ limit: '2mb' }));

app.get('/api/saude', (_req, res) => {
  res.json({ ok: true, servico: 'licitacoes-api', quando: new Date().toISOString() });
});

app.use('/api/auth', require('./rotas/auth'));

// Tudo abaixo exige token. Seção 3: `assinaturaValida` barra a organização
// suspensa e deixa só leitura para teste/assinatura vencidos; `exigirRecurso`
// barra o módulo que o plano não tem (402, com o plano que resolve).
const comToken = [autenticar, confirmarVinculo];
const protegida = [...comToken, assinaturaValida, leitorSoLe];
const modulo = (recurso) => [...protegida, exigirRecurso(recurso)];

// Fora da `assinaturaValida`: quem venceu precisa ver o plano e pedir outro.
app.use('/api/assinatura', ...comToken, leitorSoLe, require('./rotas/assinatura'));
app.use('/api/admin', ...comToken, leitorSoLe, require('./rotas/admin'));

app.use('/api/licitacoes', ...protegida, require('./rotas/licitacoes'));
app.use('/api/fontes', ...protegida, require('./rotas/fontes'));
app.use('/api/palavras', ...protegida, require('./rotas/palavras'));
app.use('/api/painel', ...protegida, require('./rotas/painel'));
app.use('/api/configuracoes', ...protegida, require('./rotas/configuracoes'));
app.use('/api/empresa', ...protegida, require('./rotas/empresa'));
app.use('/api/kits', ...protegida, require('./rotas/kits'));
app.use('/api/modelos-declaracao', ...protegida, require('./rotas/modelos'));
app.use('/api/alertas', ...protegida, require('./rotas/alertas'));
app.use('/api/calendario', ...protegida, require('./rotas/calendario'));
app.use('/api/feriados', ...protegida, require('./rotas/feriados'));
app.use('/api/precos-referencia', ...modulo('historico'), require('./rotas/precos-referencia'));
app.use('/api/concorrentes', ...modulo('concorrentes'), require('./rotas/concorrentes'));
app.use('/api/dossies', ...modulo('concorrentes'), require('./rotas/dossies'));
app.use('/api/diagnostico', ...modulo('relatorios'), require('./rotas/diagnostico'));
app.use('/api/oportunidades', ...modulo('estrategicas'), require('./rotas/oportunidades'));
app.use('/api/ia', ...modulo('ia'), require('./rotas/ia'));
app.use('/api/contratos', ...modulo('contratos'), require('./rotas/contratos'));

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
