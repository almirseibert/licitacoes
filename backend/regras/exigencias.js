// Catálogo de exigências e detecção sensível a negação (seções 8.2 e 8.3).
//
// O erro mais caro aqui é marcar como exigido algo que o edital dispensa — você
// corre atrás de um documento que não precisava. Por isso cada código tem
// padrões positivos, e toda ocorrência é conferida contra uma janela de ±220
// caracteres em volta, procurando expressão de dispensa.
//
// Resultado por código:
//   'sim'        casou e não havia negação por perto
//   'negado'     casou com negação por perto → o edital dispensa
//   'nao'        nenhum padrão casou
//   'indefinido' o PDF não tinha texto (escaneado) — precisa de leitura manual

const JANELA = 220;

/**
 * Minúsculas e sem acento, **preservando o tamanho** do texto: os índices do
 * match precisam valer também no texto original, que é o que vai para a tela.
 */
function achatar(texto) {
  let saida = '';
  for (const caractere of String(texto)) {
    const base = caractere.normalize('NFD').replace(/[̀-ͯ]/g, '');
    saida += (base.length === 1 ? base : caractere).toLowerCase();
  }
  return saida;
}

// Expressões de dispensa. Valem para todos os códigos.
const NEGACOES = [
  /n[ãa]o\s+ser[áa]\s+(?:exigid|solicitad|necess[áa]ri)/,
  /n[ãa]o\s+ser[ãa]o\s+(?:exigid|solicitad|necess[áa]ri)/,
  /n[ãa]o\s+(?:se\s+)?exigir[áa]/,
  /n[ãa]o\s+h[áa]\s+exig[êe]ncia/,
  /n[ãa]o\s+haver[áa]\s+(?:a\s+)?exig[êe]ncia/,
  // "A não exigência de garantia decorre de…" e "Não haverá garantia da contratação"
  /n[ãa]o\s+exig[êe]ncia/,
  /n[ãa]o\s+haver[áa]\s+(?:a\s+)?garantia/,
  /n[ãa]o\s+ser[áa]\s+(?:a\s+)?(?:necess[áa]ri|obrigat[óo]ri)/,
  /fica\s+dispensad/,
  /ficam\s+dispensad/,
  /est[áa]\s+dispensad/,
  /[ée]\s+dispensad/,
  /dispensa(?:-se|da|do|r-se-[áa])/,
  /[ée]\s+facultativ/,
  /ser[áa]\s+facultativ/,
  /de\s+car[áa]ter\s+facultativ/,
  /desobrigad/,
  /n[ãa]o\s+se\s+aplica/,
  /isent[ao]s?\s+(?:de\s+|da\s+)?(?:apresenta[çc][ãa]o|exig[êe]ncia)/,
  /vedad[ao]\s+a\s+exig[êe]ncia/,
  // Justificativa de quem decidiu NÃO exigir: o verbo no condicional ("a
  // exigência de X poderia acarretar…") aparece sempre nesse contexto.
  /poderia\s+acarretar/,
  /sua\s+dispensa/,
  /dispensa\s+mostra-se/,
  /mostra-se\s+desnecess[áa]ri/,
  /n[ãa]o\s+se\s+mostra\s+necess[áa]ri/,
];

/**
 * Catálogo da seção 8.2 — os 34 códigos, na ordem em que fazem sentido na tela.
 * `grupo` organiza o checklist; `rotulo` é o que o usuário lê.
 */
