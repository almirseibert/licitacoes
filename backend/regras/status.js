// Status das ferramentas (Seção 17 do PLANO_SAAS_CONLICITACAO.md) — como cada
// sinal vira "no ar", "atrasado" ou "parado", sem banco. A tela só pinta a cor.
//
// Limites pensados para o worker de hoje: um relógio de 30 minutos e um batimento
// por minuto, então 3 minutos sem sinal já é suspeito.

const MINUTOS_BATIMENTO_OK = 3;
const MINUTOS_BATIMENTO_ATRASADO = 15;
const MINUTOS_FILA_OK = 30;
const MINUTOS_FILA_ATRASADA = 180;
// A coleta tem intervalo por fonte (`intervalo_horas`, padrão 6). O limite acompanha
// o da fonte mais frequente: "ok" é um intervalo mais uma hora de folga; passando
// do dobro disso, está atrasada; passou mais, parada.
const INTERVALO_COLETA_PADRAO_HORAS = 2;

const minutosDesde = (quando, agora) => (quando ? (new Date(agora).getTime() - new Date(quando).getTime()) / 60000 : null);

function worker(ultimoBatimento, agora = new Date()) {
  const min = minutosDesde(ultimoBatimento, agora);
  if (min === null) return { nivel: 'parado', mensagem: 'O worker nunca deu sinal de vida. Sem ele não há coleta, boletim nem avisos.' };
  if (min <= MINUTOS_BATIMENTO_OK) return { nivel: 'ok', mensagem: 'O worker está de pé.' };
  const quando = min < 60 ? `${Math.round(min)} min` : `${Math.round(min / 60)} h`;
  if (min <= MINUTOS_BATIMENTO_ATRASADO) return { nivel: 'atrasado', mensagem: `O worker não dá sinal há ${quando}.` };
  return { nivel: 'parado', mensagem: `O worker está parado há ${quando}. Coleta, boletim e avisos não estão rodando.` };
}

/** `fila` = { fila, rodando, erro }, `maisAntigaMin` = há quanto tempo a tarefa mais velha espera. */
function fila(contagem, maisAntigaMin) {
  const c = contagem || {};
  const espera = Number(c.fila || 0);
  const erros = Number(c.erro || 0);
  if (!espera) {
    return { nivel: 'ok', mensagem: erros ? `Fila vazia; ${erros} tarefa(s) com erro registrado.` : 'Fila vazia.' };
  }
  const min = Number(maisAntigaMin || 0);
  if (min <= MINUTOS_FILA_OK) return { nivel: 'ok', mensagem: `${espera} tarefa(s) na fila.` };
  if (min <= MINUTOS_FILA_ATRASADA) return { nivel: 'atrasado', mensagem: `${espera} tarefa(s) na fila; a mais antiga espera há ${Math.round(min)} min.` };
  return { nivel: 'parado', mensagem: `A fila não anda: ${espera} tarefa(s), a mais antiga há ${Math.round(min / 60)} h.` };
}

/** `fontes` = [{ nome, ultima_coleta, ultimo_status, ativa, intervalo_horas }]. */
function coleta(fontes, agora = new Date()) {
  const ativas = (fontes || []).filter((f) => f.ativa);
  if (!ativas.length) return { nivel: 'desligado', mensagem: 'Nenhuma fonte de coleta ativa.' };
  const datas = ativas.map((f) => f.ultima_coleta).filter(Boolean).map((d) => new Date(d).getTime());
  const intervalos = ativas.map((f) => Number(f.intervalo_horas)).filter((n) => n > 0);
  const horasOk = (intervalos.length ? Math.min(...intervalos) : INTERVALO_COLETA_PADRAO_HORAS) + 1;
  const horasAtrasada = horasOk * 2;
  const bloqueadas = ativas.filter((f) => String(f.ultimo_status || '').toLowerCase().startsWith('bloqueado')).length;
  if (!datas.length) return { nivel: 'atrasado', mensagem: 'A coleta ainda não rodou.', bloqueadas };
  const horas = (new Date(agora).getTime() - Math.max(...datas)) / 3600000;
  const quando = horas < 1 ? `${Math.max(0, Math.round(horas * 60))} min` : `${Math.round(horas)} h`;
  const sufixo = bloqueadas ? ` ${bloqueadas} fonte(s) bloqueada(s) pelo portal.` : '';
  if (horas <= horasOk) return { nivel: 'ok', mensagem: `Última coleta há ${quando}.${sufixo}`, bloqueadas };
  if (horas <= horasAtrasada) return { nivel: 'atrasado', mensagem: `Última coleta há ${quando}.${sufixo}`, bloqueadas };
  return { nivel: 'parado', mensagem: `A coleta não roda há ${quando}.${sufixo}`, bloqueadas };
}

function recurso(ligado, nome, comoLigar) {
  return ligado
    ? { nivel: 'ok', mensagem: `${nome} está ligado.` }
    : { nivel: 'desligado', mensagem: `${nome} está desligado${comoLigar ? `: ${comoLigar}` : ''}.` };
}

/** O pior nível entre os itens vale para o painel todo (desligado não derruba o geral). */
function geral(itens) {
  const niveis = itens.map((i) => i.nivel).filter((n) => n !== 'desligado');
  for (const n of ['parado', 'atrasado']) if (niveis.includes(n)) return n;
  return 'ok';
}

module.exports = { worker, fila, coleta, recurso, geral };
