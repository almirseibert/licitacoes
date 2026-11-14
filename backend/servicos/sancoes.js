// CEIS e CNEP pelo Portal da Transparência (seção 26.3).
//
// Dois usos, e os dois valem dinheiro:
//   1. checar o próprio CNPJ uma vez por mês — se algo aparecer indevidamente,
//      melhor descobrir antes de ser inabilitado;
//   2. checar o vencedor quando se fica em segundo lugar — empresa impedida de
//      licitar que vence abre caminho para recurso, e aqui fica a evidência
//      com data da consulta.
//
// A API limita requisições por minuto, então nada é varrido em massa: consulta
// sob demanda, resultado guardado por 30 dias.
const pool = require('../config/db');
const { buscarJson, ErroHttp } = require('./http');
const { sancoes: cfg } = require('../config/ambiente');

const BASE = 'https://api.portaldatransparencia.gov.br/api-de-dados';

// Dias de validade do cache, como manda a seção 26.3.
const VALIDADE_DIAS = 30;

const FONTES = {
  ceis: {
    caminho: '/ceis',
    rotulo: 'CEIS — empresas inidôneas e suspensas',
  },
  cnep: {
    caminho: '/cnep',
    rotulo: 'CNEP — empresas punidas',
  },
};

function disponivel() {
  return Boolean(cfg.chave);
}

function soDigitos(cnpj) {
  return String(cnpj || '').replace(/\D/g, '');
}

/**
 * Resume um registro de sanção no que interessa para decidir: quem aplicou,
 * que tipo, e até quando.
 *
 * A API muda nomes de campo de tempos em tempos — a própria spec avisa para
 * conferir no Swagger. Por isso cada campo é lido de uma lista de nomes
 * possíveis, e o registro cru fica guardado junto: se o resumo sair vazio, o
 * dado não se perdeu.
 */
function resumir(registro) {
  const pegar = (...caminhos) => {
    for (const caminho of caminhos) {
      const valor = caminho.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), registro);
      if (valor !== undefined && valor !== null && valor !== '') return valor;
    }
    return null;
  };

  return {
    tipo: pegar('tipoSancao.descricaoResumida', 'tipoSancao.descricaoPortal', 'tipoSancao'),
    orgao: pegar('orgaoSancionador.nome', 'orgaoSancionador.razaoSocial', 'orgaoSancionador'),
    inicio: pegar('dataInicioSancao', 'dataPublicacaoSancao'),
    fim: pegar('dataFimSancao'),
    fundamentacao: pegar('fundamentacao.0.descricao', 'textoPublicacao'),
    bruto: registro,
  };
}

