// Filtros do Radar (seção 11.1 da spec e Seção 7 do plano SaaS).
//
// Uma função pura: recebe a query da tela e devolve o `WHERE` com os valores.
// A listagem, a exportação (xlsx e docx) e o link público usam a mesma — o que
// se exporta ou compartilha é exatamente o que está na tela.
//
// O que pede banco (as coordenadas do centro do raio) é resolvido antes, pela
// rota, e chega pronto em `contexto.centro`.

const REGIOES = {
  Norte: ['AC', 'AM', 'AP', 'PA', 'RO', 'RR', 'TO'],
  Nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
  'Centro-Oeste': ['DF', 'GO', 'MS', 'MT'],
  Sudeste: ['ES', 'MG', 'RJ', 'SP'],
  Sul: ['PR', 'RS', 'SC'],
};

const ESFERAS = ['Federal', 'Estadual', 'Municipal', 'Outra'];
const RAIO_MAXIMO_KM = 1000;

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Lista separada por vírgula, sem vazios. */
function lista(valor) {
  return String(valor || '').split(',').map((v) => v.trim()).filter(Boolean);
}

/** `%` e `_` digitados são texto, não curinga do LIKE. */
function comoLike(texto) {
  return `%${String(texto).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Separa a busca em frases exatas (entre aspas) e palavras soltas.
 *   'toner "cartucho original" hp' → { frases: ['cartucho original'], palavras: ['toner', 'hp'] }
 * Aspa sem par vale até o fim do texto.
 */
function lerBusca(busca) {
  const frases = [];
  const resto = String(busca || '').replace(/"([^"]*)("|$)/g, (_, frase) => {
    const limpa = frase.replace(/\s+/g, ' ').trim();
    if (limpa) frases.push(limpa);
    return ' ';
  });
  const palavras = resto.split(/\s+/).map((p) => p.trim()).filter(Boolean);
  return { frases, palavras };
}

/** UFs das regiões pedidas ("Sul,Sudeste"). Região desconhecida é ignorada. */
function ufsDasRegioes(valor) {
  return lista(valor).flatMap((r) => REGIOES[r] || []);
}

/**
 * Monta o WHERE do Radar.
 * @param {object} q — a query da tela
 * @param {object} contexto — { organizacaoId, centro: { latitude, longitude } | null }
 * @returns {{ onde: string, valores: any[], avisos: string[] }}
 */
function montarFiltros(q = {}, contexto = {}) {
  const onde = [];
  const valores = [];
  const avisos = [];

  if (q.incluir_descartadas !== '1') onde.push('l.descartada = 0');

  if (q.grupo) {
    onde.push('l.grupo = ?');
    valores.push(q.grupo);
  }
  const ufs = lista(q.uf).map((u) => u.toUpperCase());
  if (ufs.length) {
    onde.push(`l.uf IN (${ufs.map(() => '?').join(',')})`);
    valores.push(...ufs);
  }
  if (q.regiao) {
    const daRegiao = ufsDasRegioes(q.regiao);
    // Região que não existe não pode virar "sem filtro": vira "nada".
    if (!daRegiao.length) onde.push('1 = 0');
    else {
      onde.push(`l.uf IN (${daRegiao.map(() => '?').join(',')})`);
      valores.push(...daRegiao);
    }
  }
  if (q.raio_km) {
    const raio = Number(q.raio_km);
    const centro = contexto.centro;
    if (!centro) avisos.push('Raio ignorado: escolha a cidade de partida (ou cadastre a da organização).');
    else if (Number.isFinite(raio) && raio > 0) {
      // Haversine sobre o catálogo de municípios. O nome casa pela colação do
      // banco (sem acento e sem caixa); licitação sem município fica de fora.
      onde.push(`EXISTS (SELECT 1 FROM municipios m
         WHERE m.uf = l.uf AND m.nome = l.municipio
           AND 6371 * ACOS(LEAST(1, COS(RADIANS(?)) * COS(RADIANS(m.latitude))
               * COS(RADIANS(m.longitude) - RADIANS(?)) + SIN(RADIANS(?)) * SIN(RADIANS(m.latitude)))) <= ?)`);
      valores.push(centro.latitude, centro.longitude, centro.latitude, Math.min(raio, RAIO_MAXIMO_KM));
    }
  }
  if (q.modalidade) {
    onde.push('l.modalidade LIKE ?');
    valores.push(comoLike(q.modalidade));
  }
  const esferas = lista(q.esfera).filter((e) => ESFERAS.includes(e));
  if (esferas.length) {
    onde.push(`l.esfera IN (${esferas.map(() => '?').join(',')})`);
    valores.push(...esferas);
  }
  if (q.situacao) {
    onde.push('l.situacao = ?');
    valores.push(q.situacao);
  }
  if (q.fonte_id) {
    onde.push('l.fonte_id = ?');
    valores.push(Number(q.fonte_id));
  }
  if (q.valor_min) {
    onde.push('l.valor_estimado >= ?');
    valores.push(Number(q.valor_min));
  }
  if (q.valor_max) {
    onde.push('l.valor_estimado <= ?');
    valores.push(Number(q.valor_max));
  }
  // Por padrão o Radar esconde a faixa "Baixa" (<30), conforme a seção 6.
  const pontuacaoMinima = q.pontuacao_min === undefined || q.pontuacao_min === '' ? 30 : Number(q.pontuacao_min);
  if (pontuacaoMinima > 0) {
    onde.push('l.pontuacao >= ?');
    valores.push(pontuacaoMinima);
  }
  if (q.prazo_dias) {
    onde.push('l.fim_propostas IS NOT NULL AND l.fim_propostas <= DATE_ADD(NOW(), INTERVAL ? DAY)');
    valores.push(Number(q.prazo_dias));
  }
  if (q.em_aberto === '1') {
    onde.push('(l.fim_propostas IS NULL OR l.fim_propostas >= NOW())');
  }
  // Datas da tela: dia inteiro, inclusive nas duas pontas.
  const intervalos = [['inclusao', 'l.criado_em'], ['prazo', 'l.fim_propostas']];
  for (const [nome, coluna] of intervalos) {
    if (DATA.test(q[`${nome}_de`] || '')) {
      onde.push(`${coluna} >= ?`);
      valores.push(`${q[`${nome}_de`]} 00:00:00`);
    }
    if (DATA.test(q[`${nome}_ate`] || '')) {
      onde.push(`${coluna} < DATE_ADD(?, INTERVAL 1 DAY)`);
      valores.push(q[`${nome}_ate`]);
    }
  }
  if (q.pode_participar) {
    onde.push('l.pode_participar = ?');
    valores.push(q.pode_participar);
  }
  if (q.objeto_social) {
    onde.push('l.objeto_social = ?');
    valores.push(q.objeto_social);
  }
  if (q.exclusivo_me === '1') {
    onde.push("l.beneficio_me IN ('exclusivo','cota')");
  }
  if (q.srp === '1') onde.push('l.srp = 1');
  if (q.etapa) {
    onde.push('l.etapa = ?');
    valores.push(q.etapa);
  }
  if (q.favorito === '1') onde.push('l.favorito = 1');
  if (q.novas_24h === '1') onde.push('l.criado_em >= DATE_SUB(NOW(), INTERVAL 24 HOUR)');
  if (q.com_edital === '1') onde.push("l.arquivos_status IN ('ok','parcial')");
  // "Monitorada" é o monitor de mudança do edital (Fase 11). O monitor de chat
  // do pregão é a Seção 6 e ainda não existe: quando existir, entra aqui.
  if (q.monitorada === '1' && contexto.organizacaoId) {
    onde.push('EXISTS (SELECT 1 FROM monitoramentos mo WHERE mo.licitacao_id = l.id AND mo.organizacao_id = ? AND mo.ativo = 1)');
    valores.push(Number(contexto.organizacaoId));
  }

  if (q.busca) {
    const { frases, palavras } = lerBusca(q.busca);
    // Frase entre aspas: exatamente essa sequência, no objeto.
    for (const frase of frases) {
      onde.push('l.objeto LIKE ?');
      valores.push(comoLike(frase));
    }
    // Palavras soltas: todas precisam aparecer, em qualquer ordem, no objeto,
    // no órgão ou no município.
    for (const palavra of palavras) {
      onde.push('(l.objeto LIKE ? OR l.orgao_nome LIKE ? OR l.municipio LIKE ?)');
      const alvo = comoLike(palavra);
      valores.push(alvo, alvo, alvo);
    }
  }
  if (q.orgao) {
    const digitos = String(q.orgao).replace(/\D/g, '');
    if (digitos.length === 14) {
      onde.push('l.orgao_cnpj = ?');
      valores.push(digitos);
    } else {
      onde.push('(l.orgao_nome LIKE ? OR l.unidade LIKE ?)');
      valores.push(comoLike(q.orgao), comoLike(q.orgao));
    }
  }
  if (q.numero_edital) {
    onde.push('l.numero_compra LIKE ?');
    valores.push(comoLike(q.numero_edital));
  }
  if (q.processo) {
    onde.push('l.processo LIKE ?');
    valores.push(comoLike(q.processo));
  }
  if (q.texto_itens) {
    onde.push('EXISTS (SELECT 1 FROM licitacao_itens it WHERE it.licitacao_id = l.id AND it.descricao LIKE ?)');
    valores.push(comoLike(q.texto_itens));
  }
  if (q.observacao) {
    onde.push('l.informacao_complementar LIKE ?');
    valores.push(comoLike(q.observacao));
  }

  return { onde: onde.length ? `WHERE ${onde.join(' AND ')}` : '', valores, avisos };
}

// Os campos que uma pesquisa salva ou um link público guardam: só filtro, nada
// de página. Campo fora desta lista é descartado ao salvar.
const CAMPOS = [
  'busca', 'grupo', 'uf', 'regiao', 'raio_km', 'raio_centro', 'raio_centro_nome', 'modalidade', 'esfera', 'situacao',
  'fonte_id', 'valor_min', 'valor_max', 'pontuacao_min', 'prazo_dias', 'em_aberto',
  'inclusao_de', 'inclusao_ate', 'prazo_de', 'prazo_ate', 'pode_participar', 'objeto_social',
  'exclusivo_me', 'srp', 'etapa', 'favorito', 'novas_24h', 'com_edital', 'monitorada', 'orgao',
  'numero_edital', 'processo', 'texto_itens', 'observacao', 'ordem', 'incluir_descartadas',
];

// O que é decisão da organização (nota, favorito, etapa, descarte, grupo da
// palavra, monitoramento) não vira filtro de link público: filtrar por isso
// mostraria a quem tem o link exatamente o que a equipe escolheu.
const CAMPOS_DE_DECISAO = [
  'pontuacao_min', 'pode_participar', 'objeto_social', 'etapa', 'favorito', 'grupo', 'monitorada', 'incluir_descartadas',
];

/** Filtros de um link público: sem os de decisão, sem nota mínima, com as descartadas. */
function filtrosPublicos(filtros) {
  const limpo = limparFiltros(filtros);
  for (const campo of CAMPOS_DE_DECISAO) delete limpo[campo];
  return { ...limpo, pontuacao_min: '0', incluir_descartadas: '1' };
}

/** Só os campos conhecidos, como texto curto. */
function limparFiltros(filtros) {
  const limpo = {};
  if (!filtros || typeof filtros !== 'object' || Array.isArray(filtros)) return limpo;
  for (const campo of CAMPOS) {
    const valor = filtros[campo];
    if (valor === undefined || valor === null || valor === '') continue;
    limpo[campo] = String(valor).slice(0, 200);
  }
  return limpo;
}

module.exports = { montarFiltros, limparFiltros, filtrosPublicos, comoLike, lerBusca, ufsDasRegioes, REGIOES, ESFERAS, CAMPOS };
