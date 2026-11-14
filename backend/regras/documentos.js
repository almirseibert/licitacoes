// Grupos, situação e revisão dos documentos do cofre (Seção 10 do plano SaaS).
//
// O grupo sai do catálogo de exigências — o mesmo código que o edital pede é o
// que o cofre guarda, então o grupo nunca diverge entre o checklist e o cofre.
// A situação é o que a tela filtra: disponível, vencendo (inclui o documento
// sem validade formal que passou da revisão) e pendente (vencido ou sem arquivo).
const { CATALOGO } = require('./exigencias');
const { semaforo } = require('./validades');
const { dia } = require('./gestao');

const GRUPOS = [
  { chave: 'juridica', rotulo: 'Habilitação jurídica' },
  { chave: 'regularidade', rotulo: 'Regularidade fiscal, social e trabalhista' },
  { chave: 'tecnica', rotulo: 'Qualificação técnica' },
  { chave: 'economica', rotulo: 'Qualificação econômico-financeira' },
  { chave: 'outros', rotulo: 'Outros' },
];

const DO_CATALOGO = {
  'Habilitação jurídica': 'juridica',
  'Regularidade fiscal': 'regularidade',
  'Qualificação técnica': 'tecnica',
  'Qualificação econômica': 'economica',
};

const GRUPO_POR_CODIGO = Object.fromEntries(CATALOGO.map((c) => [c.codigo, DO_CATALOGO[c.grupo] || 'outros']));

const SITUACOES = ['disponivel', 'vencendo', 'pendente'];

// Regra da referência: documento sem validade formal é conferido a cada 90 dias.
const REVISAO_DIAS = 90;

const grupoDoCodigo = (codigo) => GRUPO_POR_CODIGO[codigo] || 'outros';

/** Dias inteiros entre dois dias 'AAAA-MM-DD' (b − a). */
function diasEntre(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

/**
 * Revisão do documento sem validade formal. Base: a última conferência
 * (`revisado_em`) ou, sem ela, o dia em que entrou no cofre.
 * Documento com validade não tem revisão — quem manda é a data dele.
 */
function revisao(documento, hoje) {
  if (documento.valido_ate) return null;
  const base = dia(documento.revisado_em) || dia(documento.criado_em);
  if (!base || !hoje) return null;
  const desde = diasEntre(base, hoje);
  return { base, dias_desde: desde, devida: desde >= REVISAO_DIAS, faltam: Math.max(0, REVISAO_DIAS - desde) };
}

/** Situação para o filtro da tela. `agora` vai ao semáforo; `hoje` (Brasília) à revisão. */
function situacao(documento, agora, hoje) {
  if (!documento.arquivo_path) return { situacao: 'pendente', motivo: 'sem arquivo' };
  const luz = semaforo(documento.valido_ate, agora);
  if (luz.cor === 'vermelho') return { situacao: 'pendente', motivo: luz.texto };
  if (luz.cor === 'amarelo') return { situacao: 'vencendo', motivo: luz.texto };
  const r = revisao(documento, hoje);
  if (r && r.devida) return { situacao: 'vencendo', motivo: `revisar: conferido há ${r.dias_desde} dias` };
  return { situacao: 'disponivel', motivo: luz.texto };
}

/**
 * A mesma base da revisão em SQL, no dia de Brasília: `criado_em` é UTC, e o
 * documento subido às 22 h não pode ganhar um dia a mais no dashboard e no job
 * do que na tela. Brasília é -03:00 o ano inteiro desde 2019.
 */
const SQL_BASE_REVISAO = (a = '') =>
  `COALESCE(${a ? `${a}.` : ''}revisado_em, DATE(CONVERT_TZ(${a ? `${a}.` : ''}criado_em, '+00:00', '-03:00')))`;

/** Só link http(s) vira botão "emitir"; "site da Sefaz do seu estado" fica como texto. */
const linkDeEmissao = (texto) => (/^https:\/\/[^\s]+$/i.test(String(texto || '').trim()) ? String(texto).trim() : null);

module.exports = {
  GRUPOS,
  SITUACOES,
  REVISAO_DIAS,
  SQL_BASE_REVISAO,
  grupoDoCodigo,
  revisao,
  situacao,
  linkDeEmissao,
  diasEntre,
};
