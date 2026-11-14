// /api/servicos — serviços complementares por parceria (Seção 18 do PLANO_SAAS_CONLICITACAO.md).
// O painel só encaminha o pedido ao parceiro; o lado da operadora (parceiros, andamento,
// vendas) fica em rotas/admin-servicos.js.
const express = require('express');
const pool = require('../config/db');
const { exigirPapel } = require('../middlewares/autenticar');
const { responderErro } = require('../middlewares/responder-erro');
const email = require('../servicos/email');
const regras = require('../regras/servicos');
const { CATALOGO } = require('../regras/exigencias');
const escopo = require('../servicos/escopo');
const exigenciasOrg = require('../servicos/exigencias');
const { parceirosAtivos, parceiroAtivo } = require('../servicos/parceiros');

// As exigências que ligam ao seguro garantia vêm do catálogo (campo `servico`), não de uma lista aqui.
const CODIGOS_DE_GARANTIA = CATALOGO.filter((x) => x.servico === 'seguro_garantia').map((x) => x.codigo);

const rotas = express.Router();

/** O que a organização vê de um parceiro (nunca o e-mail que recebe os pedidos). */
const publico = (p) => (p ? { nome: p.nome, site: p.site } : null);

/** A licitação precisa ser uma que a organização acompanha — o catálogo é compartilhado. */
async function licitacaoDaOrganizacao(organizacaoId, id) {
  const [[l]] = await pool.query(
    `SELECT l.id, l.orgao_nome, l.modalidade, l.numero_compra, l.objeto, l.uf, l.valor_estimado, l.abertura_propostas
       FROM ${escopo.daOrganizacao(organizacaoId)} l WHERE l.id = ?`,
    [id]
  );
  return l || null;
}

async function garantiasDaLicitacao(organizacaoId, licitacaoId) {
  const mapa = await exigenciasOrg.daLicitacao(organizacaoId, licitacaoId, { codigos: ['garantia_proposta', 'garantia_contrato'] });
  return regras.garantiasDasExigencias([...mapa.values()]);
}

/** Monta o que iria ao parceiro; devolve `{ erro, status }` quando a licitação não é da organização. */
async function prepararDados(req, v) {
  const [[[empresa]], licitacao, garantias] = await Promise.all([
    pool.query(
      'SELECT razao_social, cnpj, natureza FROM empresa_perfis WHERE organizacao_id = ? ORDER BY padrao DESC, id ASC LIMIT 1',
      [req.organizacaoId]
    ),
    v.licitacaoId ? licitacaoDaOrganizacao(req.organizacaoId, v.licitacaoId) : null,
    v.licitacaoId ? garantiasDaLicitacao(req.organizacaoId, v.licitacaoId) : null,
  ]);
  if (v.licitacaoId && !licitacao) return { erro: 'Licitação não encontrada.', status: 404 };
  const dados = regras.montarDados({
    servico: v.servico, empresa, usuario: req.usuario, licitacao, garantias, mensagem: v.mensagem,
  });
  return { dados };
}

