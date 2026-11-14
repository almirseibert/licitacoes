// Job `prazos_questionamento` (seções 14 e 25) — calcula o limite de
// esclarecimento e impugnação e avisa antes de vencer.
//
// Diário, 08h. Depois de vencido esse prazo, exigência restritiva já não se
// discute: só resta não disputar. É por isso que o aviso sai cedo.
const pool = require('../config/db');
const escopo = require('../servicos/escopo');
const fila = require('../servicos/fila');
const alertas = require('../servicos/alertas');
const feriados = require('../servicos/feriados');
const regras = require('../regras/prazos');

// Só vale a pena calcular (e avisar) o que você tem chance de disputar.
const PONTUACAO_MINIMA = 55;

function resumir(texto, tamanho = 90) {
  if (!texto) return 'licitação sem objeto';
  const limpo = String(texto).replace(/\s+/g, ' ').trim();
  return limpo.length > tamanho ? `${limpo.slice(0, tamanho)}…` : limpo;
}

/**
 * Recalcula o prazo das licitações abertas que interessam.
 *
 * Em lote, com os feriados lidos uma vez só: são 1.400 licitações e ler a
 * tabela de feriados por licitação seria 1.400 consultas para o mesmo dado.
 */
async function calcularPrazos({ pontuacaoMinima = PONTUACAO_MINIMA, limite = 2000 } = {}) {
  // Garante que os feriados dos anos em jogo estão na base antes de contar.
  await feriados.garantirAnos({}).catch(() => []);
  const lista = await feriados.listar({});

  const [licitacoes] = await pool.query(
    `SELECT id, abertura_propostas, uf, municipio
       FROM ${escopo.agregadoDasOrganizacoes()} l
      WHERE descartada = 0
        AND abertura_propostas IS NOT NULL
        AND (pontuacao >= ? OR favorito = 1 OR em_disputa = 1)
        AND (fim_propostas IS NULL OR fim_propostas >= DATE_SUB(NOW(), INTERVAL 7 DAY))
      LIMIT ?`,
    [pontuacaoMinima, limite]
  );

  let calculados = 0;
  let semAbertura = 0;

  for (const l of licitacoes) {
    const prazo = regras.prazoQuestionamento({
      abertura: l.abertura_propostas,
      uf: l.uf,
      municipio: l.municipio,
      feriados: lista,
    });
    if (!prazo) {
      semAbertura += 1;
      continue;
    }
    await pool.query('UPDATE licitacoes SET prazo_questionamento = ? WHERE id = ?', [prazo.limite, l.id]);
    calculados += 1;
  }

  return { avaliadas: licitacoes.length, calculados, sem_abertura: semAbertura, feriados: lista.length };
}

/**
 * Avisa o que vence em menos de 24 h (seção 25.2) — o selo âmbar do Radar,
 * com o aviso correspondente no sino.
 */
async function avisarPrazos({ pontuacaoMinima = PONTUACAO_MINIMA } = {}) {
  const [linhas] = await pool.query(
    `SELECT id, organizacao_id, objeto, orgao_nome, prazo_questionamento, abertura_propostas
       FROM ${escopo.porOrganizacao()} l
      WHERE descartada = 0
        AND prazo_questionamento IS NOT NULL
        AND prazo_questionamento > NOW()
        AND prazo_questionamento <= DATE_ADD(NOW(), INTERVAL 24 HOUR)
        AND (pontuacao >= ? OR favorito = 1 OR etapa <> 'Triagem')`,
    [pontuacaoMinima]
  );

  let criados = 0;
  for (const l of linhas) {
    const criado = await alertas.criar({
      organizacaoId: l.organizacao_id,
      tipo: 'prazo_questionamento',
      nivel: 'atencao',
      chave: `prazo_questionamento:${l.id}`,
      licitacaoId: l.id,
      quando: l.prazo_questionamento,
      mensagem:
        'Último dia para pedir esclarecimento ou impugnar: ' +
        `${resumir(l.objeto)} — ${l.orgao_nome || 'órgão não informado'}. ` +
        'Depois disso, exigência restritiva não se discute mais.',
    });
    if (criado) criados += 1;
  }
  return { vencendo: linhas.length, criados };
}

async function rodar(payload = {}) {
  const calculo = await calcularPrazos(payload);
  const avisos = await avisarPrazos(payload);
  return { ...calculo, ...avisos };
}

function registrarNaFila() {
  fila.registrar('prazos_questionamento', (payload) => rodar(payload || {}));
}

module.exports = { calcularPrazos, avisarPrazos, rodar, registrarNaFila, PONTUACAO_MINIMA };
