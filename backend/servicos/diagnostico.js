// Diagnóstico de descarte (seção 20) — o que mais barrou a empresa, quanto isso
// custou e o que mudaria se o bloqueio fosse resolvido.
//
// A conta inteira sai de `licitacoes.motivo_descarte` e `codigo_barrou`. Nada
// aqui estima nem completa: bloqueio sem código vira linha "sem código
// informado", visível, porque esconder isso faria o ranking parecer mais
// confiável do que é.
const pool = require('../config/db');
const descarte = require('../regras/descarte');
const exigencias = require('../regras/exigencias');
const servicoPreco = require('./preco');

// Os períodos da tela, em dias. 90 dias é o padrão da seção 20.2.
const PERIODOS = [
  { dias: 90, rotulo: '90 dias' },
  { dias: 182, rotulo: '6 meses' },
  { dias: 365, rotulo: '12 meses' },
];

/**
 * O rótulo que a pessoa lê. Quando o bloqueio é um código do catálogo da seção
 * 8.2, o nome é o da exigência ("Atestado de capacidade técnica") — é assim que
 * a 20.2 escreve a tela. Quando é o motivo, é o rótulo do motivo.
 */
function rotularBloqueio({ motivo, codigo }) {
  if (codigo) {
    const exigencia = exigencias.PORCODIGO.get(codigo);
    return exigencia ? exigencia.rotulo : `Exigência ${codigo}`;
  }
  const m = descarte.POR_CHAVE.get(motivo);
  if (m && descarte.pedeCodigo(motivo)) return `${m.rotulo} (sem código informado)`;
  return m ? m.rotulo : motivo;
}

/**
 * A chave que agrupa o ranking: o código quando há um, o motivo quando não há.
 * Dois descartes por atestado em meses diferentes contam na mesma linha; dois
 * por "exigência" sem código também, e separados dos com código.
 */
function chaveBloqueio({ motivo_descarte: motivo, codigo_barrou: codigo }) {
  const comCodigo = descarte.pedeCodigo(motivo) && codigo ? codigo : null;
  return { chave: comCodigo ? `codigo:${comCodigo}` : `motivo:${motivo}`, motivo, codigo: comCodigo };
}

/**
 * Valor disputável: o estimado descontado da mediana do grupo e da família da
 * licitação (seção 12). Edital estimado em R$ 100 mil num grupo que fecha 23%
 * abaixo não é R$ 100 mil de contrato — é R$ 77 mil, e é esse número que serve
 * para decidir se vale aumentar capital.
 *
 * A referência é cacheada por grupo+modalidade: cada chamada ao serviço é uma
 * ida ao banco, e um período de 12 meses repete o mesmo par centenas de vezes.
 */
function montarDescontador() {
  const cache = new Map();
  return async function disputavelDe(licitacao) {
    const estimado = Number(licitacao.valor_estimado || 0);
    if (!estimado) return { disputavel: 0, temReferencia: false };

    const chave = `${licitacao.grupo || ''}|${licitacao.modalidade || ''}`;
    if (!cache.has(chave)) {
      cache.set(chave, await servicoPreco.referenciaPara(licitacao).catch(() => null));
    }
    const referencia = cache.get(chave);
    const mediano =
      referencia && referencia.desconto_mediano !== null && referencia.desconto_mediano !== undefined
        ? Number(referencia.desconto_mediano)
        : null;

    // Sem referência o painel não inventa desconto: o disputável fica igual ao
    // estimado e a tela diz que ali não houve desconto aplicado.
    if (mediano === null) return { disputavel: estimado, temReferencia: false };
    return { disputavel: estimado * (1 - mediano), temReferencia: true, desconto: mediano };
  };
}

