// /api/configuracoes — pesos da pontuação e perfil da empresa (seções 6, 6.2 e 11.13).
const express = require('express');
const { responderErro } = require('../middlewares/responder-erro');
const pool = require('../config/db');
const fila = require('../servicos/fila');
const pesos = require('../regras/pesos');
const ajustes = require('../servicos/configuracoes');
const notificar = require('../servicos/notificar');

const rotas = express.Router();

rotas.get('/', async (_req, res) => {
  try {
    const regras = await pesos.listar();
    const [perfis] = await pool.query('SELECT * FROM empresa_perfis ORDER BY padrao DESC, id ASC');

    // Ranking da seção 6.2: por onde o objeto social está nos custando oportunidade.
    const [ranking] = await pool.query(
      `SELECT palavra_casada AS termo, grupo, COUNT(*) AS fora, ROUND(AVG(valor_estimado)) AS valor_medio
         FROM licitacoes
        WHERE objeto_social = 'fora' AND descartada = 0 AND palavra_casada IS NOT NULL
        GROUP BY palavra_casada, grupo
        ORDER BY fora DESC
        LIMIT 12`
    );

    const [[cobertura]] = await pool.query(
      `SELECT
         SUM(objeto_social = 'coberto') AS coberto,
         SUM(objeto_social = 'parcial') AS parcial,
         SUM(objeto_social = 'fora')    AS fora,
         SUM(objeto_social IS NULL)     AS sem_checagem
       FROM licitacoes WHERE descartada = 0`
    );

    const [listaAjustes, canais] = await Promise.all([ajustes.listar(), notificar.canais()]);

    res.json({
      pesos: regras,
      // Seção 11.13: destinatário do alerta e teto de download na tela, não só
      // no ambiente. `canais` diz o que de fato está ligado — é a diferença
      // entre "configurei" e "vai chegar".
      ajustes: listaAjustes,
      canais,
      perfis: perfis.map((p) => ({
        ...p,
        cnaes: typeof p.cnaes === 'string' ? JSON.parse(p.cnaes || '[]') : p.cnaes || [],
      })),
      objeto_social: { cobertura, ranking },
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar as configurações.', erro);
  }
});

// PATCH /api/configuracoes/ajustes — { alerta_email_para: 'x@y.com', coleta_hora_inicio: '3' }
// Valor vazio devolve a chave ao que está na variável de ambiente.
rotas.patch('/ajustes', async (req, res) => {
  try {
    const { gravadas, recusadas } = await ajustes.salvar(req.body || {});
    if (recusadas.length && !gravadas.length) {
      return res.status(400).json({
        erro: `Não reconheci ou não aceitei: ${recusadas.join(', ')}.`,
        detalhe: `chaves válidas: ${Object.keys(ajustes.CHAVES).join(', ')}`,
      });
    }
    res.json({
      ok: true,
      gravadas,
      recusadas,
      mensagem: recusadas.length
        ? `${gravadas.length} salva(s). Recusada(s): ${recusadas.join(', ')}.`
        : `${gravadas.length} ${gravadas.length === 1 ? 'configuração salva' : 'configurações salvas'}.`,
    });
  } catch (erro) {
    // Tabela ausente é migração que falta, não falha do painel: a leitura já
    // degrada sozinha, e a escrita precisa dizer o que fazer.
    if (erro.code === 'ER_NO_SUCH_TABLE') {
      return res.status(503).json({
        erro: 'Estas configurações ainda não têm onde ser guardadas. Rode a migração do banco.',
        detalhe: 'falta a tabela `configuracoes` (migração 015). Rode: npm run migrar',
      });
    }
    responderErro(res, 500, 'Não foi possível salvar as configurações.', erro);
  }
});

// PATCH /api/configuracoes/pesos — { palavra_max: 40, modalidade: { dispensa: 15 } }
rotas.patch('/pesos', async (req, res) => {
  try {
    const quantos = await pesos.salvar(req.body || {});
    res.json({
      ok: true,
      mensagem: `${quantos} ${quantos === 1 ? 'peso salvo' : 'pesos salvos'}. Repontue para aplicar ao que já está no Radar.`,
    });
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

rotas.post('/pesos/:chave/restaurar', async (req, res) => {
  try {
    await pesos.restaurar(req.params.chave);
    res.json({ ok: true, mensagem: 'Peso voltou ao padrão de fábrica.' });
  } catch (erro) {
    res.status(400).json({ erro: erro.message });
  }
});

// POST /api/configuracoes/repontuar — recalcula o que já está gravado, sem ir aos portais.
rotas.post('/repontuar', async (_req, res) => {
  try {
    await fila.enfileirar('repontuar', {}, { prioridade: 1, chaveUnica: 'repontuar' });
    res.status(202).json({
      ok: true,
      mensagem: 'Repontuação na fila. O Radar se reorganiza assim que o worker processar.',
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível enfileirar a repontuação.', erro);
  }
});

module.exports = rotas;
