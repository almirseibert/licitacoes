// Serviços complementares por parceria (Seção 18 do PLANO_SAAS_CONLICITACAO.md) —
// validação do pedido, o que vai ao parceiro, o texto do e-mail e as transições de
// status, sem banco e sem rede.
const { SERVICOS, VERSAO_TERMO_PARCEIRO, TERMO_VINCULO } = require('../config/dados/servicos');
const { LACUNA } = require('../config/dados/legal');
const { EMAIL } = require('./notificacoes');
const { protocolo: protocoloComum } = require('./protocolo');

const STATUS = {
  interesse: 'Interesse registrado',
  solicitado: 'Aguardando envio ao parceiro',
  encaminhado: 'Encaminhado ao parceiro',
  em_atendimento: 'Em atendimento',
  contratado: 'Contratado',
  recusado: 'Recusado',
  cancelado: 'Cancelado',
};

/** Pedido que ainda pode ser cancelado pelo cliente. */
const CANCELAVEIS = new Set(['interesse', 'solicitado', 'encaminhado', 'em_atendimento']);

/** Pedido em andamento: conta como "em aberto" no catálogo e barra o pedido repetido. */
const ABERTOS = [...CANCELAVEIS];

/** Para onde a operadora pode mover um pedido (interesse nunca avança: não houve consentimento). */
const TRANSICOES = {
  solicitado: ['encaminhado', 'em_atendimento', 'contratado', 'recusado'],
  encaminhado: ['em_atendimento', 'contratado', 'recusado'],
  em_atendimento: ['contratado', 'recusado'],
  contratado: [],
  recusado: [],
  interesse: [],
  cancelado: [],
};

const MAX_MENSAGEM = 1000;
const MAX_OBSERVACAO = 500;

/** SRV-2026-000123 (formato comum em regras/protocolo.js). */
const protocolo = (id, criadoEm) => protocoloComum('SRV', id, criadoEm);

const comProtocolo = (p) => ({
  ...p,
  // O que a tela pode oferecer: a regra mora aqui, o front só desenha os botões.
  proximos: (TRANSICOES[p.status] || []).map((chave) => ({ chave, rotulo: STATUS[chave] })),
  cancelavel: CANCELAVEIS.has(p.status),
  protocolo: protocolo(p.id, p.criado_em),
  servico_rotulo: (SERVICOS[p.servico] || {}).rotulo || p.servico,
  status_rotulo: STATUS[p.status] || p.status,
});

/** `{ servico, licitacao_id?, mensagem?, aceite_termo? }` → dados limpos ou `{ erro }`. */
function validarPedido(corpo) {
  const c = corpo || {};
  const servico = String(c.servico || '');
  if (!SERVICOS[servico]) return { erro: `Serviço inválido. Use: ${Object.keys(SERVICOS).join(', ')}.` };
  const mensagem = String(c.mensagem || '').trim();
  if (mensagem.length > MAX_MENSAGEM) return { erro: `A mensagem passou de ${MAX_MENSAGEM} letras.` };
  let licitacaoId = null;
  if (SERVICOS[servico].usaLicitacao && c.licitacao_id != null && c.licitacao_id !== '') {
    licitacaoId = Number(c.licitacao_id);
    if (!Number.isInteger(licitacaoId) || licitacaoId <= 0) return { erro: 'Licitação inválida.' };
  }
  return { dados: { servico, mensagem: mensagem || null, licitacaoId, aceite: String(c.aceite_termo || '') } };
}

/** O aceite precisa ser da versão vigente do termo — texto antigo não vale para dado novo. */
function aceiteValido(aceite) {
  return aceite === VERSAO_TERMO_PARCEIRO;
}

const textoOuNulo = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());

/**
 * O que vai ao parceiro: o mínimo para ele atender. Campo ausente fica `null` (a
 * tela e o e-mail mostram a lacuna) — nunca um valor inventado. Sem CPF, sem
 * documento do cofre, sem pontuação nem etapa do funil.
 */
function montarDados({ servico, empresa, usuario, licitacao, garantias, mensagem }) {
  const e = empresa || {};
  const dados = {
    empresa: {
      razao_social: textoOuNulo(e.razao_social),
      cnpj: textoOuNulo(e.cnpj),
      porte: textoOuNulo(e.natureza),
    },
    contato: { nome: textoOuNulo(usuario && usuario.nome), email: textoOuNulo(usuario && usuario.email) },
    mensagem: mensagem || null,
  };
  if (SERVICOS[servico] && SERVICOS[servico].usaLicitacao) {
    const l = licitacao;
    dados.licitacao = l
      ? {
          orgao: textoOuNulo(l.orgao_nome),
          modalidade: textoOuNulo(l.modalidade),
          numero: textoOuNulo(l.numero_compra),
          objeto: textoOuNulo(l.objeto) ? String(l.objeto).trim().slice(0, 600) : null,
          uf: textoOuNulo(l.uf),
          valor_estimado: l.valor_estimado == null ? null : Number(l.valor_estimado),
          abertura_propostas: l.abertura_propostas ? new Date(l.abertura_propostas).toISOString() : null,
        }
      : null;
    // `null` = o edital não foi lido; true/false só quando a leitura decidiu.
    dados.garantia_exigida = {
      proposta: garantias ? garantias.proposta : null,
      contrato: garantias ? garantias.contrato : null,
    };
  }
  return dados;
}