// GET /api/servicos/catalogo — os serviços, se há parceiro e quantos pedidos a organização tem.
rotas.get('/catalogo', async (req, res) => {
  try {
    const [parceiros, [contagens]] = await Promise.all([
      parceirosAtivos(),
      pool.query(
        `SELECT servico, COUNT(*) AS total FROM servico_pedidos
          WHERE organizacao_id = ? AND status NOT IN ('cancelado','recusado','contratado') GROUP BY servico`,
        [req.organizacaoId]
      ),
    ]);
    const abertos = Object.fromEntries(contagens.map((c) => [c.servico, Number(c.total)]));
    res.json({
      servicos: Object.entries(regras.SERVICOS).map(([chave, s]) => {
        const parceiro = regras.escolherParceiro(parceiros.filter((p) => p.servico === chave));
        return {
          chave,
          rotulo: s.rotulo,
          descricao: s.descricao,
          usa_licitacao: s.usaLicitacao,
          disponivel: Boolean(parceiro),
          parceiro: publico(parceiro),
          pedidos_abertos: abertos[chave] || 0,
        };
      }),
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar os serviços.', erro);
  }
});

// GET /api/servicos/licitacoes-com-garantia — onde o edital exige garantia, para escolher na cotação.
rotas.get('/licitacoes-com-garantia', async (req, res) => {
  try {
    const [linhas] = await pool.query(
      `SELECT l.id, l.orgao_nome, l.numero_compra
         FROM ${escopo.daOrganizacao(req.organizacaoId)} l
        WHERE l.descartada = 0 AND (l.abertura_propostas IS NULL OR l.abertura_propostas >= NOW())
          AND ${exigenciasOrg.exigidaSql({ licitacao: 'l.id', organizacao: 'l.organizacao_id', codigos: CODIGOS_DE_GARANTIA })}
        ORDER BY l.abertura_propostas IS NULL, l.abertura_propostas ASC LIMIT 50`
    );
    res.json({ licitacoes: linhas });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível listar as licitações com garantia.', erro);
  }
});

// GET /api/servicos/previa?servico=&licitacao_id= — o que iria ao parceiro, antes do aceite.
rotas.get('/previa', exigirPapel('admin'), async (req, res) => {
  const v = regras.validarPedido({ servico: req.query.servico, licitacao_id: req.query.licitacao_id });
  if (v.erro) return res.status(400).json({ erro: v.erro });
  try {
    const [parceiro, r] = await Promise.all([parceiroAtivo(v.dados.servico), prepararDados(req, v.dados)]);
    if (r.erro) return res.status(r.status).json({ erro: r.erro });
    res.json({
      disponivel: Boolean(parceiro),
      parceiro: publico(parceiro),
      parceiro_id: parceiro ? parceiro.id : null, // o que o cliente viu: o pedido só vale para ele
      linhas: regras.linhasDosDados(r.dados),
      termo: regras.TERMO_VINCULO,
      termo_versao: regras.VERSAO_TERMO_PARCEIRO,
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível montar a prévia do pedido.', erro);
  }
});

// GET /api/servicos/pedidos
rotas.get('/pedidos', async (req, res) => {
  try {
    const [linhas] = await pool.query(
      `SELECT p.id, p.servico, p.status, p.valor_contratado, p.criado_em, par.nome AS parceiro_nome
         FROM servico_pedidos p LEFT JOIN parceiros par ON par.id = p.parceiro_id
        WHERE p.organizacao_id = ? ORDER BY p.id DESC LIMIT 200`,
      [req.organizacaoId]
    );
    res.json({ pedidos: linhas.map(regras.comProtocolo) });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar os pedidos.', erro);
  }
});

// POST /api/servicos/pedidos — { servico, licitacao_id?, mensagem?, aceite_termo }
// Sem parceiro habilitado, só registra o interesse (nada sai do painel e não pede aceite).
rotas.post('/pedidos', exigirPapel('admin'), async (req, res) => {
  const v = regras.validarPedido(req.body);
  if (v.erro) return res.status(400).json({ erro: v.erro });
  try {
    const ativos = await parceirosAtivos(v.dados.servico);
    const parceiroId = Number((req.body || {}).parceiro_id);
    // O cliente aceitou o termo vendo o nome de UM parceiro (o da prévia): o pedido vai para ele, nunca
    // para outro que o rodízio escolheria agora.
    const parceiro = ativos.find((p) => p.id === parceiroId) || null;
    if (ativos.length && !parceiro) {
      return res.status(409).json({ erro: 'O parceiro da prévia mudou, surgiu agora ou não está mais disponível. Abra o pedido de novo para conferir os dados.' });
    }
    if (parceiro && !regras.aceiteValido(v.dados.aceite)) {
      return res.status(400).json({ erro: 'Aceite o termo de vínculo para enviar o pedido ao parceiro.' });
    }
    const r = await prepararDados(req, v.dados);
    if (r.erro) return res.status(r.status).json({ erro: r.erro });

    // Mesmo serviço e mesma licitação já em aberto: duplo clique ou pedido repetido não manda o e-mail duas vezes.
    // Com parceiro, um interesse antigo não conta: este pedido o substitui (vira "cancelado" mais abaixo).
    const [[repetido]] = await pool.query(
      `SELECT id FROM servico_pedidos WHERE organizacao_id = ? AND servico = ? AND licitacao_id <=> ?
          AND status IN (?) LIMIT 1`,
      [req.organizacaoId, v.dados.servico, v.dados.licitacaoId, regras.ABERTOS.filter((e) => !parceiro || e !== 'interesse')]
    );
    if (repetido) {
      return res.status(409).json({ erro: 'Já existe um pedido em aberto para este serviço e esta licitação. Veja em "Seus pedidos".' });
    }

    const agora = new Date();
    // Com parceiro e aceite o pedido já nasce "solicitado": se algo falhar antes do envio, a
    // operadora ainda consegue reenviar (um pedido "interesse" com parceiro ficaria preso).
    const [ins] = await pool.query(
      `INSERT INTO servico_pedidos (organizacao_id, usuario_id, servico, parceiro_id, licitacao_id, status, mensagem,
                                    dados_enviados, termo_versao, consentimento_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.organizacaoId, req.usuario.id, v.dados.servico, parceiro ? parceiro.id : null, v.dados.licitacaoId,
        parceiro ? 'solicitado' : 'interesse', v.dados.mensagem, parceiro ? JSON.stringify(r.dados) : null,
        parceiro ? regras.VERSAO_TERMO_PARCEIRO : null, parceiro ? agora : null,
      ]
    );
    const pedido = { id: ins.insertId, servico: v.dados.servico, criado_em: agora, termo_versao: regras.VERSAO_TERMO_PARCEIRO };

    let enviado = false;
    if (parceiro) {
      const envio = await email.enviarTransacional(regras.montarEmail({ pedido, parceiro, dados: r.dados }));
      enviado = envio.enviado;
      if (enviado) {
        await pool.query(
          "UPDATE servico_pedidos SET status = 'encaminhado', encaminhado_em = ? WHERE id = ? AND organizacao_id = ?",
          [agora, pedido.id, req.organizacaoId]
        );
      }
      // O interesse que a organização deixou antes foi substituído por este pedido de verdade.
      await pool.query(
        "UPDATE servico_pedidos SET status = 'cancelado' WHERE organizacao_id = ? AND servico = ? AND status = 'interesse' AND id <> ?",
        [req.organizacaoId, v.dados.servico, pedido.id]
      );
    }
    const status = regras.statusInicial({ temParceiro: Boolean(parceiro), emailEnviado: enviado });
    res.status(201).json({
      id: pedido.id,
      protocolo: regras.protocolo(pedido.id, agora),
      status,
      mensagem: {
        interesse: 'Ainda não há parceiro habilitado para este serviço. Seu interesse ficou registrado e nada foi enviado a ninguém.',
        encaminhado: `Pedido enviado a ${parceiro && parceiro.nome}. Ele responde direto ao seu e-mail.`,
        solicitado: 'Pedido registrado, mas o e-mail ao parceiro ainda não saiu. A equipe do painel vai reenviar.',
      }[status],
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível registrar o pedido agora.', erro);
  }
});

// POST /api/servicos/pedidos/:id/cancelar
rotas.post('/pedidos/:id/cancelar', exigirPapel('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id) || 0;
    const [r] = await pool.query(
      "UPDATE servico_pedidos SET status = 'cancelado' WHERE id = ? AND organizacao_id = ? AND status IN (?)",
      [id, req.organizacaoId, regras.ABERTOS]
    );
    if (r.affectedRows) return res.json({ ok: true });
    // Nenhuma linha mudou: ou o pedido não é desta organização (404), ou já não dá para cancelar (409).
    const [[p]] = await pool.query('SELECT status FROM servico_pedidos WHERE id = ? AND organizacao_id = ?', [id, req.organizacaoId]);
    if (!p) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    res.status(409).json({ erro: `Um pedido "${regras.STATUS[p.status]}" não pode mais ser cancelado.` });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível cancelar o pedido.', erro);
  }
});

module.exports = rotas;
