// Serviços complementares por parceria (Seção 18 do PLANO_SAAS_CONLICITACAO.md) —
// validação do pedido, o que vai ao parceiro, o texto do e-mail e as transições de
// status, sem banco e sem rede.
const { SERVICOS, VERSAO_TERMO_PARCEIRO, TERMO_VINCULO } = require('../config/dados/servicos');
const { LACUNA } = require('../config/dados/legal');

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

/** SRV-2026-000123: o ano é o do pedido, o número é o id. */
function protocolo(id, criadoEm) {
  const ano = new Date(criadoEm || Date.now()).getFullYear();
  return `SRV-${ano}-${String(id).padStart(6, '0')}`;
}

const comProtocolo = (p) => ({
  ...p,
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

/** `{ status?, valor_contratado?, observacao?, parceiro_id? }` da operadora → dados ou `{ erro }`. */
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
    if (o.length > 500) return { erro: 'A observação passou de 500 letras.' };
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) return { erro: 'E-mail de pedidos inválido.' };
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

/** Vendas por serviço: pedidos, contratados e o valor fechado — o aceite da seção 18. */
function resumoDeVendas(linhas) {
  const por = {};
  for (const chave of Object.keys(SERVICOS)) {
    por[chave] = { servico: chave, rotulo: SERVICOS[chave].rotulo, pedidos: 0, interesses: 0, contratados: 0, valor_contratado: 0, organizacoes_contratantes: 0 };
  }
  const contratantes = {};
  for (const l of linhas || []) {
    const r = por[l.servico];
    if (!r) continue;
    if (l.status === 'interesse') r.interesses += 1;
    else if (l.status !== 'cancelado') r.pedidos += 1;
    if (l.status === 'contratado') {
      r.contratados += 1;
      r.valor_contratado += Number(l.valor_contratado || 0);
      (contratantes[l.servico] = contratantes[l.servico] || new Set()).add(l.organizacao_id);
    }
  }
  for (const [servico, orgs] of Object.entries(contratantes)) por[servico].organizacoes_contratantes = orgs.size;
  return Object.values(por).map((r) => ({ ...r, valor_contratado: Math.round(r.valor_contratado * 100) / 100 }));
}

module.exports = {
  SERVICOS, STATUS, TRANSICOES, CANCELAVEIS, VERSAO_TERMO_PARCEIRO, TERMO_VINCULO, MAX_MENSAGEM,
  protocolo, comProtocolo, validarPedido, aceiteValido, montarDados, garantiasDasExigencias,
  linhasDosDados, montarEmail, statusInicial, validarAtualizacao, validarParceiro, resumoDeVendas,
};
