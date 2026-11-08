// Adaptador `generico_html` (seção 5.3) — portal sem API, configurado pela tela.
//
// A ideia: boa parte dos portais municipais não tem API, mas publica a lista de
// licitações numa tabela HTML estática. Em vez de um arquivo de código por
// portal, este adaptador lê a lista com um seletor CSS e um mapa de campos que
// você cadastra na tela de Fontes — sem tocar em código, que é o que a seção
// 5.3 pede.
//
// Duas divergências da spec, as duas registradas aqui porque a spec manda:
//
// 1. A spec cita Playwright para portal 100% JavaScript. Não entra: o painel
//    não tem Chromium na imagem, e seria mais de 300 MB para um caso que o
//    adaptador não consegue nem detectar sem baixar o navegador. Portal que
//    carrega a lista por JavaScript cai no mesmo tratamento do Compras.gov.br
//    (seção 5.4): `ultimo_status = 'bloqueado'`, com a razão em português e o
//    link para conferir na mão. Não se força.
// 2. `robots.txt` é consultado de verdade antes da primeira busca de cada
//    domínio, e o resultado fica em cache no processo. A spec pede respeitá-lo
//    (seção 5.4, item 1) e não dizia como; sem isto, "respeitar" seria só
//    comentário.
const cheerio = require('cheerio');
const { buscar, buscarTexto } = require('../servicos/http');

// O nome que o painel usa para se identificar, e pelo qual procura o grupo que
// vale para ele no robots.txt (seção 5.4, itens 1 e 3).
const AGENTE = 'StudioMythosLicitacoes';

