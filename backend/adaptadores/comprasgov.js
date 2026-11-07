// Adaptador Compras.gov.br (seção 5.2) — enriquecimento, não busca.
//
// O papel dele é a lista completa de propostas de um item: CNPJ, razão social,
// UF, selos ME/EPP, situação e valores ofertado e negociado. Isso alimenta
// `propostas_concorrentes`.
//
// DIVERGÊNCIA DA SPEC, medida em 07/11/2026 e registrada aqui como o CLAUDE.md
// pede: a seção 5.2 supõe que a leitura possa sair "do HTML público
// renderizado". Não sai. A página de acompanhamento é uma aplicação Angular —
// o HTML que o servidor entrega (52 kB) é só a casca, com script, estilo e
// nenhuma proposta; os dados chegam depois, por uma API JSON que exige token de
// hCaptcha. A seção 5.2 também diz o que fazer nesse caso, e é o que este
// adaptador faz: registra `ultimo_status = 'bloqueado'`, devolve o link para
// abrir à mão e não força nada. Nada de CAPTCHA, nada de navegador headless
// fingindo ser usuário.
//
// Enquanto o portal estiver assim, o vencedor por item vem do PNCP, que publica
// CNPJ, porte e valor homologado em API aberta (ver `resultadoDoItem` em
// adaptadores/pncp.js). É menos do que a spec queria — um vencedor em vez de
// dezessete propostas — mas é dado real, e a tela diz de onde veio.
const { buscar } = require('../servicos/http');

const BASE = 'https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/public';

/** Erro de portal bloqueado: a rota transforma em mensagem, não em stack trace. */
class PortalBloqueado extends Error {
  constructor(mensagem, link) {
    super(mensagem);
    this.bloqueado = true;
    this.link = link;
  }
}

/**
 * O identificador da compra sai do `linkSistemaOrigem` do PNCP (`?compra=<id>`).
 * O portal publica duas formas do mesmo link — a direta e a que passa pela
 * landing — e as duas trazem o parâmetro.
 */
function idDaCompra(link) {
  if (!link) return null;
  const achado = /[?&]compra=(\d+)/.exec(String(link));
  return achado ? achado[1] : null;
}

/** Link da compra, para o usuário abrir no navegador dele. */
function linkDaCompra(compraId) {
  return `${BASE}/compras/acompanhamento-compra?compra=${compraId}`;
}

/** Link de um item da compra — é a tela que lista as propostas. */
function linkDoItem(compraId, numeroItem) {
  return `${BASE}/compras/acompanhamento-compra/item/${numeroItem}?compra=${compraId}`;
}

// Marcas que apareceriam no HTML se as propostas viessem prontas do servidor.
// Se um dia vierem, `propostas` para de lançar e passa a valer a pena extrair.
const MARCAS_DE_PROPOSTA = [/Fornecedor<\/th>/i, /Valor\s+ofertado/i, /quadro-propostas/i];

module.exports = {
  chave: 'comprasgov',
  nome: 'Compras.gov.br — propostas e concorrentes',

  // Não aparece na tela de Fontes como fonte de busca: ele enriquece o que o
  // PNCP já trouxe. A tela de Fontes mostra o aviso em vez de campos.
  somenteEnriquecimento: true,
  camposConfig: [],

  idDaCompra,
  linkDaCompra,
  linkDoItem,
  PortalBloqueado,

  async buscar() {
    throw new Error(
      'O Compras.gov.br não é fonte de busca neste painel: ele só completa as propostas de uma licitação que o PNCP já trouxe.'
    );
  },

  /**
   * Propostas de um item. Hoje sempre bloqueia — e diz por quê, com o link.
   * A requisição é feita de verdade, uma por chamada, para que o dia em que o
   * portal voltar a publicar o quadro no HTML o painel perceba sozinho.
   */
  async listarPropostas({ compraId, numeroItem }) {
    if (!compraId) throw new Error('Sem o identificador da compra no Compras.gov.br.');

    const link = linkDoItem(compraId, numeroItem || 1);
    const resposta = await buscar(link, { aceitar: 'text/html', tentativas: 2 });
    const html = await resposta.text();

    if (!MARCAS_DE_PROPOSTA.some((marca) => marca.test(html))) {
      throw new PortalBloqueado(
        'O Compras.gov.br carrega as propostas por JavaScript, atrás de CAPTCHA. O painel não resolve CAPTCHA: abra o link e confira na mão.',
        link
      );
    }

    // Chegando aqui, o portal mudou e passou a entregar o quadro pronto. Vale
    // implementar a extração com cheerio — mas não antes disso, para não deixar
    // no código um parser que nunca roda.
    throw new PortalBloqueado(
      'O Compras.gov.br voltou a publicar o quadro de propostas no HTML. Falta implementar a leitura — por ora, abra o link.',
      link
    );
  },
};
