// Avisos por tipo e por canal (Seção 9 do PLANO_SAAS_CONLICITACAO.md).
//
// Regras puras, sem banco e sem rede: de que tipo é cada alerta, quem quer
// recebê-lo por qual canal, e como juntar tudo num envio por destino. O que
// erra calado aqui (um tipo desligado que continua chegando, o mesmo e-mail
// recebendo duas vezes, o autor sendo avisado do que ele mesmo fez) está em
// `testes/notificacoes.test.js`.

// Os tipos da Seção 9, mais "prazo": o aviso de 48 h / 2 h é o mais antigo do
// painel e o primeiro que alguém quer desligar no WhatsApp e manter no e-mail.
const TIPOS = [
  { chave: 'prazo', rotulo: 'Prazo das propostas' },
  { chave: 'esclarecimento', rotulo: 'Esclarecimento' },
  { chave: 'aviso', rotulo: 'Aviso / edital alterado' },
  { chave: 'impugnacao', rotulo: 'Impugnação' },
  { chave: 'recurso', rotulo: 'Recurso' },
  { chave: 'status', rotulo: 'Mudança de status' },
  { chave: 'resultado', rotulo: 'Resultado' },
  { chave: 'documento_vencendo', rotulo: 'Documento vencendo' },
  { chave: 'tarefa_atrasada', rotulo: 'Tarefa atrasada' },
  { chave: 'nova_oportunidade', rotulo: 'Nova oportunidade' },
];
const CHAVES_TIPO = new Set(TIPOS.map((t) => t.chave));

const CANAIS = [
  { chave: 'email', rotulo: 'E-mail' },
  { chave: 'whatsapp', rotulo: 'WhatsApp' },
  { chave: 'push', rotulo: 'Navegador' },
];
const CHAVES_CANAL = new Set(CANAIS.map((c) => c.chave));

// Tipo interno do alerta (o que cada job grava em `alertas.tipo`) → tipo da
// Seção 9. O que não está aqui cai em "aviso": melhor chegar num tipo genérico
// que a pessoa pode desligar do que sumir em silêncio.
const MAPA = {
  prazo_48h: 'prazo',
  prazo_2h: 'prazo',
  prazo_questionamento: 'prazo',
  esclarecimento: 'esclarecimento',
  impugnacao: 'impugnacao',
  recurso: 'recurso',
  situacao: 'status',
  status: 'status',
  suspensa: 'status',
  cancelada: 'status',
  reaberta: 'status',
  reativada: 'status',
  resultado: 'resultado',
  tarefa_atrasada: 'tarefa_atrasada',
  nova_licitacao_alta: 'nova_oportunidade',
  reabertura: 'nova_oportunidade',
  edital_alterado: 'aviso',
  data_alterada: 'aviso',
};

/** Tipo da Seção 9 de um alerta gravado. */
function tipoDoAlerta(tipoInterno) {
  const t = String(tipoInterno || '');
  if (MAPA[t]) return MAPA[t];
  if (t.startsWith('validade_')) return 'documento_vencendo';
  // Andamento "outro" e tudo o mais (marco de contrato, recorrência, plano).
  return 'aviso';
}

const chavePref = (canal, tipo) => `${canal}:${tipo}`;

// O padrão, para quem nunca mexeu. Antes da Seção 9 só o prazo saía do painel;
// agora sai quase tudo, então o que é volume fica desligado até a pessoa pedir:
// nova oportunidade já chega no boletim diário (Seção 4), e no WhatsApp — que é
// celular, no bolso — aviso genérico e documento vencendo também.
const DESLIGADO_DE_FABRICA = new Set([
  'email:nova_oportunidade',
  'whatsapp:nova_oportunidade',
  'whatsapp:aviso',
  'whatsapp:documento_vencendo',
]);

/**
 * Preferência de alguém: o que está gravado manda; o que não está, vale o padrão.
 * @param {Map<string,boolean>} prefs - `canal:tipo` → ativo
 */
function ligado(prefs, canal, tipo) {
  const valor = prefs && prefs.get(chavePref(canal, tipo));
  return valor === undefined ? !DESLIGADO_DE_FABRICA.has(chavePref(canal, tipo)) : Boolean(valor);
}

/** A matriz completa para a tela: tipo × canal, já com o padrão aplicado. */
function matriz(prefs) {
  return TIPOS.map((t) => ({
    ...t,
    canais: Object.fromEntries(CANAIS.map((c) => [c.chave, ligado(prefs, c.chave, t.chave)])),
  }));
}

/** Linhas `{canal, tipo, ativo}` do banco → Map. */
function prefsDeLinhas(linhas = []) {
  return new Map(linhas.map((l) => [chavePref(l.canal, l.tipo), Boolean(l.ativo)]));
}

/**
 * Lê `[{canal, tipo, ativo}]` do corpo. Devolve `{ itens }` ou `{ erro }`.
 */
function lerPreferencias(lista) {
  if (!Array.isArray(lista) || !lista.length) return { erro: 'Mande ao menos uma preferência.' };
  if (lista.length > TIPOS.length * CANAIS.length) return { erro: 'Preferências demais numa só vez.' };
  const itens = [];
  for (const p of lista) {
    if (!p || !CHAVES_CANAL.has(p.canal)) return { erro: `Canal desconhecido: ${p && p.canal}.` };
    if (!CHAVES_TIPO.has(p.tipo)) return { erro: `Tipo de aviso desconhecido: ${p.tipo}.` };
    if (typeof p.ativo !== 'boolean') return { erro: 'Cada preferência precisa dizer se está ligada (true/false).' };
    itens.push({ canal: p.canal, tipo: p.tipo, ativo: p.ativo });
  }
  return { itens };
}

