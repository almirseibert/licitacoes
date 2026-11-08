// Checklist de exigências da licitação (seções 8.4 e 13).
//
// Montado em três colunas: a exigência, o que o edital pede (com o trecho que
// gerou a decisão) e o que a empresa tem. A terceira coluna só responde o que
// dá para saber hoje — o cofre de documentos entra na Fase 5.
const express = require('express');
const { responderErro } = require('../middlewares/responder-erro');
const pool = require('../config/db');
const fila = require('../servicos/fila');
const { CATALOGO, PORCODIGO } = require('../regras/exigencias');

const rotas = express.Router({ mergeParams: true });

const DETECCOES = ['sim', 'nao', 'negado', 'indefinido'];

/**
 * O que a empresa já atende, com o que o painel sabe hoje.
 * Devolve { situacao: 'tem'|'nao_tem'|'depende'|'desconhecido', nota }.
 */
function atendimento(codigo, { licitacao, perfil }) {
  if (codigo === 'objeto_social') {
    if (licitacao.objeto_social === 'coberto') return { situacao: 'tem', nota: licitacao.objeto_social_motivo };
    if (licitacao.objeto_social === 'parcial') return { situacao: 'depende', nota: licitacao.objeto_social_motivo };
    if (licitacao.objeto_social === 'fora') return { situacao: 'nao_tem', nota: licitacao.objeto_social_motivo };
    return { situacao: 'desconhecido', nota: null };
  }

  if (codigo === 'simples') {
    return perfil && perfil.regime === 'Simples Nacional'
      ? { situacao: 'tem', nota: 'a empresa é optante' }
      : { situacao: 'desconhecido', nota: null };
  }

  if (codigo === 'exclusivo_me') {
    return perfil && ['ME', 'EPP'].includes(perfil.natureza)
      ? { situacao: 'tem', nota: `a empresa é ${perfil.natureza}` }
      : { situacao: 'desconhecido', nota: null };
  }

  if (codigo === 'pl_minimo' && perfil && perfil.capital_social) {
    const exigido = Number(licitacao.valor_estimado || 0) * 0.1; // teto legal: 10% do estimado
    const capital = Number(perfil.capital_social);
    if (!exigido) return { situacao: 'desconhecido', nota: `capital social de R$ ${capital.toLocaleString('pt-BR')}` };
    return capital >= exigido
      ? { situacao: 'tem', nota: `capital de R$ ${capital.toLocaleString('pt-BR')} cobre os 10% do estimado` }
      : {
          situacao: 'nao_tem',
          nota: `capital de R$ ${capital.toLocaleString('pt-BR')} abaixo dos 10% do valor estimado (R$ ${exigido.toLocaleString('pt-BR', { maximumFractionDigits: 0 })})`,
        };
  }

  return { situacao: 'desconhecido', nota: null };
}

rotas.get('/', async (req, res) => {
  try {
    const [[licitacao]] = await pool.query(
      `SELECT id, objeto_social, objeto_social_motivo, valor_estimado,
              exigencias_status, exigencias_em, arquivos_status
         FROM licitacoes WHERE id = ?`,
      [req.params.id]
    );
    if (!licitacao) return res.status(404).json({ erro: 'Licitação não encontrada.' });

    const [[perfil]] = await pool.query(
      'SELECT natureza, regime, capital_social FROM empresa_perfis ORDER BY padrao DESC, id ASC LIMIT 1'
    );

    const [detectadas] = await pool.query(
      `SELECT e.codigo, e.detectado, e.trecho, e.pagina, e.confirmado_por_usuario,
              a.nome_arquivo
         FROM licitacao_exigencias e
         LEFT JOIN licitacao_arquivos a ON a.id = e.arquivo_id
        WHERE e.licitacao_id = ?`,
      [req.params.id]
    );
    const porCodigo = new Map(detectadas.map((d) => [d.codigo, d]));

    const dados = CATALOGO.map((item) => {
      const achado = porCodigo.get(item.codigo) || { detectado: 'indefinido' };
      return {
        codigo: item.codigo,
        rotulo: item.rotulo,
        grupo: item.grupo,
        detectado: achado.detectado,
        trecho: achado.trecho || null,
        pagina: achado.pagina || null,
        arquivo: achado.nome_arquivo || null,
        confirmado_por_usuario: Boolean(achado.confirmado_por_usuario),
        ...atendimento(item.codigo, { licitacao, perfil }),
      };
    });

    const exigidas = dados.filter((d) => d.detectado === 'sim');
    res.json({
      status: licitacao.exigencias_status,
      lido_em: licitacao.exigencias_em,
      arquivos_status: licitacao.arquivos_status,
      exigidas: exigidas.length,
      atendidas: exigidas.filter((d) => d.situacao === 'tem').length,
      dispensadas: dados.filter((d) => d.detectado === 'negado').length,
      dados,
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível montar o checklist.', erro);
  }
});

// POST /api/licitacoes/:id/exigencias/:codigo — correção manual (seção 13).
// O que o usuário confirma passa a ser a verdade: a leitura seguinte não mexe.
rotas.post('/:codigo', async (req, res) => {
  try {
    const { codigo } = req.params;
    if (!PORCODIGO.has(codigo)) return res.status(400).json({ erro: `Exigência desconhecida: "${codigo}".` });

    const detectado = String((req.body && req.body.detectado) || '');
    if (!DETECCOES.includes(detectado)) {
      return res.status(400).json({ erro: `Use um de: ${DETECCOES.join(', ')}.` });
    }

    await pool.query(
      `INSERT INTO licitacao_exigencias (licitacao_id, codigo, detectado, confirmado_por_usuario)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE detectado = VALUES(detectado), confirmado_por_usuario = 1`,
      [req.params.id, codigo, detectado]
    );
    res.json({ ok: true, mensagem: 'Anotado. A leitura automática não mexe mais nesta linha.' });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível salvar a correção.', erro);
  }
});

// POST /api/licitacoes/:id/exigencias/:codigo/soltar — devolve a linha à leitura automática.
rotas.post('/:codigo/soltar', async (req, res) => {
  try {
    await pool.query(
      'UPDATE licitacao_exigencias SET confirmado_por_usuario = 0 WHERE licitacao_id = ? AND codigo = ?',
      [req.params.id, req.params.codigo]
    );
    res.json({ ok: true, mensagem: 'Linha volta a seguir a leitura do edital.' });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível soltar a linha.', erro);
  }
});

module.exports = rotas;
module.exports.enfileirarLeitura = async (licitacaoId) => {
  await fila.enfileirar('ler_edital', { licitacaoId: Number(licitacaoId) }, { prioridade: 1, chaveUnica: `ler:${licitacaoId}` });
};