const CATALOGO = [
  // ---------------------------------------------------------- habilitação jurídica
  {
    codigo: 'ato_constitutivo', grupo: 'Habilitação jurídica', rotulo: 'Contrato social e alterações',
    positivos: [/ato\s+constitutivo/, /contrato\s+social/, /estatuto\s+social/, /registro\s+comercial/],
  },
  {
    codigo: 'cnpj', grupo: 'Habilitação jurídica', rotulo: 'Cartão CNPJ',
    positivos: [
      /cart[ãa]o\s+cnpj/,
      /(?:prova|comprovante)\s+de\s+inscri[çc][ãa]o[^.]{0,80}(?:cnpj|cadastro\s+nacional\s+d[ae]\s+pessoa)/,
      /inscri[çc][ãa]o\s+no\s+cnpj/,
    ],
  },
  {
    codigo: 'objeto_social', grupo: 'Habilitação jurídica', rotulo: 'Objeto social compatível',
    positivos: [
      /objeto\s+social[^.]{0,80}compat[íi]vel/,
      /compatibilidade[^.]{0,60}objeto\s+social/,
      /ramo\s+de\s+atividade[^.]{0,60}(?:compat[íi]vel|pertinente)/,
      /atividade\s+econ[óo]mica[^.]{0,60}compat[íi]vel/,
    ],
  },
  {
    codigo: 'alvara', grupo: 'Habilitação jurídica', rotulo: 'Alvará de funcionamento',
    positivos: [/alvar[áa]\s+de\s+(?:funcionamento|localiza[çc][ãa]o)/, /alvar[áa]\s+sanit[áa]rio/],
  },
  {
    codigo: 'sicaf_crc', grupo: 'Habilitação jurídica', rotulo: 'SICAF ou CRC',
    // Dois cuidados: "CRC" solto é o Conselho Regional de Contabilidade do
    // contador que assina o balanço, e o SICAF aparece em todo edital como
    // cadastro **consultado** para checar sanções — nada disso é exigência.
    positivos: [
      /(?:inscri[çc][ãa]o|registro|cadastrad[ao]s?)\s+(?:no|junto\s+ao)\s+sicaf/,
      /dever[ãa]o?\s+estar\s+cadastrad[ao]s?[^.]{0,60}sicaf/,
      /\bsicaf\b[^.]{0,80}(?:substitui|dispensa\s+a\s+apresenta|ser[áa]\s+exigid)/,
      /certificado\s+de\s+registro\s+cadastral/,
      /\bcrc\b[^.]{0,50}(?:fornecedor|cadastral)/,
    ],
  },

  // ------------------------------------------------------------ regularidade fiscal
  {
    codigo: 'federal', grupo: 'Regularidade fiscal', rotulo: 'Certidão federal (RFB/PGFN)',
    positivos: [
      /tributos\s+federais/,
      /d[íi]vida\s+ativa\s+da\s+uni[ãa]o/,
      /receita\s+federal/,
      /certid[ãa]o\s+conjunta[^.]{0,60}federa/,
    ],
  },
  {
    codigo: 'estadual', grupo: 'Regularidade fiscal', rotulo: 'Certidão estadual',
    positivos: [
      /(?:certid[ãa]o|regularidade|d[ée]bitos|tributos)[^.]{0,60}estadua(?:l|is)/,
      /fazenda\s+estadual/,
      /d[íi]vida\s+ativa\s+do\s+estado/,
      /secretaria\s+(?:da|de)\s+fazenda\s+do\s+estado/,
      /\bsefaz\b/,
    ],
  },
  {
    codigo: 'municipal', grupo: 'Regularidade fiscal', rotulo: 'Certidão municipal',
    positivos: [
      /(?:certid[ãa]o|regularidade|d[ée]bitos|tributos)[^.]{0,60}municipa(?:l|is)/,
      /fazenda\s+municipal/,
      /d[íi]vida\s+ativa\s+municipal/,
    ],
  },
  {
    codigo: 'fgts', grupo: 'Regularidade fiscal', rotulo: 'FGTS (CRF)',
    positivos: [/\bfgts\b/, /fundo\s+de\s+garantia/, /certificado\s+de\s+regularidade\s+do\s+fgts/],
  },
  {
    codigo: 'cndt', grupo: 'Regularidade fiscal', rotulo: 'CNDT (trabalhista)',
    positivos: [/\bcndt\b/, /d[ée]bitos\s+trabalhistas/, /justi[çc]a\s+do\s+trabalho[^.]{0,40}certid[ãa]o/],
  },
  {
    codigo: 'simples', grupo: 'Regularidade fiscal', rotulo: 'Opção pelo Simples Nacional',
    // Só conta como exigência quando pedem o comprovante; a menção ao Simples
    // na cláusula de nota fiscal aparece em quase todo edital e não é exigência.
    positivos: [
      /(?:comprovante|comprova[çc][ãa]o|declara[çc][ãa]o|certid[ãa]o)[^.]{0,60}(?:op[çc][ãa]o\s+pelo\s+)?simples\s+nacional/,
      /(?:apresentar|apresenta[çc][ãa]o)[^.]{0,60}enquadramento[^.]{0,40}(?:me|epp|simples)/,
    ],
  },

  // -------------------------------------------------------- qualificação econômica
  {
    codigo: 'falencia', grupo: 'Qualificação econômica', rotulo: 'Certidão de falência',
    positivos: [/fal[êe]ncia/, /recupera[çc][ãa]o\s+judicial/, /concordata/],
  },
  {
    codigo: 'balanco', grupo: 'Qualificação econômica', rotulo: 'Balanço patrimonial',
    positivos: [/balan[çc]o\s+patrimonial/, /demonstra[çc][õo]es\s+cont[áa]beis/, /demonstra[çc][õo]es\s+financeiras/],
  },
  {
    codigo: 'indices', grupo: 'Qualificação econômica', rotulo: 'Índices contábeis',
    positivos: [
      /[íi]ndice\s+de\s+liquidez/,
      /liquidez\s+(?:geral|corrente)/,
      /solv[êe]ncia\s+geral/,
      /[íi]ndices\s+cont[áa]beis/,
    ],
  },
  {
    codigo: 'pl_minimo', grupo: 'Qualificação econômica', rotulo: 'Patrimônio líquido ou capital mínimo',
    positivos: [
      /patrim[ôo]nio\s+l[íi]quido\s+m[íi]nimo/,
      /capital\s+social\s+m[íi]nimo/,
      /capital\s+social[^.]{0,40}(?:n[ãa]o\s+inferior|igual\s+ou\s+superior)/,
      /patrim[ôo]nio\s+l[íi]quido[^.]{0,40}(?:n[ãa]o\s+inferior|10%|dez\s+por\s+cento)/,
    ],
  },
  {
    codigo: 'garantia_proposta', grupo: 'Qualificação econômica', rotulo: 'Garantia de proposta',
    positivos: [
      /(?:exigid|exigir|apresenta|prestar|recolh)[^.]{0,60}garantia\s+(?:de|da)\s+proposta/,
      /garantia\s+(?:de|da)\s+proposta[^.]{0,80}(?:ser[áa]|dever[áa]|corresponder|equivalente|1%|um\s+por\s+cento)/,
      /garantia\s+de\s+participa[çc][ãa]o[^.]{0,60}(?:ser[áa]|dever[áa]|exigid)/,
    ],
  },
  {
    codigo: 'garantia_contrato', grupo: 'Qualificação econômica', rotulo: 'Garantia contratual',
    positivos: [/garantia\s+contratual/, /garantia\s+de\s+execu[çc][ãa]o/, /garantia\s+do\s+contrato/],
  },

  // ---------------------------------------------------------- qualificação técnica
  {
    codigo: 'atestado', grupo: 'Qualificação técnica', rotulo: 'Atestado de capacidade técnica',
    positivos: [/atestado\s+de\s+capacidade\s+t[ée]cnica/, /atestado[s]?\s+de\s+(?:desempenho|aptid[ãa]o)/, /comprova[çc][ãa]o\s+de\s+aptid[ãa]o/],
  },
  {
    codigo: 'amostra_poc', grupo: 'Qualificação técnica', rotulo: 'Amostra ou prova de conceito',
    positivos: [/apresenta[çc][ãa]o\s+de\s+amostra/, /prova\s+de\s+conceito/, /\bpoc\b/, /amostra\s+do\s+produto/],
  },
  {
    codigo: 'visita', grupo: 'Qualificação técnica', rotulo: 'Visita técnica',
    positivos: [/visita\s+t[ée]cnica/, /vistoria\s+t[ée]cnica/, /visita\s+ao\s+local/],
  },
  {
    codigo: 'profissional', grupo: 'Qualificação técnica', rotulo: 'Profissional habilitado no quadro',
    // "responsável técnico" solto casa com a vedação padrão do autor do projeto,
    // que é impedimento de participar — não exigência de ter profissional.
    positivos: [
      /profissional[^.]{0,80}(?:quadro\s+permanente|quadro\s+societ[áa]rio|quadro\s+funcional)/,
      /(?:indica[çc][ãa]o|comprova[çc][ãa]o|apresenta[çc][ãa]o)[^.]{0,60}respons[áa]vel\s+t[ée]cnico/,
      /respons[áa]vel\s+t[ée]cnico[^.]{0,60}(?:dever[áa]|comprovar|pertencer|integrar)/,
      /equipe\s+t[ée]cnica\s+m[íi]nima/,
    ],
  },
  {
    codigo: 'conselho', grupo: 'Qualificação técnica', rotulo: 'Registro em conselho',
    // Sem /conselho regional/ nem /crc/ soltos: em quase todo edital isso é o
    // registro do contador que assina o balanço, não exigência do licitante.
    positivos: [
      /\bcrea\b/,
      /\bcau\b/,
      /\bcra\b/,
      /registro\s+(?:ou\s+inscri[çc][ãa]o\s+)?(?:na|no)\s+(?:entidade\s+profissional|conselho\s+de\s+classe)/,
      /conselho\s+regional\s+de\s+(?:engenharia|arquitetura|administra[çc][ãa]o|qu[íi]mica|medicina)/,
    ],
  },
  {
    codigo: 'anatel', grupo: 'Qualificação técnica', rotulo: 'Homologação Anatel',
    positivos: [/anatel/, /homologa[çc][ãa]o[^.]{0,40}ag[êe]ncia\s+nacional\s+de\s+telecomunica/],
  },
  {
    codigo: 'inpi_abes', grupo: 'Qualificação técnica', rotulo: 'Registro de software (INPI/ABES)',
    positivos: [/\binpi\b/, /\babes\b/, /registro\s+do\s+software/],
  },
  {
    codigo: 'fabricante', grupo: 'Qualificação técnica', rotulo: 'Carta do fabricante',
    positivos: [/carta\s+(?:de\s+)?(?:credenciamento|solidariedade)[^.]{0,40}fabricante/, /declara[çc][ãa]o\s+do\s+fabricante/, /autoriza[çc][ãa]o\s+do\s+fabricante/],
  },
  {
    codigo: 'catalogo', grupo: 'Qualificação técnica', rotulo: 'Catálogo ou folder técnico',
    positivos: [/cat[áa]logo\s+t[ée]cnico/, /folder\s+t[ée]cnico/, /prospecto\s+t[ée]cnico/, /ficha\s+t[ée]cnica\s+do\s+produto/],
  },

  // ------------------------------------------------------------------- declarações
  {
    codigo: 'menor', grupo: 'Declarações', rotulo: 'Não emprego de menor',
    positivos: [/trabalho\s+(?:do\s+)?menor/, /menor\s+de\s+(?:dezoito|18)/, /inciso\s+xxxiii\s+do\s+art/],
  },
  {
    codigo: 'pcd', grupo: 'Declarações', rotulo: 'Reserva de vagas para PcD',
    positivos: [/pessoa\s+com\s+defici[êe]ncia/, /reserva\s+de\s+cargos[^.]{0,60}defici/, /\bpcd\b/],
  },
  {
    codigo: 'degradante', grupo: 'Declarações', rotulo: 'Trabalho degradante ou forçado',
    positivos: [/trabalho\s+(?:degradante|for[çc]ado|escravo)/, /condi[çc][ãa]o\s+an[áa]loga\s+[àa]\s+de\s+escravo/],
  },
  {
    codigo: 'proposta_indep', grupo: 'Declarações', rotulo: 'Proposta independente',
    positivos: [/proposta\s+independente/, /elabora[çc][ãa]o\s+independente\s+de\s+proposta/],
  },
  {
    codigo: 'vinculo_servidor', grupo: 'Declarações', rotulo: 'Sem vínculo com servidor',
    positivos: [/v[íi]nculo[^.]{0,60}servidor/, /parentesco[^.]{0,60}servidor/, /n[ãa]o\s+possui[^.]{0,60}servidor\s+p[úu]blico/],
  },
  {
    codigo: 'lgpd', grupo: 'Declarações', rotulo: 'Cláusula de LGPD',
    positivos: [/\blgpd\b/, /lei\s+geral\s+de\s+prote[çc][ãa]o\s+de\s+dados/, /lei\s+n?[º°]?\s*13\.?709/],
  },

  // ----------------------------------------------------------------- participação
  {
    codigo: 'exclusivo_me', grupo: 'Participação', rotulo: 'Exclusivo para ME/EPP',
    positivos: [
      /exclusiv[ao][^.]{0,60}(?:microempresa|me\/epp)/,
      /participa[çc][ãa]o\s+exclusiva[^.]{0,60}(?:microempresa|epp)/,
      /art(?:igo)?\.?\s*48[^.]{0,20}inciso\s+i\b/,
    ],
  },
  {
    codigo: 'assinatura_digital', grupo: 'Participação', rotulo: 'Assinatura digital',
    // Precisa estar ligada a assinar proposta ou documento: em licitação de
    // software, "certificado digital" costuma ser requisito do sistema comprado.
    // Só conta quando é obrigação do licitante. Sem o verbo de obrigação, isso
    // casa com o carimbo de assinatura do próprio PDF e com requisito do
    // sistema que está sendo comprado.
    positivos: [
      /(?:proposta|documento|declara[çc][ãa]o|contrato)s?[^.]{0,80}dever[ãa]?[óo]?\s*ser(?:em)?\s+assinad[ao]s?\s+digitalmente/,
      /assinatura\s+digital[^.]{0,80}(?:obrigat[óo]ri|ser[áa]\s+exigid|sob\s+pena)/,
      /dever[áa]\s+(?:possuir|dispor\s+de|utilizar)\s+certificado\s+digital/,
      /assinad[ao]s?\s+digitalmente[^.]{0,60}(?:sob\s+pena|obrigatori|icp-?brasil)/,
    ],
  },
];

