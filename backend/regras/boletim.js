// Regras do boletim diário (Seção 4 do PLANO_SAAS_CONLICITACAO.md) — puro, sem
// banco nem rede, testado em testes/boletim.test.js.
//
// O filtro de palavra-chave roda AQUI, sobre o objeto e o texto extraído do
// edital. A API do PNCP ignora `palavraChave` em silêncio (achado da seção 0):
// confiar nela seria mandar ao cliente tudo o que o portal publicou no dia.
const crypto = require('crypto');
const { normalizar } = require('./texto');

const HORARIOS_PADRAO = [7, 12, 18];
const MAX_TERMOS = 100;
const MAX_TERMO = 160;
const MAX_NOME = 80;

// --------------------------------------------------------------- validação

function lista(valor, { max = MAX_TERMOS, tamanho = MAX_TERMO, campo }) {
  if (valor === undefined || valor === null || valor === '') return [];
  const bruto = Array.isArray(valor) ? valor : String(valor).split(/[\n,;]/);
  const limpo = [...new Set(bruto.map((v) => String(v).trim()).filter(Boolean))];
  if (limpo.length > max) throw new Error(`Use no máximo ${max} itens em ${campo}.`);
  for (const v of limpo) {
    if (v.length > tamanho) throw new Error(`"${v.slice(0, 30)}…" é longo demais para ${campo}.`);
  }
  return limpo;
}

