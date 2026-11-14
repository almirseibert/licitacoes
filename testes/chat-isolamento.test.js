// Seção 6 / 6b — isolamento por organização do monitor de chat, sem banco e sem rede.
//
// O chat, o "lido" e o "importante" são de cada organização, mesmo quando duas
// acompanham a mesma sessão. Em vez de conferir só pelo roteiro manual com
// duas contas, o teste troca o banco por um que anota cada consulta e confere
// que TODA consulta a `chat_mensagens` e `monitoramentos` carrega o filtro de
// organização — no texto do SQL e nos valores — pelas funções do serviço e
// pelas rotas. Quem esquecer o filtro numa consulta nova quebra aqui.
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const ORG = 7;
const LICITACAO = 99;
const MENSAGEM = 55;

// Banco falso: anota o que foi perguntado e devolve linhas vazias no formato do mysql2.
const consultas = [];
function resultadoVazio() {
  // A linha carrega a organização e a licitação como o banco devolveria; o job
  // que lê o chat grava o que leu no lugar de quem a linha diz ser.
  const linhas = [{ id: 1, organizacao_id: ORG, licitacao_id: LICITACAO }];
  linhas.affectedRows = 0;
  linhas.insertId = 0;
  return [linhas];
}
const bancoFalso = {
  query: async (sql, valores = []) => {
    consultas.push({ sql: String(sql), valores });
    return resultadoVazio();
  },
};
const caminhoDb = require.resolve('../backend/config/db');
require.cache[caminhoDb] = { id: caminhoDb, filename: caminhoDb, loaded: true, exports: bancoFalso };

const servico = require('../backend/servicos/chat');
const rotasChat = require('../backend/rotas/chat');

const TABELAS_DO_CHAT = /\b(chat_mensagens|monitoramentos)\b/;

/** Toda consulta às tabelas do chat tem o filtro de organização, com o id certo nos valores. */
function conferirConsultas(contexto, de = 0) {
  const daRodada = consultas.slice(de).filter((c) => TABELAS_DO_CHAT.test(c.sql));
  assert.ok(daRodada.length > 0, `${contexto}: nenhuma consulta ao chat foi feita — o teste não provou nada`);
  for (const c of daRodada) {
    assert.match(c.sql, /organizacao_id/, `${contexto}: consulta sem organizacao_id:\n${c.sql}`);
    assert.ok(
      c.valores.flat(2).includes(ORG),
      `${contexto}: a consulta não recebeu a organização ${ORG} como valor:\n${c.sql}\n${JSON.stringify(c.valores)}`
    );
  }
}

async function nesta(contexto, fn) {
  const antes = consultas.length;
  await fn();
  conferirConsultas(contexto, antes);
}

test('serviço: toda consulta do chat é filtrada pela organização', async () => {
  const mensagens = [{ autor: 'Pregoeiro', texto: 'Convocamos o licitante 07 a enviar o anexo.', enviada_em: '2026-11-14T13:00:00Z' }];
  await nesta('ligar', () => servico.ligar({ organizacaoId: ORG, licitacaoId: LICITACAO }));
  await nesta('desativar', () => servico.desativar(ORG, LICITACAO));
  await nesta('arquivar', () => servico.arquivar(ORG, LICITACAO, true));
  await nesta('obterMonitor', () => servico.obterMonitor(ORG, LICITACAO));
  await nesta('gravarMensagens', () => servico.gravarMensagens({ organizacaoId: ORG, licitacaoId: LICITACAO, mensagens }));
  await nesta('registrarLeitura', () =>
    servico.registrarLeitura({ organizacaoId: ORG, licitacaoId: LICITACAO, passo: { status: 'ok', aviso: null, proxima: new Date() } })
  );
  await nesta('encerrar', () => servico.encerrar(ORG, LICITACAO));
  await nesta('listarMonitores', () => servico.listarMonitores(ORG, 'todos'));
  await nesta('listarMonitores (não lidos)', () => servico.listarMonitores(ORG, 'nao_lidos'));
  await nesta('contarAbas', () => servico.contarAbas(ORG));
  await nesta('listarMensagens', () => servico.listarMensagens(ORG, LICITACAO));
  await nesta('marcarMensagem (lida)', () => servico.marcarMensagem(ORG, MENSAGEM, { lida: true }));
  await nesta('marcarMensagem (importante)', () => servico.marcarMensagem(ORG, MENSAGEM, { importante: true }));
  await nesta('lerTodas', () => servico.lerTodas(ORG, LICITACAO));
  await nesta('portaisMedidos', () => servico.portaisMedidos(ORG));
});

