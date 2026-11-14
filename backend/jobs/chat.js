// Job `monitorar_chat` (Seção 6 do plano SaaS) — lê o chat dos pregões que a
// organização pediu para acompanhar e avisa quando o pregoeiro escreve.
//
// Conduta (seção 5.4, vale aqui sem exceção): só onde o portal publica o chat
// para quem não está logado; sem autenticar, sem guardar senha, sem resolver
// CAPTCHA. Portal que bloqueia vira `bloqueado` e é consultado de novo só de
// seis em seis horas, para o painel perceber se ele mudar — não se força.
//
// O ritmo é de uma leitura a cada 5 minutos por chat DENTRO da janela da sessão
// (uma hora antes até três dias depois); fora dela o chat espera ou se encerra.
// Quem limita as requisições é `servicos/http.js`: 4 simultâneas, 1,5 s por domínio.
const fila = require('../servicos/fila');
const adaptadores = require('../adaptadores');
const servico = require('../servicos/chat');
const regras = require('../regras/chat');

function objetoJson(valor) {
  if (valor && typeof valor === 'object') return valor;
  try {
    return JSON.parse(valor || '{}') || {};
  } catch {
    return {};
  }
}

/**
 * Uma leitura de um chat. Devolve `{ resultado, aviso, mensagens, link }` em
 * qualquer caso — erro de portal não escapa: vira status gravado no monitor.
 */
async function lerChat(devido) {
  let adaptador;
  try {
    adaptador = adaptadores.obter(devido.adaptador);
  } catch (erro) {
    return { resultado: 'erro', aviso: erro.message };
  }
  if (typeof adaptador.listarMensagens !== 'function') {
    return {
      resultado: 'sem_consulta',
      aviso: `A fonte desta licitação (${adaptador.nome || devido.adaptador}) não publica o chat da sessão: abra o chat no portal de disputa.`,
    };
  }

  try {
    const lido = await adaptador.listarMensagens({
      config: objetoJson(devido.fonte_config),
      chaveExterna: devido.chave_externa,
      link: devido.link_disputa || devido.link_portal,
    });
    return { resultado: 'ok', mensagens: lido.mensagens || [], link: lido.link || null };
  } catch (erro) {
    if (erro.bloqueado) return { resultado: 'bloqueado', aviso: erro.message, link: erro.link || null };
    if (erro.semConsulta) return { resultado: 'sem_consulta', aviso: erro.message };
    return { resultado: 'erro', aviso: `Não foi possível ler o chat agora: ${erro.message}` };
  }
}

/** Uma checagem de um chat: janela, leitura, gravação, alerta e próximo passo. */
async function checar(devido, { agora = new Date() } = {}) {
  const { organizacao_id: organizacaoId, licitacao_id: licitacaoId } = devido;
  const janela = regras.janelaDoChat(devido, agora);

  if (janela.estado === 'depois') {
    await servico.encerrar(organizacaoId, licitacaoId, agora);
    return { licitacao_id: licitacaoId, status: 'encerrado', novas: 0 };
  }
  if (janela.estado === 'antes') {
    // Ainda não é hora: volta quando a janela abrir, sem tocar no portal.
    await servico.registrarLeitura({
      organizacaoId,
      licitacaoId,
      agora,
      passo: { status: 'aguardando', aviso: 'Aguardando o início da sessão.', proxima: janela.inicio },
    });
    return { licitacao_id: licitacaoId, status: 'aguardando', novas: 0 };
  }

  const leitura = await lerChat(devido);
  let novas = [];
  if (leitura.resultado === 'ok') {
    novas = await servico.gravarMensagens({ organizacaoId, licitacaoId, mensagens: leitura.mensagens });
    if (novas.length) {
      await servico.alertarNovas({ organizacaoId, licitacaoId, novas, orgao: devido.orgao_nome });
    }
  }

  await servico.registrarLeitura({
    organizacaoId,
    licitacaoId,
    agora,
    link: leitura.link,
    passo: regras.proximoPasso(leitura, janela, agora),
  });
  return { licitacao_id: licitacaoId, status: leitura.resultado, novas: novas.length };
}

/** Uma rodada: lê o que está na hora, num ritmo que a seção 5.4 aguenta. */
async function monitorarChat({ limite = 30 } = {}) {
  const devidos = await servico.devidos({ limite });
  const resumo = { checados: 0, novas: 0, bloqueados: 0, erros: [] };
  for (const devido of devidos) {
    try {
      const r = await checar(devido);
      resumo.checados += 1;
      resumo.novas += r.novas;
      if (r.status === 'bloqueado') resumo.bloqueados += 1;
    } catch (erro) {
      // Falha de banco ou de código: adia este e segue com os outros.
      resumo.erros.push(`licitação ${devido.licitacao_id}: ${erro.message}`);
    }
  }
  return resumo;
}

function registrarNaFila() {
  fila.registrar('monitorar_chat', (payload) => monitorarChat(payload || {}));
}

module.exports = { monitorarChat, checar, lerChat, registrarNaFila };