function dinheiro(valor, campo) {
  if (valor === undefined || valor === null || valor === '') return null;
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Valor inválido em ${campo}.`);
  return Math.round(n * 100) / 100;
}

/**
 * Valida o corpo de um filtro. Lança `Error` com mensagem para o usuário.
 * `parcial` = PUT: só os campos que vieram.
 */
function validarPerfil(corpo = {}, { parcial = false } = {}) {
  const p = {};
  const veio = (c) => !parcial || c in corpo;

  if (veio('nome')) {
    const nome = String(corpo.nome || '').trim();
    if (!nome) throw new Error('Dê um nome ao filtro.');
    if (nome.length > MAX_NOME) throw new Error(`O nome do filtro tem no máximo ${MAX_NOME} letras.`);
    p.nome = nome;
  }
  if (veio('palavras')) p.palavras = lista(corpo.palavras, { campo: 'palavras' });
  if (veio('exclusoes')) p.exclusoes = lista(corpo.exclusoes, { campo: 'exclusões' });
  if (veio('ufs')) {
    p.ufs = lista(corpo.ufs, { max: 27, tamanho: 2, campo: 'UFs' }).map((u) => u.toUpperCase());
    if (p.ufs.some((u) => !/^[A-Z]{2}$/.test(u))) throw new Error('UF é a sigla de duas letras (ex.: RS).');
  }
  if (veio('municipios')) p.municipios = lista(corpo.municipios, { max: 200, tamanho: 120, campo: 'municípios' });
  if (veio('modalidades')) p.modalidades = lista(corpo.modalidades, { max: 20, tamanho: 60, campo: 'modalidades' });
  if (veio('valor_minimo')) p.valor_minimo = dinheiro(corpo.valor_minimo, 'valor mínimo');
  if (veio('valor_maximo')) p.valor_maximo = dinheiro(corpo.valor_maximo, 'valor máximo');
  if (p.valor_minimo != null && p.valor_maximo != null && p.valor_minimo > p.valor_maximo) {
    throw new Error('O valor mínimo está maior que o máximo.');
  }
  if (veio('nota_minima')) {
    const v = corpo.nota_minima;
    if (v === undefined || v === null || v === '') p.nota_minima = null;
    else {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 100) throw new Error('A nota mínima vai de 0 a 100.');
      p.nota_minima = n;
    }
  }
  if ('horarios' in corpo) {
    const horas = (Array.isArray(corpo.horarios) ? corpo.horarios : String(corpo.horarios || '').split(/[,;\s]+/))
      .filter((h) => h !== '' && h !== null && h !== undefined)
      .map(Number);
    if (!horas.length) throw new Error('Escolha ao menos um horário para o boletim.');
    if (horas.some((h) => !Number.isInteger(h) || h < 0 || h > 23)) throw new Error('Horário é uma hora cheia, de 0 a 23.');
    p.horarios = [...new Set(horas)].sort((a, b) => a - b);
  }
  for (const c of ['ativo', 'enviar_email']) {
    if (c in corpo) p[c] = corpo[c] ? 1 : 0;
  }
  if (!parcial) {
    p.palavras = p.palavras || [];
    p.exclusoes = p.exclusoes || [];
    p.ufs = p.ufs || [];
    p.municipios = p.municipios || [];
    p.modalidades = p.modalidades || [];
    p.horarios = p.horarios || [...HORARIOS_PADRAO];
  }
  return p;
}

/** JSON do banco (string no MariaDB, objeto no MySQL 8) → array. */
function lerLista(valor) {
  if (Array.isArray(valor)) return valor;
  if (valor === null || valor === undefined || valor === '') return [];
  try {
    const v = JSON.parse(valor);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function lerPerfil(linha) {
  return {
    ...linha,
    palavras: lerLista(linha.palavras),
    exclusoes: lerLista(linha.exclusoes),
    ufs: lerLista(linha.ufs),
    municipios: lerLista(linha.municipios),
    modalidades: lerLista(linha.modalidades),
    horarios: lerLista(linha.horarios).map(Number),
    valor_minimo: linha.valor_minimo == null ? null : Number(linha.valor_minimo),
    valor_maximo: linha.valor_maximo == null ? null : Number(linha.valor_maximo),
  };
}

// ------------------------------------------------------------------ casamento

function escapar(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Alguma palavra do texto começa com o termo? "ti" não casa dentro de
 * "gestião" nem de "multimídia"; "monitor" casa com "monitores" (plural) —
 * e com "monitoramento", como no Radar: para isso existem as exclusões.
 * Sem acento e sem caixa dos dois lados.
 */
function temTermo(textoNormalizado, termo) {
  const t = normalizar(termo);
  if (!t || !textoNormalizado) return false;
  return new RegExp(`(^|[^a-z0-9])${escapar(t)}`).test(textoNormalizado);
}

function primeiroTermo(textoNormalizado, termos) {
  return termos.find((t) => temTermo(textoNormalizado, t)) || null;
}

/**
 * A licitação entra no boletim deste filtro?
 *
 * Palavras: basta uma, no objeto OU no texto do edital; sem nenhuma, nada
 * casa. Exclusões: só no objeto — o edital inteiro
 * cita de tudo (anexos, modelos, leis), e excluir por ele derrubaria quase
 * tudo. Valor: licitação sem valor (sigiloso, não informado) passa — o boletim
 * mostra a lacuna em vez de esconder a oportunidade.
 *
 * @returns {{casa:boolean, palavra?:string|null, onde?:'objeto'|'edital'|null, motivo?:string}}
 */
function casar(perfil, licitacao, textoEdital = '') {
  if (perfil.ufs.length && !perfil.ufs.includes(String(licitacao.uf || '').toUpperCase())) {
    return { casa: false, motivo: 'uf' };
  }
  if (perfil.municipios.length) {
    const m = normalizar(licitacao.municipio);
    if (!perfil.municipios.some((x) => normalizar(x) === m)) return { casa: false, motivo: 'municipio' };
  }
  if (perfil.modalidades.length) {
    const mod = normalizar(licitacao.modalidade);
    if (!perfil.modalidades.some((x) => mod.includes(normalizar(x)))) return { casa: false, motivo: 'modalidade' };
  }
  const valor = licitacao.valor_estimado == null ? null : Number(licitacao.valor_estimado);
  if (valor !== null && valor > 0) {
    if (perfil.valor_minimo != null && valor < perfil.valor_minimo) return { casa: false, motivo: 'valor' };
    if (perfil.valor_maximo != null && valor > perfil.valor_maximo) return { casa: false, motivo: 'valor' };
  }
  // Sem pontuação (a organização nunca pontuou a licitação) a nota não barra.
  if (perfil.nota_minima != null && licitacao.pontuacao != null && Number(licitacao.pontuacao) < perfil.nota_minima) {
    return { casa: false, motivo: 'nota' };
  }

  const objeto = normalizar(licitacao.objeto);
  if (primeiroTermo(objeto, perfil.exclusoes)) return { casa: false, motivo: 'exclusao' };

  // Sem palavra não há boletim: um filtro vazio mandaria o catálogo inteiro.
  if (!perfil.palavras.length) return { casa: false, motivo: 'sem_palavras' };
  const noObjeto = primeiroTermo(objeto, perfil.palavras);
  if (noObjeto) return { casa: true, palavra: noObjeto, onde: 'objeto' };
  const noEdital = textoEdital ? primeiroTermo(normalizar(textoEdital), perfil.palavras) : null;
  if (noEdital) return { casa: true, palavra: noEdital, onde: 'edital' };
  return { casa: false, motivo: 'palavra' };
}

/**
 * Qual horário do filtro está vencido agora e ainda não saiu? O mais recente
 * só: com o worker parado das 6h às 19h, sai UM boletim (o das 18h) com tudo,
 * e não três em sequência — os dois primeiros com tudo e o terceiro vazio.
 */
function horarioDevido(horarios, horaAtual, jaGerados = []) {
  const vencidos = horarios.filter((h) => h <= horaAtual);
  if (!vencidos.length) return null;
  const ultimo = Math.max(...vencidos);
  return jaGerados.includes(ultimo) ? null : ultimo;
}

// --------------------------------------------------------------- descadastro

function assinar(segredo, perfilId, usuarioId) {
  return crypto
    .createHmac('sha256', String(segredo))
    .update(`boletim-descadastro:${perfilId}:${usuarioId}`)
    .digest('base64url')
    .slice(0, 32);
}

function tokenDescadastro(segredo, perfilId, usuarioId) {
  return `${Number(perfilId)}.${Number(usuarioId)}.${assinar(segredo, perfilId, usuarioId)}`;
}

/** Devolve `{perfilId, usuarioId}` ou `null` se o token não confere. */
function lerTokenDescadastro(segredo, token) {
  const partes = String(token || '').split('.');
  if (partes.length !== 3) return null;
  const [p, u, assinatura] = partes;
  if (!/^\d{1,10}$/.test(p) || !/^\d{1,10}$/.test(u)) return null;
  const esperado = Buffer.from(assinar(segredo, p, u));
  const recebido = Buffer.from(assinatura);
  if (esperado.length !== recebido.length || !crypto.timingSafeEqual(esperado, recebido)) return null;
  return { perfilId: Number(p), usuarioId: Number(u) };
}

// -------------------------------------------------------------------- e-mail

const LACUNA = '____________';

function formatarValor(item) {
  if (item.orcamento_sigiloso) return 'sigiloso';
  if (item.valor_estimado == null || Number(item.valor_estimado) <= 0) return LACUNA;
  return Number(item.valor_estimado).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarData(valor) {
  if (!valor) return LACUNA;
  return new Date(valor).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
}

function dataCurta(dia) {
  const [a, m, d] = String(dia).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

function montarAssunto(perfil, boletim) {
  const n = boletim.total_itens;
  return `[Licitações] Boletim nº ${boletim.numero} de ${dataCurta(boletim.data)} — ${perfil.nome}: ${n} ${n === 1 ? 'licitação' : 'licitações'}`;
}

function montarTexto(perfil, boletim, itens, { urlPublica = '', linkDescadastro = '' } = {}) {
  const linhas = itens.map((i, n) => {
    const onde = i.palavra ? `  Casou "${i.palavra}" no ${i.onde === 'edital' ? 'texto do edital' : 'objeto'}\n` : '';
    return (
      `${n + 1}. ${String(i.objeto || LACUNA).replace(/\s+/g, ' ').slice(0, 300)}\n` +
      `  ${i.orgao_nome || LACUNA} — ${i.municipio || LACUNA}/${i.uf || '--'}\n` +
      `  ${i.modalidade || LACUNA} · valor estimado ${formatarValor(i)} · propostas até ${formatarData(i.fim_propostas)}\n` +
      onde +
      (i.link_portal ? `  ${i.link_portal}\n` : '')
    );
  });
  return [
    `Boletim nº ${boletim.numero} de ${dataCurta(boletim.data)}, ${String(boletim.horario).padStart(2, '0')}h — filtro "${perfil.nome}"`,
    `${itens.length} ${itens.length === 1 ? 'licitação nova' : 'licitações novas'} que casam com o filtro:`,
    '',
    linhas.join('\n'),
    ...(urlPublica ? [`Ver no painel: ${urlPublica}`, ''] : []),
    '—',
    'Painel de Licitações — Studio Mythos',
    ...(linkDescadastro ? [`Não quer mais este e-mail? ${linkDescadastro}`] : []),
  ].join('\n');
}

module.exports = {
  HORARIOS_PADRAO,
  LACUNA,
  validarPerfil,
  lerPerfil,
  temTermo,
  casar,
  horarioDevido,
  tokenDescadastro,
  lerTokenDescadastro,
  montarAssunto,
  montarTexto,
  formatarValor,
};
