// Compatibilidade com o objeto social (seção 6.2).
//
// O pregoeiro confere o objeto licitado contra o cartão CNPJ. O painel faz essa
// conferência antes: cada CNAE do perfil tem uma lista de palavras de cobertura,
// e o objeto normalizado é comparado com elas.
//
// Três estados, sempre com o motivo visível no card:
//   coberto  — um CNAE cobre claramente (casou no início do objeto ou em 2+ termos)
//   parcial  — casou de raspão, um termo só, no meio do texto
//   fora     — nenhum CNAE cobre; penaliza 40 pontos
const { normalizar } = require('./texto');

const INICIO_DO_OBJETO = 150; // o PNCP não traz título separado

/**
 * @param {string} objeto  texto do objeto da licitação
 * @param {Array}  cnaes   [{ codigo, descricao, cobertura: ['software', ...] }]
 * @returns {{ estado:'coberto'|'parcial'|'fora'|null, cnae:string|null, motivo:string|null,
 *             termos:string[] }}
 */
function avaliar(objeto, cnaes) {
  const texto = normalizar(objeto);
  if (!texto || !Array.isArray(cnaes) || !cnaes.length) {
    return { estado: null, cnae: null, motivo: null, termos: [] };
  }

  const inicio = texto.slice(0, INICIO_DO_OBJETO);
  let melhor = null;

  for (const cnae of cnaes) {
    const cobertura = Array.isArray(cnae.cobertura) ? cnae.cobertura : [];
    const casados = [];
    let noInicio = false;

    for (const termo of cobertura) {
      const t = normalizar(termo);
      if (!t || !texto.includes(t)) continue;
      casados.push(termo);
      if (inicio.includes(t)) noInicio = true;
    }

    if (!casados.length) continue;
    const forte = noInicio || casados.length >= 2;
    const candidato = { cnae, casados, noInicio, forte };

    if (!melhor || (forte && !melhor.forte) || (forte === melhor.forte && casados.length > melhor.casados.length)) {
      melhor = candidato;
    }
  }

  if (!melhor) {
    return {
      estado: 'fora',
      cnae: null,
      motivo: 'seu objeto social não cobre este objeto — avalie incluir o CNAE correspondente',
      termos: [],
    };
  }

  const codigo = melhor.cnae.codigo;
  if (melhor.forte) {
    return {
      estado: 'coberto',
      cnae: codigo,
      motivo: `CNAE ${codigo} cobre: ${melhor.casados.slice(0, 3).join(', ')}`,
      termos: melhor.casados,
    };
  }

  return {
    estado: 'parcial',
    cnae: codigo,
    motivo: `CNAE ${codigo} cobre só em parte ("${melhor.casados[0]}") — confira o restante do objeto`,
    termos: melhor.casados,
  };
}

/**
 * Decisão de participação (seção 6.1) na parte que a Fase 2 consegue responder.
 * Atestado, conselho e capital entram quando o edital for lido (Fase 4).
 */
function podeParticipar({ estado, motivo }) {
  if (estado === 'fora') return { pode: 'Não', motivo: motivo || 'objeto fora do objeto social' };
  if (estado === 'parcial') return { pode: 'Depende', motivo: motivo || 'objeto social cobre parcialmente' };
  if (estado === 'coberto') return { pode: 'Sim', motivo: motivo };
  return { pode: 'Depende', motivo: 'perfil da empresa sem CNAEs cadastrados' };
}

module.exports = { avaliar, podeParticipar, INICIO_DO_OBJETO };
