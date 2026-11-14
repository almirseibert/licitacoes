// Assistente de primeiro acesso, termos e NPS (Seção 17 do PLANO_SAAS_CONLICITACAO.md)
// — as contas e as validações, sem banco, para o que erra calado ter teste:
// CNPJ com dígito errado, palavra-chave repetida por maiúscula, UF inventada,
// pesquisa de NPS perguntada de novo cedo demais.

const UFS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
  'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
];

const MAX_PALAVRAS = 60;
const MIN_LETRAS_PALAVRA = 3;
const MAX_LETRAS_PALAVRA = 80;

const DIAS_ATE_NPS = 30; // "depois de 30 dias de uso"
const DIAS_NPS_DISPENSADO = 30; // dispensou: volta a perguntar em 30 dias
const DIAS_NPS_RESPONDIDO = 180; // respondeu: só pergunta de novo em 6 meses

const soDigitos = (v) => String(v || '').replace(/\D/g, '');

/** CNPJ pelos dois dígitos verificadores (rejeita 00000000000000 e afins). */
function cnpjValido(valor) {
  const d = soDigitos(valor);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const digito = (base) => {
    let peso = base.length - 7;
    let soma = 0;
    for (const c of base) {
      soma += Number(c) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return digito(d.slice(0, 12)) === Number(d[12]) && digito(d.slice(0, 13)) === Number(d[13]);
}

function formatarCnpj(valor) {
  const d = soDigitos(valor);
  return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : String(valor || '');
}

const chaveDaPalavra = (p) =>
  String(p).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Palavras-chave vindas do formulário (texto com uma por linha, ou lista).
 * Separa por quebra de linha e ponto e vírgula — vírgula não, porque
 * "luvas, procedimento" não é duas palavras para todo mundo. Tira repetidas
 * (sem acento, sem caixa) e devolve o que descartou, para a tela dizer por quê.
 */
function limparPalavras(entrada) {
  const bruto = Array.isArray(entrada) ? entrada : String(entrada || '').split(/[\n;]+/);
  const vistas = new Set();
  const palavras = [];
  const descartadas = [];
  for (const item of bruto) {
    const termo = String(item || '').replace(/\s+/g, ' ').trim();
    if (!termo) continue;
    if (termo.length < MIN_LETRAS_PALAVRA) {
      descartadas.push({ termo, motivo: `curta demais (mínimo ${MIN_LETRAS_PALAVRA} letras)` });
      continue;
    }
    if (termo.length > MAX_LETRAS_PALAVRA) {
      descartadas.push({ termo: termo.slice(0, 30) + '…', motivo: `longa demais (máximo ${MAX_LETRAS_PALAVRA} letras)` });
      continue;
    }
    const chave = chaveDaPalavra(termo);
    if (vistas.has(chave)) {
      descartadas.push({ termo, motivo: 'repetida' });
      continue;
    }
    if (palavras.length >= MAX_PALAVRAS) {
      descartadas.push({ termo, motivo: `passou de ${MAX_PALAVRAS} palavras` });
      continue;
    }
    vistas.add(chave);
    palavras.push(termo);
  }
  return { palavras, descartadas };
}

/** CNAE: 7 dígitos, aceita "4789-0/99" e "47.89-0-99". */
function limparCnaes(entrada) {
  const lista = Array.isArray(entrada) ? entrada : [];
  const vistos = new Set();
  const cnaes = [];
  const invalidos = [];
  for (const item of lista) {
    const codigo = soDigitos(item && typeof item === 'object' ? item.codigo : item);
    if (codigo.length !== 7) {
      invalidos.push(String(item && typeof item === 'object' ? item.codigo : item || '').slice(0, 20));
      continue;
    }
    if (vistos.has(codigo)) continue;
    vistos.add(codigo);
    const descricao = item && typeof item === 'object' && item.descricao ? String(item.descricao).trim().slice(0, 200) : null;
    cnaes.push({
      codigo: codigo.replace(/^(\d{4})(\d)(\d{2})$/, '$1-$2/$3'),
      descricao,
      principal: cnaes.length === 0,
      cobertura: [],
    });
  }
  return { cnaes, invalidos };
}

function limparUfs(entrada) {
  const lista = Array.isArray(entrada) ? entrada : String(entrada || '').split(/[\s,;]+/);
  const vistas = new Set();
  const invalidas = [];
  for (const u of lista) {
    const sigla = String(u || '').trim().toUpperCase();
    if (!sigla) continue;
    if (UFS.includes(sigla)) vistas.add(sigla);
    else invalidas.push(sigla);
  }
  return { ufs: [...vistas].sort(), invalidas };
}

/**
 * Valida o corpo do assistente. Devolve `{ dados }` ou `{ erro }` — o erro é a
 * frase para quem usa. Palavra-chave é o único campo obrigatório: sem ela o
 * boletim sairia vazio, e dado que falta vira lacuna visível, não valor inventado.
 */
function validarAssistente(corpo) {
  const c = corpo && typeof corpo === 'object' ? corpo : {};
  const empresa = c.empresa && typeof c.empresa === 'object' ? c.empresa : {};

  const razao = String(empresa.razao_social || '').trim().slice(0, 255);
  const cnpjDigitos = soDigitos(empresa.cnpj);
  if (cnpjDigitos && !cnpjValido(cnpjDigitos)) return { erro: 'O CNPJ informado não confere. Confira os números.' };

  const { palavras, descartadas } = limparPalavras(c.palavras);
  if (!palavras.length) {
    return { erro: `Informe pelo menos uma palavra-chave (com ${MIN_LETRAS_PALAVRA} letras ou mais) do que a sua empresa vende.` };
  }
  const exclusoes = limparPalavras(c.exclusoes).palavras;

  const { cnaes, invalidos } = limparCnaes(empresa.cnaes);
  if (invalidos.length) return { erro: `CNAE inválido: ${invalidos.join(', ')}. Use os 7 dígitos, como 4789-0/99.` };

  const { ufs, invalidas } = limparUfs(c.ufs);
  if (invalidas.length) return { erro: `UF inválida: ${invalidas.join(', ')}.` };

  return {
    dados: {
      empresa: { razao_social: razao || null, cnpj: cnpjDigitos ? formatarCnpj(cnpjDigitos) : null, cnaes },
      palavras,
      exclusoes,
      ufs,
      descartadas,
    },
  };
}

/**
 * Os passos que a tela mostra, na ordem. `estado` vem do banco:
 * `{ empresa, cnaes, palavras, filtro, boletim }` (contagens e booleanos).
 */
function passos(estado) {
  const e = estado || {};
  return [
    { chave: 'empresa', rotulo: 'Dados da empresa', feito: Boolean(e.empresa) },
    { chave: 'cnaes', rotulo: 'Atividades (CNAE)', feito: Number(e.cnaes) > 0 },
    { chave: 'palavras', rotulo: 'Palavras-chave', feito: Number(e.palavras) > 0 },
    { chave: 'filtro', rotulo: 'Primeiro filtro', feito: Number(e.filtro) > 0 },
    { chave: 'boletim', rotulo: 'Primeiro boletim', feito: Boolean(e.boletim) },
  ];
}

const MS_DIA = 86400000;
const diasEntre = (de, ate) => Math.floor((new Date(ate).getTime() - new Date(de).getTime()) / MS_DIA);

/**
 * A pesquisa de NPS é devida? `membroDesde` = quando a pessoa entrou na
 * organização; `ultima` = a resposta mais recente `{ criada_em, nota }`
 * (nota nula = dispensou). Perguntar uma vez só por janela, nunca no 1º mês.
 */
function npsDevido({ membroDesde, ultima, agora = new Date() }) {
  if (!membroDesde) return false;
  if (diasEntre(membroDesde, agora) < DIAS_ATE_NPS) return false;
  if (!ultima) return true;
  const esperar = ultima.nota === null || ultima.nota === undefined ? DIAS_NPS_DISPENSADO : DIAS_NPS_RESPONDIDO;
  return diasEntre(ultima.criada_em, agora) >= esperar;
}

/** Nota e comentário do NPS vindos da tela. */
function validarNps(corpo) {
  const c = corpo || {};
  const nota = Number(c.nota);
  if (c.nota === undefined || c.nota === null || c.nota === '' || !Number.isInteger(nota) || nota < 0 || nota > 10) {
    return { erro: 'Dê uma nota de 0 a 10.' };
  }
  const comentario = String(c.comentario || '').trim().slice(0, 1000);
  return { dados: { nota, comentario: comentario || null } };
}

/** Resumo do NPS: % de promotores (9–10) menos % de detratores (0–6). Sem resposta, `nps` é nulo. */
function resumirNps(notas) {
  const validas = notas.filter((n) => n !== null && n !== undefined).map(Number);
  const total = validas.length;
  const promotores = validas.filter((n) => n >= 9).length;
  const detratores = validas.filter((n) => n <= 6).length;
  const neutros = total - promotores - detratores;
  const nps = total ? Math.round(((promotores - detratores) / total) * 100) : null;
  return { total, promotores, neutros, detratores, nps };
}

/** Termos: a pessoa precisa ter aceitado a versão vigente. */
const termosPendentes = (versaoAceita, versaoVigente) => versaoAceita !== versaoVigente;

module.exports = {
  UFS, MAX_PALAVRAS, DIAS_ATE_NPS, DIAS_NPS_DISPENSADO, DIAS_NPS_RESPONDIDO,
  cnpjValido, formatarCnpj, limparPalavras, limparCnaes, limparUfs,
  validarAssistente, passos, npsDevido, validarNps, resumirNps, termosPendentes, soDigitos,
};
