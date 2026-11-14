// Grupos, situação e revisão dos documentos do cofre (Seção 10 do plano SaaS).
//
// O grupo sai do catálogo de exigências — o mesmo código que o edital pede é o
// que o cofre guarda, então o grupo nunca diverge entre o checklist e o cofre.
// A situação é o que a tela filtra: disponível, vencendo (inclui o documento
// sem validade formal que passou da revisão) e pendente (vencido ou sem arquivo).
const { CATALOGO } = require('./exigencias');
const { semaforo } = require('./validades');
const { dia, diasEntre } = require('./gestao');

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

/**
 * Situação para o filtro da tela, com o semáforo e a revisão que a decidiram
 * (a rota espalha tudo na linha). `agora` vai ao semáforo; `hoje` (Brasília) à revisão.
 */
function situacao(documento, agora, hoje) {
  const luz = semaforo(documento.valido_ate, agora);
  const r = revisao(documento, hoje);
  const com = (sit, motivo) => ({ situacao: sit, motivo, semaforo: luz, revisao: r });
  if (!documento.arquivo_path) return com('pendente', 'sem arquivo');
  if (luz.cor === 'vermelho') return com('pendente', luz.texto);
  if (luz.cor === 'amarelo') return com('vencendo', luz.texto);
  if (r && r.devida) return com('vencendo', `revisar: conferido há ${r.dias_desde} dias`);
  return com('disponivel', luz.texto);
}

/** Só link http(s) vira botão "emitir"; "site da Sefaz do seu estado" fica como texto. */
const linkDeEmissao = (texto) => (/^https:\/\/[^\s]+$/i.test(String(texto || '').trim()) ? String(texto).trim() : null);

module.exports = {
  GRUPOS,
  SITUACOES,
  REVISAO_DIAS,
  grupoDoCodigo,
  revisao,
  situacao,
  linkDeEmissao,
};