const PORCODIGO = new Map(CATALOGO.map((e) => [e.codigo, e]));

function temNegacaoPerto(textoAchatado, inicio, fim) {
  const janela = textoAchatado.slice(Math.max(0, inicio - JANELA), fim + JANELA);
  return NEGACOES.some((padrao) => padrao.test(janela));
}

/**
 * Procura todos os códigos nas páginas lidas.
 *
 * @param {Array<{num:number, texto:string, arquivoId:number}>} paginas
 * @returns {Array<{codigo, detectado, trecho, pagina, arquivo_id}>}
 */
function detectar(paginas) {
  const achados = new Map();

  for (const pagina of paginas) {
    if (!pagina.texto) continue;
    const achatado = achatar(pagina.texto);

    for (const exigencia of CATALOGO) {
      // Um 'sim' em qualquer página encerra o código: edital que dispensa num
      // item e exige noutro, exige. O 'negado' só fica se nada mais casar.
      if ((achados.get(exigencia.codigo) || {}).detectado === 'sim') continue;

      for (const padrao of exigencia.positivos) {
        const regex = new RegExp(padrao.source, 'g');
        let encontro;

        while ((encontro = regex.exec(achatado)) !== null) {
          const inicio = encontro.index;
          const fim = inicio + encontro[0].length;
          const negado = temNegacaoPerto(achatado, inicio, fim);

          if (!negado || !achados.has(exigencia.codigo)) {
            achados.set(exigencia.codigo, {
              codigo: exigencia.codigo,
              detectado: negado ? 'negado' : 'sim',
              trecho: recortar(pagina.texto, inicio, fim),
              pagina: pagina.num,
              arquivo_id: pagina.arquivoId,
            });
          }
          if (!negado) break;
        }
        if ((achados.get(exigencia.codigo) || {}).detectado === 'sim') break;
      }
    }
  }

  return CATALOGO.map((exigencia) =>
    achados.get(exigencia.codigo) || {
      codigo: exigencia.codigo,
      detectado: 'nao',
      trecho: null,
      pagina: null,
      arquivo_id: null,
    }
  );
}

/** Recorte legível em volta do match — é o que aparece ao passar o mouse. */
function recortar(texto, inicio, fim) {
  const antes = Math.max(0, inicio - 160);
  const depois = Math.min(texto.length, fim + 200);
  const bruto = texto.slice(antes, depois).replace(/\s+/g, ' ').trim();
  return `${antes > 0 ? '…' : ''}${bruto}${depois < texto.length ? '…' : ''}`.slice(0, 900);
}

module.exports = { CATALOGO, PORCODIGO, detectar, achatar, NEGACOES, JANELA };