// O que faz uma página parecer uma aplicação JavaScript em vez de uma lista:
// corpo quase vazio com um ponto de montagem e um bundle.
const MARCAS_DE_JAVASCRIPT = [
  /<div[^>]+id=["'](root|app|__nuxt|__next)["']/i,
  /ng-app|data-reactroot|v-cloak/i,
];

class PortalBloqueado extends Error {
  constructor(mensagem, link) {
    super(mensagem);
    this.name = 'PortalBloqueado';
    this.bloqueado = true;
    this.link = link || null;
  }
}

// robots.txt por domínio, resolvido uma vez por processo. `null` = ainda não
// consultado; `true`/`false` = pode ou não pode.
const permissao = new Map();

/**
 * Lê o robots.txt do domínio e decide se o caminho pode ser buscado.
 *
 * Leitura deliberadamente simples: só os `Disallow` do grupo que vale para nós
 * — `User-agent: *` e o nosso próprio nome. Não implementa `Allow` com
 * prioridade de comprimento nem curingas, e por isso erra para o lado de não
 * buscar: regra que não entendemos vale como proibição.
 */
async function podeBuscar(url) {
  const alvo = new URL(url);
  const chave = alvo.host;

  if (permissao.has(chave)) {
    const guardado = permissao.get(chave);
    return guardado === null ? true : guardado(alvo.pathname + alvo.search);
  }

  let texto = '';
  try {
    texto = await buscarTexto(`${alvo.origin}/robots.txt`, { tentativas: 1, aceitar: 'text/plain' });
  } catch {
    // Sem robots.txt (404, timeout, domínio que não responde a ele) o padrão da
    // própria norma é liberado. Fica guardado para não perguntar de novo.
    permissao.set(chave, null);
    return true;
  }

  const proibidos = [];
  let valeParaNos = false;

  for (const linha of String(texto).split(/\r?\n/)) {
    const limpa = linha.replace(/#.*$/, '').trim();
    if (!limpa) continue;

    const [campoBruto, ...resto] = limpa.split(':');
    const campo = campoBruto.toLowerCase().trim();
    const valor = resto.join(':').trim();

    if (campo === 'user-agent') {
      valeParaNos = valor === '*' || valor.toLowerCase().includes(AGENTE.toLowerCase());
      continue;
    }
    if (campo === 'disallow' && valeParaNos && valor) proibidos.push(valor);
  }

  const decidir = (caminho) => !proibidos.some((p) => caminho.startsWith(p.replace(/\*.*$/, '')));
  permissao.set(chave, decidir);
  return decidir(alvo.pathname + alvo.search);
}

/** Troca {termo} e {pagina} na URL de busca configurada. */
function montarUrl(modelo, { termo, pagina }) {
  if (!modelo) throw new Error('Configure a `url_busca` desta fonte antes de buscar.');
  return String(modelo)
    .replace(/\{termo\}/g, encodeURIComponent(termo || ''))
    .replace(/\{pagina\}/g, String(pagina || 1));
}

/** Data no formato que o portal usa, virada Date no fuso local. */
function paraData(texto, formato) {
  const limpo = String(texto || '').trim();
  if (!limpo) return null;

  // O formato da spec é descritivo: 'DD/MM/YYYY HH:mm'. O que importa dele é a
  // ordem dos campos, então a leitura é por posição dos números — é o que
  // aceita '10/11/2026', '10/11/2026 14:30' e '10-11-2026' com a mesma regra.
  const numeros = limpo.match(/\d+/g);
  if (!numeros || numeros.length < 3) return null;

  const ordem = String(formato || 'DD/MM/YYYY').toUpperCase();
  const anoPrimeiro = ordem.indexOf('Y') < ordem.indexOf('D');

  const [a, b, c] = numeros.map(Number);
  const ano = anoPrimeiro ? a : c;
  const mes = b;
  const dia = anoPrimeiro ? c : a;
  if (!ano || !mes || !dia) return null;

  const hora = Number(numeros[3] || 0);
  const minuto = Number(numeros[4] || 0);

  // Data é dia de calendário no fuso local: montada campo a campo, nunca por
  // `new Date(string)`, que lê data pura como meia-noite UTC.
  const d = new Date(ano < 100 ? 2000 + ano : ano, mes - 1, dia, hora, minuto, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Valor em real no formato brasileiro: 'R$ 1.234,56' → 1234.56. */
function paraNumero(texto) {
  const limpo = String(texto || '').replace(/[^\d,.-]/g, '');
  if (!limpo) return null;

  // Separador decimal é o último sinal que aparecer: 1.234,56 e 1,234.56 são os
  // dois formatos em circulação, e trocar um pelo outro erra por mil vezes.
  const ultimaVirgula = limpo.lastIndexOf(',');
  const ultimoPonto = limpo.lastIndexOf('.');
  const decimal = ultimaVirgula > ultimoPonto ? ',' : '.';

  const semMilhar = limpo.split(decimal === ',' ? '.' : ',').join('');
  const n = Number(semMilhar.replace(decimal, '.'));
  return Number.isFinite(n) ? n : null;
}

/** Texto de um nó, com os espaços de HTML colapsados. */
function textoDe($, no, campo) {
  const alvo = campo.seletor ? $(no).find(campo.seletor).first() : $(no);
  if (!alvo.length) return null;

  const bruto = campo.atributo ? alvo.attr(campo.atributo) : alvo.text();
  const limpo = String(bruto || '').replace(/\s+/g, ' ').trim();
  return limpo || null;
}

/**
 * A chave externa de uma linha. É ela que impede duplicata na coleta.
 *
 * Sem identificador do portal, a chave é o link — que é o que de fato
 * identifica a licitação naquele site. Sem link e sem identificador, a linha é
 * descartada: licitação sem chave estável entraria de novo em cada coleta, e
 * Radar com a mesma licitação cinco vezes é pior do que Radar sem ela.
 */
function chaveDe(dados, { fonteId }) {
  const bruta = dados.identificador || dados.link_portal;
  if (!bruta) return null;
  return `${fonteId}:${String(bruta).replace(/\s+/g, '').slice(0, 110)}`;
}

/** Resolve link relativo contra a URL da página. */
function absoluto(link, base) {
  if (!link) return null;
  try {
    return new URL(link, base).toString();
  } catch {
    return null;
  }
}

/**
 * Lê uma página de resultados e devolve as licitações normalizadas, no mesmo
 * formato que o adaptador do PNCP entrega à coleta.
 */
function extrair(html, { config, fonteId, url }) {
  const $ = cheerio.load(html);
  const linhas = $(config.seletor_lista || '');

  if (!linhas.length) {
    // Nenhuma linha. São duas causas possíveis, e elas pedem conserto
    // diferente: seletor errado (ajuste a configuração) ou lista montada por
    // JavaScript (não há configuração que resolva). Distinguir é o que evita
    // ficar mexendo no seletor de uma página que nunca teve a lista no HTML.
    //
    // O sinal é o próprio seletor, lido por partes: `table tbody tr` testa
    // `table`, depois `table tbody`, depois o todo. A última parte que casou
    // diz exatamente onde a página deixou de corresponder. Contar `<li>` da
    // página não serve de nada — menu e rodapé sempre têm dezenas, e portal em
    // JavaScript entrega os dois prontos.
    const partes = String(config.seletor_lista || '').trim().split(/\s+/).filter(Boolean);
    let ultimoQueCasou = null;
    for (let i = 1; i <= partes.length; i += 1) {
      const prefixo = partes.slice(0, i).join(' ');
      if ($(prefixo).length) ultimoQueCasou = prefixo;
      else break;
    }

    const temBundle = MARCAS_DE_JAVASCRIPT.some((m) => m.test(html)) || $('script[src]').length > 0;

    // Quando o seletor casa em parte, a causa é certa: a página tem a estrutura
    // externa e o seletor erra no fim. Dizer onde parou é o que conserta.
    //
    // Quando não casa nada, o painel NÃO escolhe entre as duas causas. Seletor
    // inventado numa página cheia de conteúdo e portal que monta tudo no
    // navegador produzem exatamente o mesmo HTML do nosso ponto de vista, e
    // afirmar "é JavaScript" mandaria você caçar um problema que pode não
    // existir. A mensagem diz as duas, com o que se sabe da página — e isto não
    // vira `bloqueado`: bloqueado é o que se sabe bloqueado (robots.txt, 403),
    // não o que não se entendeu.
    const erro = new Error(
      ultimoQueCasou
        ? `O seletor casou até "${ultimoQueCasou}", mas não até "${config.seletor_lista}". Ajuste o seletor da lista.`
        : `Nada na página casou com "${config.seletor_lista}". Ou o seletor está errado, ou este portal monta ` +
          `a lista no navegador — e aí não há configuração que resolva.` +
          (temBundle ? ' A página carrega scripts, o que torna a segunda hipótese provável.' : '')
    );
    erro.seletorVazio = true;
    erro.ultimoQueCasou = ultimoQueCasou;
    erro.temBundle = temBundle;
    throw erro;
  }

  const campos = config.campos || {};
  const resultado = [];

  linhas.each((_, no) => {
    const valor = (nome) => (campos[nome] ? textoDe($, no, campos[nome]) : null);

    const link = absoluto(campos.link ? textoDe($, no, { ...campos.link, atributo: campos.link.atributo || 'href' }) : null, url);
    const objeto = valor('objeto');

    // Linha sem objeto é cabeçalho, rodapé ou separador: o seletor de tabela
    // pega esses junto, e deixá-los passar enche o Radar de linhas vazias.
    if (!objeto) return;

    const dados = {
      fonte_id: fonteId,
      identificador: valor('identificador'),
      numero_controle: valor('identificador'),
      orgao_nome: valor('orgao'),
      unidade: valor('unidade'),
      uf: (valor('uf') || config.uf_padrao || null) && String(valor('uf') || config.uf_padrao).toUpperCase().slice(0, 2),
      municipio: valor('municipio') || config.municipio_padrao || null,
      modalidade: valor('modalidade'),
      numero_compra: valor('numero'),
      processo: valor('processo'),
      objeto,
      valor_estimado: campos.valor ? paraNumero(valor('valor')) : null,
      abertura_propostas: campos.abertura
        ? paraData(valor('abertura'), campos.abertura.formato_data)
        : null,
      fim_propostas: campos.fim ? paraData(valor('fim'), campos.fim.formato_data) : null,
      situacao: valor('situacao') || 'Recebendo proposta',
      esfera: config.esfera || 'Municipal',
      plataforma_disputa: config.plataforma || null,
      link_portal: link,
      link_disputa: link,
    };

    const chave = chaveDe(dados, { fonteId });
    if (!chave) return;

    delete dados.identificador;
    resultado.push({ ...dados, chave_externa: chave, bruto: { html_linha: $(no).html() } });
  });

  return resultado;
}

module.exports = {
  chave: 'generico_html',
  nome: 'Portal em HTML — configurável pela tela (seção 5.3)',

  // O formulário da tela de Fontes. `json` é o campo que recebe o mapa de
  // campos da seção 5.3 — ele é grande e aninhado, e não cabe em um input.
  camposConfig: [
    { campo: 'url_busca', rotulo: 'URL da busca, com {termo} e {pagina}', tipo: 'texto', padrao: '' },
    { campo: 'seletor_lista', rotulo: 'Seletor CSS de cada linha da lista', tipo: 'texto', padrao: 'table tbody tr' },
    { campo: 'campos', rotulo: 'Mapa de campos (JSON da seção 5.3)', tipo: 'json', padrao: '' },
    { campo: 'paginas_max', rotulo: 'Máximo de páginas por termo', tipo: 'numero', padrao: 5 },
    { campo: 'uf_padrao', rotulo: 'UF, quando o portal é de um só estado', tipo: 'texto', padrao: '' },
    { campo: 'municipio_padrao', rotulo: 'Município, quando o portal é de um só', tipo: 'texto', padrao: '' },
    { campo: 'plataforma', rotulo: 'Nome da plataforma de disputa', tipo: 'texto', padrao: '' },
  ],

  /**
   * Busca por um termo numa página. Devolve { licitacoes, total }.
   *
   * O `total` é o que esta página trouxe: portal em HTML raramente publica a
   * contagem, e inventá-la faria a coleta parar antes ou seguir à toa. Quem
   * pagina é a coleta, pelo `paginas_max`.
   */
  async buscar({ config = {}, fonteId, termo, pagina = 1 }) {
    const url = montarUrl(config.url_busca, { termo, pagina });

    if (!(await podeBuscar(url))) {
      throw new PortalBloqueado(
        'O robots.txt deste portal não permite a busca automática neste caminho. O painel respeita o robots.txt.',
        url
      );
    }

    const resposta = await buscar(url, { aceitar: 'text/html,application/xhtml+xml', tentativas: 3 });
    const html = await resposta.text();

    const licitacoes = extrair(html, { config, fonteId, url });
    return { total: licitacoes.length, licitacoes };
  },

  /**
   * Este adaptador não detalha: o que a lista traz é o que o portal publica, e
   * abrir cada licitação seria uma requisição por linha num portal que já é
   * lento. O link vai para o card, e o detalhe se confere nele.
   */
  async detalhar() {
    return null;
  },

  PortalBloqueado,
  extrair,
  paraData,
  paraNumero,
  podeBuscar,
  montarUrl,
  AGENTE,
};
