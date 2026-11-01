// Motor de aderência — pontuação 0 a 100 (seção 6).
// Roda logo após a coleta, antes de o card aparecer no Radar.
//
// Fase 1: os pesos ficam nesta constante PESOS.
// Fase 2: os mesmos pesos passam para a tabela `regras_pontuacao` e esta função
// recebe o objeto já lido do banco — por isso `pontuar()` aceita `pesos` como
// parâmetro e nunca lê configuração por conta própria.
const { normalizar } = require('./texto');

const PESOS = {
  // 1. Palavra-chave (0-40) — casar no título vale o dobro de casar no corpo
  palavra_max: 40,
  palavra_titulo_multiplicador: 2,
  titulo_caracteres: 150, // o PNCP não traz título separado: usamos o início do objeto

  // 2. Valor (0-20)
  valor_ate_5k: 6,
  valor_5k_80k: 20, // faixa da exclusividade ME/EPP — art. 48, I
  valor_80k_200k: 12,
  valor_acima_200k: 4,

  // 3. Modalidade (0-15)
  modalidade: {
    dispensa: 15,
    pregao_eletronico: 12,
    credenciamento: 10,
    concorrencia: 5,
    pregao_presencial: 3,
    outra: 5,
  },

  // 4. Benefício ME/EPP (0-10)
  beneficio_exclusivo: 10,
  beneficio_cota: 6,
  beneficio_nenhum: 0,

  // 5. Localização (0-10)
  uf_casa: 10,
  uf_vizinhas: 6,
  uf_demais: 4,
  visita_fora_do_estado: -15,
  uf_empresa: 'RS',
  ufs_vizinhas: ['SC', 'PR'],

  // 6. Prazo (0-5)
  prazo_mais_7d: 5,
  prazo_3a7d: 3,
  prazo_menos_3d: 1,

  // 7. Penalidades
  palavra_excluida: -40,
  objeto_social_fora: -40,
  objeto_social_parcial: -10,
  orcamento_sigiloso: -5,
  sem_atestado: -8,
  sem_conselho: -20,
  capital_insuficiente: -25,
  garantia_proposta: -5,
};

function faixaDeValor(valor, pesos) {
  if (valor === null || valor === undefined || valor <= 0) return { pontos: 0, motivo: 'valor não informado' };
  if (valor < 5000) return { pontos: pesos.valor_ate_5k, motivo: 'abaixo de R$ 5 mil' };
  if (valor <= 80000) return { pontos: pesos.valor_5k_80k, motivo: 'R$ 5 mil a R$ 80 mil (faixa ME/EPP)' };
  if (valor <= 200000) return { pontos: pesos.valor_80k_200k, motivo: 'R$ 80 mil a R$ 200 mil' };
  return { pontos: pesos.valor_acima_200k, motivo: 'acima de R$ 200 mil' };
}

function chaveDaModalidade(modalidade) {
  const m = normalizar(modalidade);
  if (!m) return 'outra';
  if (m.includes('dispensa')) return 'dispensa';
  if (m.includes('pregao') && m.includes('presencial')) return 'pregao_presencial';
  if (m.includes('pregao')) return 'pregao_eletronico';
  if (m.includes('credenciamento') || m.includes('chamada publica') || m.includes('chamamento')) return 'credenciamento';
  if (m.includes('concorrencia')) return 'concorrencia';
  if (m.includes('inexigibilidade')) return 'dispensa';
  return 'outra';
}

function diasAteOFim(fimPropostas, agora = new Date()) {
  if (!fimPropostas) return null;
  const fim = fimPropostas instanceof Date ? fimPropostas : new Date(fimPropostas);
  if (Number.isNaN(fim.getTime())) return null;
  return (fim.getTime() - agora.getTime()) / 86400000;
}

/**
 * Calcula a pontuação de aderência de uma licitação.
 *
 * @param {object} licitacao  registro normalizado pelo adaptador
 * @param {object} contexto
 *   - palavras: [{ termo, peso, grupo }] palavras-chave ativas
 *   - palavrasExcluidas: ['merenda', ...]
 *   - pesos: substitui PESOS (Fase 2, vindo de `regras_pontuacao`)
 *   - agora: Date, para teste
 * @returns {{ pontuacao:number, grupo:string|null, palavra:string|null,
 *             beneficio_me:string|null, encerrada:boolean, excluida:boolean,
 *             detalhe:Array<{regra:string, pontos:number, motivo:string}> }}
 */
