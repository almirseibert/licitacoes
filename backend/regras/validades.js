// Validades padrão dos documentos da empresa (seção 9.2) e o semáforo da tela.
//
// O prazo é só uma sugestão ao cadastrar: quem manda é a data impressa na
// certidão, que o usuário corrige na tela. Guardar o padrão evita digitar a
// mesma coisa toda vez e, principalmente, evita esquecer de preencher.

const PADROES = {
  federal: { dias: 180, titulo: 'Certidão federal (RFB/PGFN)', renovar: 'https://servicos.receita.fazenda.gov.br' },
  estadual: { dias: 90, titulo: 'Certidão estadual', renovar: 'site da Sefaz do seu estado' },
  municipal: { dias: 90, titulo: 'Certidão municipal', renovar: 'site da prefeitura da sede' },
  fgts: { dias: 30, titulo: 'CRF do FGTS', renovar: 'https://consulta-crf.caixa.gov.br' },
  cndt: { dias: 180, titulo: 'CNDT (trabalhista)', renovar: 'https://cndt-certidao.tst.jus.br' },
  falencia: { dias: 90, titulo: 'Certidão de falência', renovar: 'distribuidor do foro da sede' },
  ato_constitutivo: { dias: null, titulo: 'Contrato social consolidado', renovar: 'substituir a cada alteração' },
  balanco: { dias: null, titulo: 'Balanço patrimonial', renovar: 'trocar até 30 de abril, com o exercício anterior' },
  simples: { dias: null, titulo: 'Opção pelo Simples Nacional', renovar: 'reemitir no início do ano' },
  cnpj: { dias: 90, titulo: 'Cartão CNPJ', renovar: 'https://solucoes.receita.fazenda.gov.br/servicos/cnpjreva' },

  // Sem prazo legal, mas úteis no cofre.
  alvara: { dias: 365, titulo: 'Alvará de funcionamento', renovar: 'prefeitura da sede' },
  atestado: { dias: null, titulo: 'Atestado de capacidade técnica', renovar: 'pedir ao cliente' },
  catalogo: { dias: null, titulo: 'Catálogo técnico', renovar: null },
  indices: { dias: null, titulo: 'Cálculo dos índices contábeis', renovar: 'o contador refaz com o balanço novo' },
  conselho: { dias: 365, titulo: 'Registro em conselho', renovar: null },
  anatel: { dias: null, titulo: 'Homologação Anatel', renovar: null },
  inpi_abes: { dias: null, titulo: 'Registro de software (INPI/ABES)', renovar: null },
  fabricante: { dias: null, titulo: 'Carta do fabricante', renovar: 'pedir ao fabricante' },
  sicaf_crc: { dias: 365, titulo: 'SICAF ou CRC', renovar: null },
  objeto_social: { dias: null, titulo: 'Comprovação de objeto social', renovar: null },
  profissional: { dias: null, titulo: 'Vínculo do profissional', renovar: null },
};

const AVISOS_DIAS = [30, 15, 3]; // seção 9.2: o job diário alerta nesses marcos

/** Sugestão de validade a partir da emissão. Devolve `null` quando não há prazo. */
function sugerirValidade(codigo, emitidoEm) {
  const padrao = PADROES[codigo];
  if (!padrao || !padrao.dias || !emitidoEm) return null;
  const base = emitidoEm instanceof Date ? new Date(emitidoEm) : new Date(emitidoEm);
  if (Number.isNaN(base.getTime())) return null;
  base.setDate(base.getDate() + padrao.dias);
  return base.toISOString().slice(0, 10);
}

/**
 * Semáforo da seção 9.1.
 *   verde    válido por mais de 30 dias, ou sem validade formal
 *   amarelo  vence em até 30 dias
 *   vermelho vencido
 */
function semaforo(validoAte, agora = new Date()) {
  if (!validoAte) return { cor: 'verde', dias: null, texto: 'sem validade formal' };

  const fim = validoAte instanceof Date ? validoAte : new Date(validoAte);
  if (Number.isNaN(fim.getTime())) return { cor: 'verde', dias: null, texto: 'sem validade formal' };

  const dias = Math.floor((fim.getTime() - agora.getTime()) / 86400000);
  if (dias < 0) return { cor: 'vermelho', dias, texto: `vencida há ${Math.abs(dias)} dias` };
  if (dias === 0) return { cor: 'vermelho', dias, texto: 'vence hoje' };
  if (dias <= 30) return { cor: 'amarelo', dias, texto: `vence em ${dias} dias` };
  return { cor: 'verde', dias, texto: `válida por ${dias} dias` };
}

function tituloPadrao(codigo) {
  return (PADROES[codigo] && PADROES[codigo].titulo) || codigo;
}

module.exports = { PADROES, AVISOS_DIAS, sugerirValidade, semaforo, tituloPadrao };