async function doCache(cnpj, fonte) {
  const [[linha]] = await pool.query(
    `SELECT * FROM sancoes_consultas
      WHERE cnpj = ? AND fonte = ? AND consultado_em >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [cnpj, fonte, VALIDADE_DIAS]
  );
  if (!linha) return null;
  return {
    ...linha,
    registros: typeof linha.registros === 'string' ? JSON.parse(linha.registros || '[]') : linha.registros || [],
  };
}

/** Consulta uma fonte para um CNPJ, com cache de 30 dias. */
async function consultarFonte(cnpj, fonte, { forcar = false } = {}) {
  const limpo = soDigitos(cnpj);
  if (limpo.length !== 14) throw new Error('CNPJ inválido para consulta de sanções.');

  if (!forcar) {
    const guardado = await doCache(limpo, fonte);
    if (guardado) {
      return {
        fonte,
        encontrado: Boolean(guardado.encontrado),
        registros: guardado.registros,
        consultado_em: guardado.consultado_em,
        cache: true,
        erro: guardado.erro,
      };
    }
  }

  const { caminho } = FONTES[fonte];
  let registros = [];
  let erro = null;

  try {
    const dados = await buscarJson(`${BASE}${caminho}?cnpjSancionado=${limpo}&pagina=1`, {
      cabecalhos: { 'chave-api-dados': cfg.chave, Accept: 'application/json' },
    });
    const lista = Array.isArray(dados) ? dados : (dados && dados.content) || [];
    registros = lista.map(resumir);
  } catch (e) {
    // 429 é limite de requisição, não ausência de sanção. Guardar "nada
    // encontrado" aqui seria gravar uma mentira com data — então o erro é
    // registrado como erro e a consulta pode ser refeita.
    erro =
      e instanceof ErroHttp && e.status === 429
        ? 'o Portal da Transparência recusou por excesso de consultas; tente de novo em alguns minutos'
        : e.message;
  }

  await pool.query(
    `INSERT INTO sancoes_consultas (cnpj, fonte, encontrado, registros, erro, consultado_em)
     VALUES (?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       encontrado = VALUES(encontrado), registros = VALUES(registros),
       erro = VALUES(erro), consultado_em = NOW()`,
    [limpo, fonte, erro ? 0 : registros.length ? 1 : 0, JSON.stringify(registros), erro]
  );

  return { fonte, encontrado: !erro && registros.length > 0, registros, consultado_em: new Date(), cache: false, erro };
}

/**
 * CEIS e CNEP de um CNPJ, e o veredito.
 * Sem chave configurada diz isso, em vez de devolver "nada encontrado" — que
 * é a resposta que faria alguém disputar confiando num dado que não existe.
 */
async function consultar(cnpj, { forcar = false } = {}) {
  const limpo = soDigitos(cnpj);
  if (!disponivel()) {
    return {
      cnpj: limpo,
      disponivel: false,
      motivo:
        'Consulta de sanções desligada: falta PORTAL_TRANSPARENCIA_CHAVE. ' +
        'A chave é gratuita, pelo cadastro no gov.br.',
    };
  }

  const resultados = [];
  for (const fonte of Object.keys(FONTES)) {
    resultados.push(await consultarFonte(limpo, fonte, { forcar }));
  }

  const comErro = resultados.filter((r) => r.erro);
  const sancionado = resultados.some((r) => r.encontrado);

  // Reflete no dossiê, quando o concorrente já existe lá.
  if (!comErro.length) {
    await pool.query(
      `UPDATE concorrentes
          SET sancionado = ?, sancoes = ?, sancoes_checado_em = NOW()
        WHERE cnpj = ?`,
      [sancionado ? 1 : 0, JSON.stringify(resultados.flatMap((r) => r.registros)), limpo]
    );
  }

  return {
    cnpj: limpo,
    disponivel: true,
    sancionado,
    fontes: resultados.map((r) => ({
      fonte: r.fonte,
      rotulo: FONTES[r.fonte].rotulo,
      encontrado: r.encontrado,
      registros: r.registros,
      consultado_em: r.consultado_em,
      cache: r.cache,
      erro: r.erro,
    })),
    // A frase que a tela mostra: sem data da consulta, "nenhuma sanção" não
    // significa nada.
    resumo: comErro.length
      ? `Não foi possível concluir a consulta: ${comErro.map((r) => r.erro).join('; ')}`
      : sancionado
        ? 'Há registro em CEIS ou CNEP — confira as datas de vigência antes de concluir.'
        : `Nenhuma sanção registrada em CEIS/CNEP (consulta de ${new Date(resultados[0].consultado_em).toLocaleDateString('pt-BR')}).`,
  };
}

/** O próprio CNPJ, uma vez por mês (seção 26.3, uso 1). */
async function checarPropriaEmpresa(organizacaoId) {
  const perfil = require('./perfil');
  const cnpj = await perfil.cnpjDaEmpresa(organizacaoId);
  if (!cnpj) return { ok: false, motivo: 'O perfil da empresa ainda não tem CNPJ.' };
  return { ok: true, ...(await consultar(cnpj)) };
}

module.exports = { consultar, consultarFonte, checarPropriaEmpresa, disponivel, VALIDADE_DIAS, FONTES };