function pontuar(licitacao, contexto = {}) {
  const pesos = { ...PESOS, ...(contexto.pesos || {}) };
  const palavras = contexto.palavras || [];
  const excluidas = contexto.palavrasExcluidas || [];
  const agora = contexto.agora || new Date();

  const objeto = normalizar(licitacao.objeto);
  const titulo = objeto.slice(0, pesos.titulo_caracteres);
  const detalhe = [];
  let total = 0;

  function somar(regra, pontos, motivo) {
    if (!pontos) return;
    total += pontos;
    detalhe.push({ regra, pontos, motivo });
  }

  // 1. Palavra-chave (0-40)
  let melhor = null;
  for (const palavra of palavras) {
    const termo = normalizar(palavra.termo);
    if (!termo || !objeto.includes(termo)) continue;
    const noTitulo = titulo.includes(termo);
    const pontos = Math.min(
      pesos.palavra_max,
      (palavra.peso || 10) * (noTitulo ? pesos.palavra_titulo_multiplicador : 1)
    );
    if (!melhor || pontos > melhor.pontos) {
      melhor = { pontos, termo: palavra.termo, grupo: palavra.grupo, noTitulo };
    }
  }
  if (melhor) {
    somar('palavra_chave', melhor.pontos, `"${melhor.termo}"${melhor.noTitulo ? ' no início do objeto' : ' no corpo do objeto'}`);
  }

  // 2. Valor (0-20)
  const valor = faixaDeValor(licitacao.valor_estimado, pesos);
  somar('valor', valor.pontos, valor.motivo);

  // 3. Modalidade (0-15)
  const chaveModalidade = chaveDaModalidade(licitacao.modalidade);
  somar('modalidade', pesos.modalidade[chaveModalidade] || 0, licitacao.modalidade || 'não informada');

  // 4. Benefício ME/EPP (0-10)
  const beneficios = (licitacao.beneficios_itens || []).map(normalizar);
  let beneficioMe = null;
  if (beneficios.some((b) => b.includes('exclusiv'))) {
    beneficioMe = 'exclusivo';
    somar('beneficio_me', pesos.beneficio_exclusivo, 'item exclusivo para ME/EPP (art. 48, I)');
  } else if (beneficios.some((b) => b.includes('cota'))) {
    beneficioMe = 'cota';
    somar('beneficio_me', pesos.beneficio_cota, 'cota reservada a ME/EPP (art. 48, III)');
  } else if (beneficios.length) {
    beneficioMe = 'nenhum';
  }

  // 5. Localização (0-10)
  const uf = String(licitacao.uf || '').toUpperCase();
  if (uf === pesos.uf_empresa) somar('localizacao', pesos.uf_casa, `${uf} — estado da empresa`);
  else if (pesos.ufs_vizinhas.includes(uf)) somar('localizacao', pesos.uf_vizinhas, `${uf} — estado vizinho`);
  else if (uf) somar('localizacao', pesos.uf_demais, `${uf} — disputa eletrônica`);

  // 6. Prazo (0-5)
  const dias = diasAteOFim(licitacao.fim_propostas, agora);
  let encerrada = false;
  if (dias === null) {
    somar('prazo', 0, 'prazo não informado');
  } else if (dias < 0) {
    encerrada = true;
    detalhe.push({ regra: 'prazo', pontos: 0, motivo: 'propostas já encerradas' });
  } else if (dias > 7) {
    somar('prazo', pesos.prazo_mais_7d, 'mais de 7 dias até o fim');
  } else if (dias >= 3) {
    somar('prazo', pesos.prazo_3a7d, `${Math.floor(dias)} dias até o fim`);
  } else {
    somar('prazo', pesos.prazo_menos_3d, 'menos de 3 dias até o fim');
  }

  // 7. Penalidades
  const excluidaEncontrada = excluidas.find((termo) => {
    const t = normalizar(termo);
    return t && objeto.includes(t);
  });
  if (excluidaEncontrada) {
    somar('palavra_excluida', pesos.palavra_excluida, `palavra excluída: "${excluidaEncontrada}"`);
  }

  if (licitacao.objeto_social === 'fora') somar('objeto_social', pesos.objeto_social_fora, 'objeto social não cobre o objeto');
  if (licitacao.objeto_social === 'parcial') somar('objeto_social', pesos.objeto_social_parcial, 'objeto social cobre parcialmente');
  if (licitacao.orcamento_sigiloso) somar('orcamento_sigiloso', pesos.orcamento_sigiloso, 'orçamento sigiloso');

  const pontuacao = Math.max(0, Math.min(100, Math.round(total)));

  return {
    pontuacao,
    grupo: melhor ? melhor.grupo : null,
    palavra: melhor ? melhor.termo : null,
    beneficio_me: beneficioMe,
    encerrada,
    excluida: Boolean(excluidaEncontrada),
    detalhe,
  };
}

// Faixas da interface (seção 6)
function faixa(pontuacao) {
  if (pontuacao >= 80) return 'alta';
  if (pontuacao >= 55) return 'analisar';
  if (pontuacao >= 30) return 'talvez';
  return 'baixa';
}

module.exports = { pontuar, faixa, PESOS, chaveDaModalidade, diasAteOFim };
