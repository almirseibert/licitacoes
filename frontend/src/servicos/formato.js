// Formatação em português do Brasil. Valores e prazos sempre em mono (seção 15).
export function moeda(valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  return Number(valor).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

export function moedaExata(valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function dataHora(valor) {
  if (!valor) return '—';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function data(valor) {
  if (!valor) return '—';

  // Data pura do MySQL ('2026-10-10') vira meia-noite UTC no construtor do
  // Date, e no fuso de Brasília isso é o dia anterior: 10/10 aparecia como
  // 09/10. Data sem hora é dia de calendário, não instante — é montada campo a
  // campo, no fuso local.
  const puro = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(valor));
  const d = puro ? new Date(Number(puro[1]), Number(puro[2]) - 1, Number(puro[3])) : new Date(valor);

  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

/** Contagem regressiva até o fim das propostas. */
export function restante(fim) {
  if (!fim) return { texto: 'sem prazo', horas: null, critico: false, encerrado: false };
  const alvo = new Date(fim).getTime();
  if (Number.isNaN(alvo)) return { texto: 'sem prazo', horas: null, critico: false, encerrado: false };

  const ms = alvo - Date.now();
  if (ms <= 0) return { texto: 'encerrada', horas: 0, critico: false, encerrado: true };

  const horas = ms / 3600000;
  const dias = Math.floor(horas / 24);
  const h = Math.floor(horas % 24);
  const m = Math.floor((ms % 3600000) / 60000);

  const texto = dias > 0 ? `${dias}d ${h}h` : h > 0 ? `${h}h ${m}min` : `${m}min`;
  return { texto, horas, critico: horas < 24, encerrado: false };
}

/** Faixas da seção 6: 80+ alta, 55-79 analisar, 30-54 talvez, <30 baixa. */
export function faixaPontuacao(pontuacao) {
  if (pontuacao >= 80) return { chave: 'alta', rotulo: 'Prioridade alta', cor: '#22D3EE' };
  if (pontuacao >= 55) return { chave: 'analisar', rotulo: 'Vale analisar', cor: '#E5E7EB' };
  if (pontuacao >= 30) return { chave: 'talvez', rotulo: 'Talvez', cor: '#94A3B8' };
  return { chave: 'baixa', rotulo: 'Baixa', cor: '#475569' };
}

export function resumir(texto, tamanho = 160) {
  if (!texto) return '—';
  const limpo = String(texto).replace(/\s+/g, ' ').trim();
  return limpo.length > tamanho ? `${limpo.slice(0, tamanho)}…` : limpo;
}
