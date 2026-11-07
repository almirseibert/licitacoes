// Cadência e hashes do monitor (seção 21).
//
// A matemática fica aqui, separada do job, porque é o que precisa ser óbvio ao
// ler: de quanto em quanto tempo cada licitação é olhada, e o que conta como
// "o edital mudou".
const crypto = require('crypto');

const HORA = 60 * 60 * 1000;

/** As etapas em que a licitação está em jogo (seção 21.2). */
const ETAPAS_DISPUTANDO = ['Vou disputar', 'Proposta enviada', 'Em disputa'];

/**
 * A tabela da seção 21.2, de cima para baixo — a primeira linha que casa
 * manda. Intervalos em horas.
 */
const CADENCIA = [
  { chave: 'sessao_hoje', horas: 0.5, quando: 'no dia da sessão' },
  { chave: 'menos_48h', horas: 3, quando: 'faltando menos de 48 h' },
  { chave: 'disputando', horas: 12, quando: 'em disputa, faltando mais de 48 h' },
  { chave: 'apos_sessao', horas: 6, quando: 'depois da sessão, esperando resultado' },
  { chave: 'preco', horas: 168, quando: 'encerrada, só para alimentar preços' },
];

const POR_CHAVE = new Map(CADENCIA.map((c) => [c.chave, c]));

// Até quando se insiste. Depois disso o monitoramento se encerra sozinho: o
// portal que não publicou resultado em 30 dias não vai publicar na checagem
// número 200, e vigiar para sempre é desperdício de requisição no PNCP.
const DIAS_APOS_SESSAO = 30;
const DIAS_PRECO = 90;

function emDias(de, ate) {
  return (ate.getTime() - new Date(de).getTime()) / 86400000;
}

/**
 * Qual cadência vale para esta licitação agora, e se ainda vale vigiar.
 *
 * @returns {{ chave:string, horas:number, quando:string }|null} null = encerrar
 */
function cadenciaDe(licitacao, agora = new Date()) {
  const disputando = ETAPAS_DISPUTANDO.includes(licitacao.etapa);
  const fim = licitacao.fim_propostas ? new Date(licitacao.fim_propostas) : null;
  const horasAteOFim = fim ? (fim.getTime() - agora.getTime()) / HORA : null;

  // Já tem vencedor e etapa fechada: não há mais o que observar.
  if (licitacao.etapa === 'Ganhamos' || licitacao.etapa === 'Perdemos') return null;

  if (horasAteOFim !== null && horasAteOFim > 0) {
    const mesmoDia = fim.toDateString() === agora.toDateString();
    if (disputando && mesmoDia) return POR_CHAVE.get('sessao_hoje');
    if (disputando && horasAteOFim <= 48) return POR_CHAVE.get('menos_48h');
    if (disputando) return POR_CHAVE.get('disputando');
    // Aberta mas sem decisão: o interesse ainda é só de preço, uma vez por
    // semana. Alterar edital de licitação que você não vai disputar não é
    // notícia.
    return POR_CHAVE.get('preco');
  }

  // Passou do fim das propostas.
  const diasDesdeOFim = fim ? emDias(fim, agora) : null;
  if (disputando) {
    if (diasDesdeOFim !== null && diasDesdeOFim > DIAS_APOS_SESSAO) return null;
    return POR_CHAVE.get('apos_sessao');
  }
  if (diasDesdeOFim !== null && diasDesdeOFim > DIAS_PRECO) return null;
  return POR_CHAVE.get('preco');
}

function proximaChecagem(cadencia, agora = new Date()) {
  return new Date(agora.getTime() + cadencia.horas * HORA);
}

function sha256(texto) {
  return crypto.createHash('sha256').update(String(texto), 'utf8').digest('hex');
}

/**
 * Hash da lista de arquivos: sequencial + título + tamanho de cada um, em
 * ordem de sequencial (seção 21.3).
 *
 * O tamanho entra porque é o que pega a troca silenciosa — órgão que substitui
 * o PDF do edital mantendo o mesmo número e o mesmo título, que é o caso que
 * mais derruba licitante desatento. Só o título não pegaria.
 */
function hashArquivos(arquivos = []) {
  const linhas = [...arquivos]
    .map((a) => ({
      sequencial: Number(a.sequencial) || 0,
      titulo: String(a.titulo || '').trim(),
      tamanho: Number(a.tamanho || a.tamanho_bytes || 0) || 0,
    }))
    .sort((a, b) => a.sequencial - b.sequencial)
    .map((a) => `${a.sequencial}|${a.titulo}|${a.tamanho}`);
  return sha256(linhas.join('\n'));
}

/** Hash das datas de abertura e encerramento (seção 21.3). */
function hashDatas({ abertura_propostas: abertura, fim_propostas: fim }) {
  const iso = (v) => (v ? new Date(v).toISOString() : '');
  return sha256(`${iso(abertura)}|${iso(fim)}`);
}

/**
 * Nome da versão seguinte de um arquivo que mudou: `01_Edital.pdf` vira
 * `01_Edital_v2.pdf` (seção 21.3). O antigo nunca é apagado — é a prova do que
 * estava publicado quando você montou a proposta.
 */
function nomeDaVersao(nome, versao) {
  if (versao <= 1) return nome;
  const ponto = nome.lastIndexOf('.');
  if (ponto <= 0) return `${nome}_v${versao}`;
  return `${nome.slice(0, ponto)}_v${versao}${nome.slice(ponto)}`;
}

module.exports = {
  CADENCIA,
  POR_CHAVE,
  ETAPAS_DISPUTANDO,
  DIAS_APOS_SESSAO,
  DIAS_PRECO,
  cadenciaDe,
  proximaChecagem,
  hashArquivos,
  hashDatas,
  nomeDaVersao,
  sha256,
};