test('serviço: o alerta de mensagem nova nasce para a organização que leu, não para outra', async () => {
  const antes = consultas.length;
  const novas = [{ chave: 'a'.repeat(64), autor: 'Pregoeiro', texto: 'Licitante convocado, prazo de 10 minutos.', destaques: ['convocado', 'prazo'] }];
  await servico.alertarNovas({ organizacaoId: ORG, licitacaoId: LICITACAO, novas, orgao: 'Prefeitura' });
  const insercao = consultas.slice(antes).find((c) => /INSERT INTO alertas/.test(c.sql));
  assert.ok(insercao, 'o alerta deveria ter sido gravado');
  assert.equal(insercao.valores[0], ORG, 'organizacao_id é o primeiro valor do INSERT em alertas');
});

test('marcar mensagem sem nada para mudar não consulta o banco', async () => {
  const antes = consultas.length;
  assert.equal(await servico.marcarMensagem(ORG, MENSAGEM, {}), null);
  assert.equal(consultas.length, antes);
});

test('o worker é o único que lê o chat de todas as organizações — e devolve a quem cada linha pertence', async () => {
  const antes = consultas.length;
  await servico.devidos({ limite: 5 });
  const c = consultas[antes];
  assert.doesNotMatch(c.sql, /m\.organizacao_id\s*=/, 'a fila do worker atravessa organizações por desenho');
  assert.match(c.sql, /SELECT m\.id, m\.organizacao_id/, 'cada linha precisa carregar a organização dona, para o job gravar no lugar certo');
});

// ------------------------------------------------------------------ rotas

test('rotas: toda consulta do chat feita pelas rotas é filtrada pela organização', async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.organizacaoId = ORG;
    req.usuario = { id: 3, nome: 'Teste', papel: 'dono' };
    next();
  });
  app.use('/api/chat', rotasChat);
  const servidor = await new Promise((resolver) => {
    const s = app.listen(0, () => resolver(s));
  });
  const base = `http://127.0.0.1:${servidor.address().port}/api/chat`;
  const chamar = (metodo, caminho, corpo) =>
    fetch(base + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });

  try {
    const chamadas = [
      ['GET', '/monitores?aba=todos'],
      ['GET', '/portais'],
      ['GET', `/licitacoes/${LICITACAO}`],
      ['POST', `/licitacoes/${LICITACAO}/ligar`, {}],
      ['POST', `/licitacoes/${LICITACAO}/desativar`, {}],
      ['POST', `/licitacoes/${LICITACAO}/arquivar`, { arquivado: true }],
      ['POST', `/licitacoes/${LICITACAO}/ler`, {}],
      ['POST', `/licitacoes/${LICITACAO}/checar`, {}],
      ['PATCH', `/mensagens/${MENSAGEM}`, { lida: true }],
    ];
    for (const [metodo, caminho, corpo] of chamadas) {
      const antes = consultas.length;
      await chamar(metodo, caminho, corpo);
      const doChat = consultas.slice(antes).filter((c) => TABELAS_DO_CHAT.test(c.sql));
      // Pode haver rota que responde 4xx antes de consultar; o que importa é que, se consultou, filtrou.
      for (const c of doChat) {
        assert.match(c.sql, /organizacao_id/, `${metodo} ${caminho}: consulta sem organizacao_id:\n${c.sql}`);
        assert.ok(c.valores.flat(2).includes(ORG), `${metodo} ${caminho}: sem a organização nos valores:\n${c.sql}`);
      }
    }
  } finally {
    servidor.close();
  }
});