const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

/** Só dígitos; 10 a 15 com o DDI (o formato que a Meta aceita). */
function whatsappValido(valor) {
  const d = String(valor || '').replace(/\D/g, '');
  return d.length >= 10 && d.length <= 15 ? d : null;
}

/**
 * Destinos da pessoa. Vazio é permitido (e-mail volta ao de login; WhatsApp
 * desliga). Devolve `{ campos }` só com o que veio, ou `{ erro }`.
 */
function lerDestinos(corpo = {}) {
  const campos = {};
  if ('email' in corpo) {
    const e = String(corpo.email || '').trim();
    if (e && (!EMAIL.test(e) || e.length > 190)) return { erro: 'E-mail inválido.' };
    campos.email = e || null;
  }
  if ('whatsapp' in corpo) {
    const bruto = String(corpo.whatsapp || '').trim();
    if (bruto && !whatsappValido(bruto)) {
      return { erro: 'WhatsApp inválido: use o número com DDI e DDD, ex.: 55 51 99999-9999.' };
    }
    campos.whatsapp = bruto ? whatsappValido(bruto) : null;
  }
  if (!Object.keys(campos).length) return { erro: 'Nada para salvar: mande email e/ou whatsapp.' };
  return { campos };
}

/**
 * Quem recebe o quê, por onde.
 *
 * @param {Array<{id, tipo, mensagem, quando?, usuario_id?, autor_id?}>} alertas - de UMA organização
 * @param {Array<{usuario_id:number|null, email?, whatsapp?, push?:Array, prefs:Map}>} destinatarios
 *        `usuario_id` null é a caixa da organização.
 * @returns {Array<{canal, destino, avisos:Array}>} um envio por canal e destino,
 *          sem repetir destino. Endereço de alguém da equipe segue a escolha dessa
 *          pessoa, mesmo que seja também o da caixa da organização.
 */
function planejarEnvios(alertas, destinatarios) {
  const envios = new Map();
  const endereco = (canal, destino) => `${canal}:${String(destino).toLowerCase()}`;

  // Endereço que é de alguém da equipe obedece às escolhas DESSA pessoa: a
  // caixa da organização com o mesmo e-mail não religa o que ela desligou, nem
  // avisa o autor do que ele fez.
  const daEquipe = new Set();
  for (const d of destinatarios) {
    if (d.usuario_id === null || d.usuario_id === undefined) continue;
    if (d.email) daEquipe.add(endereco('email', d.email));
    if (d.whatsapp) daEquipe.add(endereco('whatsapp', d.whatsapp));
  }
  const pode = (d, canal) =>
    Boolean(d[canal]) && (d.usuario_id != null || !daEquipe.has(endereco(canal, d[canal])));

  const juntar = (canal, destino, alerta) => {
    const chave = canal === 'push' ? `push:${destino.endpoint}` : endereco(canal, destino);
    if (!envios.has(chave)) envios.set(chave, { canal, destino, avisos: [], ids: new Set() });
    const envio = envios.get(chave);
    if (envio.ids.has(alerta.id)) return;
    envio.ids.add(alerta.id);
    envio.avisos.push({ id: alerta.id, mensagem: alerta.mensagem, quando: alerta.quando || null });
  };

  for (const alerta of alertas) {
    const tipo = tipoDoAlerta(alerta.tipo);
    for (const d of destinatarios) {
      // Aviso pessoal (tarefa atrasada) vai só à pessoa — nem à caixa da organização.
      if (alerta.usuario_id && d.usuario_id !== alerta.usuario_id) continue;
      // Quem fez não precisa ser avisado do que fez.
      if (alerta.autor_id && d.usuario_id === alerta.autor_id) continue;

      if (pode(d, 'email') && ligado(d.prefs, 'email', tipo)) juntar('email', d.email, alerta);
      if (pode(d, 'whatsapp') && ligado(d.prefs, 'whatsapp', tipo)) juntar('whatsapp', d.whatsapp, alerta);
      if (d.push && d.push.length && ligado(d.prefs, 'push', tipo)) {
        for (const inscricao of d.push) juntar('push', inscricao, alerta);
      }
    }
  }

  return [...envios.values()].map(({ ids: _ids, ...envio }) => envio);
}

/**
 * Parâmetro de modelo do WhatsApp: a Meta recusa quebra de linha, tabulação e
 * mais de quatro espaços seguidos dentro de variável de template.
 */
function textoDeModelo(avisos, limite = 900) {
  const texto = avisos
    .map((a) => String(a.mensagem || ''))
    .join(' | ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
  return texto.length > limite ? `${texto.slice(0, limite - 1)}…` : texto;
}

module.exports = {
  TIPOS,
  CANAIS,
  tipoDoAlerta,
  ligado,
  matriz,
  prefsDeLinhas,
  lerPreferencias,
  lerDestinos,
  whatsappValido,
  planejarEnvios,
  textoDeModelo,
};