/** `garantia_proposta`/`garantia_contrato` das exigências → `{ proposta, contrato }` (true/false/null). */
function garantiasDasExigencias(linhas) {
  const por = (codigo) => {
    const l = (linhas || []).find((x) => x.codigo === codigo);
    if (!l || l.detectado === 'indefinido') return null;
    return l.detectado === 'sim';
  };
  return { proposta: por('garantia_proposta'), contrato: por('garantia_contrato') };
}

const brl = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const ou = (v) => (v == null || v === '' ? LACUNA : v);
const simNao = (v) => (v === true ? 'Sim' : v === false ? 'Não' : LACUNA);

/** Linhas legíveis do que será enviado — a tela mostra antes do aceite e o e-mail usa as mesmas. */
function linhasDosDados(dados) {
  const d = dados || {};
  const linhas = [
    ['Empresa', ou(d.empresa && d.empresa.razao_social)],
    ['CNPJ', ou(d.empresa && d.empresa.cnpj)],
    ['Porte', ou(d.empresa && d.empresa.porte)],
    ['Contato', ou(d.contato && d.contato.nome)],
    ['E-mail do contato', ou(d.contato && d.contato.email)],
  ];
  if (d.licitacao !== undefined) {
    const l = d.licitacao;
    if (l) {
      linhas.push(
        ['Órgão', ou(l.orgao)],
        ['Modalidade', ou(l.modalidade)],
        ['Número da compra', ou(l.numero)],
        ['Objeto', ou(l.objeto)],
        ['UF', ou(l.uf)],
        ['Valor estimado', l.valor_estimado == null ? LACUNA : brl(l.valor_estimado)],
        ['Abertura das propostas', l.abertura_propostas ? new Date(l.abertura_propostas).toLocaleString('pt-BR') : LACUNA]
      );
    } else {
      linhas.push(['Licitação', 'Não informada']);
    }
    linhas.push(
      ['Garantia de proposta exigida', simNao(d.garantia_exigida && d.garantia_exigida.proposta)],
      ['Garantia contratual exigida', simNao(d.garantia_exigida && d.garantia_exigida.contrato)]
    );
  }
  if (d.mensagem) linhas.push(['Mensagem do cliente', d.mensagem]);
  return linhas;
}

/** E-mail ao parceiro. A resposta vai direto ao cliente (`responderPara`). */
function montarEmail({ pedido, parceiro, dados }) {
  const rotulo = SERVICOS[pedido.servico].rotulo;
  const prot = protocolo(pedido.id, pedido.criado_em);
  const corpo = linhasDosDados(dados).map(([k, v]) => `${k}: ${v}`).join('\n');
  return {
    para: parceiro.email_pedidos,
    assunto: `[Painel de Licitações] Pedido ${prot} — ${rotulo}`,
    texto:
      `Olá, ${parceiro.nome}.\n\nUm cliente do Painel de Licitações pediu contato sobre: ${rotulo}.\n\n${corpo}\n\n` +
      `Protocolo: ${prot}\n` +
      `Os dados acima foram enviados com o consentimento do cliente (termo de vínculo, versão ${pedido.termo_versao}), ` +
      'somente para o atendimento deste pedido. Responda direto ao e-mail do contato; o painel não participa da contratação.',
    responderPara: dados && dados.contato ? dados.contato.email : null,
  };
}

/** Status ao criar: sem parceiro nada sai (interesse); com parceiro, depende de o e-mail ter saído. */
function statusInicial({ temParceiro, emailEnviado }) {
  if (!temParceiro) return 'interesse';
  return emailEnviado ? 'encaminhado' : 'solicitado';
}

/** `{ status?, valor_contratado?, observacao? }` da operadora → dados ou `{ erro }`. */
function validarAtualizacao(corpo, atual) {
  const c = corpo || {};
  const dados = {};
  if (c.status !== undefined) {
    if (!STATUS[c.status]) return { erro: 'Status inválido.' };
    if (c.status !== atual.status) {
      if (!(TRANSICOES[atual.status] || []).includes(c.status)) {
        return { erro: `Um pedido "${STATUS[atual.status]}" não vai para "${STATUS[c.status]}".` };
      }
      dados.status = c.status;
    }
  }
  const statusFinal = dados.status || atual.status;
  if (c.valor_contratado !== undefined && c.valor_contratado !== null && c.valor_contratado !== '') {
    const v = Number(c.valor_contratado);
    if (!Number.isFinite(v) || v < 0 || v > 1e12) return { erro: 'Valor contratado inválido.' };
    dados.valor_contratado = Math.round(v * 100) / 100;
  }
  if (statusFinal === 'contratado' && dados.valor_contratado === undefined && atual.valor_contratado == null) {
    return { erro: 'Informe o valor contratado para marcar o pedido como contratado.' };
  }
  if (dados.valor_contratado !== undefined && statusFinal !== 'contratado') {
    return { erro: 'O valor contratado só vale para um pedido contratado.' };
  }
  if (c.observacao !== undefined) {
    const o = String(c.observacao || '').trim();
    if (o.length > MAX_OBSERVACAO) return { erro: `A observação passou de ${MAX_OBSERVACAO} letras.` };
    dados.observacao = o || null;
  }
  return { dados };
}