function arredondar(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

/** A frase da simulação da seção 20.2, com os três números que ela cita. */
function simular(bloqueio) {
  return {
    chave: bloqueio.chave,
    codigo: bloqueio.codigo,
    rotulo: bloqueio.rotulo,
    licitacoes: bloqueio.licitacoes,
    valor: bloqueio.valor,
    disputavel: bloqueio.disputavel,
    // Nem toda licitação do grupo tinha mediana medida: a tela precisa dizer.
    parcial: bloqueio.com_referencia < bloqueio.licitacoes,
    resolver: bloqueio.resolver,
    custo_rotulo: bloqueio.custo_rotulo,
  };
}

/**
 * O ranking da seção 20.2 e a simulação que vem embaixo dele.
 *
 * `nao_analisada` fica fora do ranking (ninguém chegou a analisar, logo nada
 * barrou) e aparece em `nao_analisadas`, que conta a outra história: volume
 * demais chegando, ou corte mal calibrado (seção 20.4).
 */
async function diagnosticar({ dias = 90 } = {}) {
  const [linhas] = await pool.query(
    `SELECT id, objeto, orgao_nome, uf, grupo, modalidade, valor_estimado, pontuacao,
            motivo_descarte, codigo_barrou, descartado_em
       FROM licitacoes
      WHERE descartada = 1
        AND motivo_descarte IS NOT NULL
        AND descartado_em IS NOT NULL
        AND descartado_em >= DATE_SUB(NOW(), INTERVAL ? DAY)
      ORDER BY descartado_em DESC`,
    [dias]
  );

  const disputavelDe = montarDescontador();
  const naoAnalisadas = { licitacoes: 0, valor: 0 };
  const grupos = new Map();

  for (const licitacao of linhas) {
    const estimado = Number(licitacao.valor_estimado || 0);

    if (licitacao.motivo_descarte === descarte.NAO_ANALISADA.chave) {
      naoAnalisadas.licitacoes += 1;
      naoAnalisadas.valor += estimado;
      continue;
    }
    // Motivo que não está na lista fechada é resíduo de versão anterior: conta
    // no total de descartadas e fica fora do ranking, sem virar linha falsa.
    if (!descarte.existe(licitacao.motivo_descarte)) continue;

    const { chave, motivo, codigo } = chaveBloqueio(licitacao);
    if (!grupos.has(chave)) {
      grupos.set(chave, {
        chave,
        motivo,
        codigo,
        rotulo: rotularBloqueio({ motivo, codigo }),
        licitacoes: 0,
        valor: 0,
        disputavel: 0,
        com_referencia: 0,
        exemplos: [],
      });
    }

    const bloco = grupos.get(chave);
    const { disputavel, temReferencia } = await disputavelDe(licitacao);
    bloco.licitacoes += 1;
    bloco.valor += estimado;
    bloco.disputavel += disputavel;
    if (temReferencia) bloco.com_referencia += 1;
    if (bloco.exemplos.length < 5) {
      bloco.exemplos.push({
        id: licitacao.id,
        objeto: licitacao.objeto,
        orgao_nome: licitacao.orgao_nome,
        uf: licitacao.uf,
        valor_estimado: estimado,
        descartado_em: licitacao.descartado_em,
      });
    }
  }

  // Ordem do ranking: número de licitações primeiro, valor como desempate. A
  // seção 20.2 lista assim, e faz sentido — bloqueio que repete é hábito, e
  // hábito se resolve uma vez e vale para sempre.
  const bloqueios = [...grupos.values()]
    .sort((a, b) => b.licitacoes - a.licitacoes || b.valor - a.valor)
    .map((b, indice) => {
      const comoResolver = descarte.COMO_RESOLVER[b.codigo || b.motivo] || {};
      const custo = comoResolver.custo || 'desconhecido';
      return {
        ...b,
        posicao: indice + 1,
        valor: arredondar(b.valor),
        disputavel: arredondar(b.disputavel),
        resolver: comoResolver.resolver || null,
        custo,
        custo_rotulo: descarte.CUSTOS[custo],
        nota: comoResolver.nota || null,
        // Só o que é da empresa dá simulação: "se você tivesse o atestado" é uma
        // frase com sentido, "se você tivesse concorrência baixa" não é.
        simulavel: Boolean(b.codigo),
      };
    });

  const analisadas = bloqueios.reduce((soma, b) => soma + b.licitacoes, 0);

  return {
    periodo: {
      dias,
      rotulo: (PERIODOS.find((p) => p.dias === dias) || {}).rotulo || `${dias} dias`,
    },
    periodos: PERIODOS,
    bloqueios,
    simulacoes: bloqueios.filter((b) => b.simulavel).slice(0, 3).map(simular),
    nao_analisadas: {
      licitacoes: naoAnalisadas.licitacoes,
      valor: arredondar(naoAnalisadas.valor),
      // O recado da 20.4, escrito para quem lê a tela.
      recado:
        naoAnalisadas.licitacoes > analisadas
          ? 'Mais licitações venceram sem análise do que foram descartadas por um motivo. ' +
            'Isso costuma ser volume demais chegando ou corte de pontuação baixo demais — reveja as palavras-chave e o peso de valor.'
          : null,
    },
    total: {
      descartadas: naoAnalisadas.licitacoes + analisadas,
      analisadas,
      valor: arredondar(bloqueios.reduce((soma, b) => soma + b.valor, 0)),
    },
  };
}

module.exports = { diagnosticar, PERIODOS, rotularBloqueio, chaveBloqueio };