/** `{ servico, nome, email_pedidos, site?, ativo? }` → dados ou `{ erro }`. */
function validarParceiro(corpo, parcial = false) {
  const c = corpo || {};
  const dados = {};
  if (!parcial || c.servico !== undefined) {
    if (!SERVICOS[c.servico]) return { erro: 'Serviço inválido.' };
    dados.servico = c.servico;
  }
  if (!parcial || c.nome !== undefined) {
    const nome = String(c.nome || '').replace(/\s+/g, ' ').trim();
    if (!nome || nome.length > 160) return { erro: 'Informe o nome do parceiro (até 160 letras).' };
    dados.nome = nome;
  }
  if (!parcial || c.email_pedidos !== undefined) {
    const email = String(c.email_pedidos || '').trim();
    if (!EMAIL.test(email) || email.length > 255) return { erro: 'E-mail de pedidos inválido.' };
    dados.email_pedidos = email;
  }
  if (c.site !== undefined) {
    const site = String(c.site || '').trim();
    if (site && !/^https?:\/\/[^\s]+$/i.test(site)) return { erro: 'O site precisa começar com http:// ou https://.' };
    dados.site = site || null;
  }
  if (c.ativo !== undefined) dados.ativo = c.ativo ? 1 : 0;
  return { dados };
}

/**
 * Vendas por serviço a partir de UMA linha por serviço, já agregada no banco
 * (`servico, interesses, pedidos, contratados, valor, organizacoes`) — a tabela inteira não vem
 * para o Node. Serviço sem nenhum pedido aparece zerado.
 */
function resumoDeVendas(linhas) {
  const porServico = new Map((linhas || []).map((l) => [l.servico, l]));
  return Object.entries(SERVICOS).map(([chave, s]) => {
    const l = porServico.get(chave) || {};
    return {
      servico: chave,
      rotulo: s.rotulo,
      interesses: Number(l.interesses || 0),
      pedidos: Number(l.pedidos || 0),
      contratados: Number(l.contratados || 0),
      valor_contratado: Math.round(Number(l.valor || 0) * 100) / 100,
      organizacoes_contratantes: Number(l.organizacoes || 0),
    };
  });
}

/**
 * Rodízio entre parceiros ativos do mesmo serviço: atende quem está há mais tempo sem
 * receber pedido (quem nunca recebeu vem primeiro); empate pelo cadastro mais antigo.
 * `candidatos`: `{ id, ultimo_pedido }` — o resto da linha é devolvido como veio.
 */
function escolherParceiro(candidatos) {
  const tempo = (c) => (c.ultimo_pedido ? new Date(c.ultimo_pedido).getTime() : 0);
  return [...(candidatos || [])].sort((a, b) => tempo(a) - tempo(b) || a.id - b.id)[0] || null;
}

/**
 * Aviso a quem registrou interesse quando surge parceiro. Diz o que aconteceu e o que fazer —
 * não manda dado a ninguém: o pedido de verdade só nasce com a prévia e o aceite do termo.
 * Não nomeia o parceiro: com rodízio o nome muda, e quem vale é o que a prévia mostrar.
 */
function montarAvisoInteresse({ servico, usuario, urlPublica }) {
  const rotulo = SERVICOS[servico].rotulo;
  const link = urlPublica ? `\n\nPara pedir: ${urlPublica} → Serviços → ${rotulo}.` : '\n\nPara pedir: entre no painel, em Serviços.';
  return {
    para: usuario.email,
    assunto: `[Painel de Licitações] Já há parceiro para ${rotulo}`,
    texto:
      `Olá, ${usuario.nome || 'tudo bem'}.\n\nVocê registrou interesse em "${rotulo}" e agora há parceiro habilitado.` +
      '\n\nSeu interesse continua só registrado: nenhum dado seu foi enviado. ' +
      'Para o pedido seguir, abra a tela de Serviços, confira a prévia do que será enviado e aceite o termo de vínculo.' + link,
  };
}

module.exports = {
  SERVICOS, STATUS, CANCELAVEIS, ABERTOS, VERSAO_TERMO_PARCEIRO, TERMO_VINCULO,
  protocolo, comProtocolo, validarPedido, aceiteValido, montarDados, garantiasDasExigencias,
  linhasDosDados, montarEmail, statusInicial, validarAtualizacao, validarParceiro, resumoDeVendas,
  escolherParceiro, montarAvisoInteresse,
};
