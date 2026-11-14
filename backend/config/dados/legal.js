// Termos de uso, política de privacidade e aviso da IA (Seção 17 do PLANO_SAAS_CONLICITACAO.md).
//
// MINUTA. O texto descreve o que o painel faz de verdade (cada afirmação aqui
// tem um comportamento no código atrás), mas NÃO foi revisado por advogado — o
// revisor ainda não foi definido (mesma pendência da Seção 16). A API devolve
// `revisado_por_advogado: false` e a tela mostra a faixa de aviso enquanto for
// assim. Quem revisar muda o texto, sobe `VERSAO_TERMOS` e preenche no ambiente o advogado e
// `LEGAL_REVISADO=true` (regras/revisao.js): todo usuário volta a ser perguntado, porque o
// aceite é por versão.
//
// Dado que falta é lacuna visível (`____________`): razão social, CNPJ e e-mail
// de contato da operadora vêm do ambiente (`OPERADORA_*`), e sem eles o texto
// mostra o traço — nunca um valor inventado.

const { revisao } = require('../../regras/revisao');

const VERSAO_TERMOS = '2026-11-14';
const LACUNA = '____________';

/** Identificação da operadora, lida do ambiente a cada chamada (o teste troca o env). */
function operadora(env = process.env) {
  const ou = (v) => (String(v || '').trim() ? String(v).trim() : LACUNA);
  return {
    razao_social: ou(env.OPERADORA_RAZAO_SOCIAL),
    cnpj: ou(env.OPERADORA_CNPJ),
    contato: ou(env.SUPORTE_EMAIL),
    encarregado: ou(env.OPERADORA_ENCARREGADO_EMAIL || env.SUPORTE_EMAIL),
  };
}

function termos(o) {
  return [
    {
      titulo: '1. O que é o painel',
      paragrafos: [
        `O Painel de Licitações é um serviço de ${o.razao_social} (CNPJ ${o.cnpj}) que reúne licitações públicas publicadas em portais abertos, pontua as que combinam com a sua empresa e ajuda a organizar a participação: funil, tarefas, documentos, propostas, contratos e avisos.`,
        'O painel é uma ferramenta de organização. Ele não participa da licitação por você: não dá lance, não assina documento, não usa certificado digital e não guarda senha de portal de compras.',
      ],
    },
    {
      titulo: '2. Conta e responsabilidade',
      paragrafos: [
        'Quem cria a conta é o dono da organização e responde pelas pessoas que convida e pelo papel que dá a cada uma (dono, administrador, membro ou leitor).',
        'Guarde sua senha. Tudo o que for feito com o seu login é registrado na trilha de auditoria da organização em seu nome.',
      ],
    },
    {
      titulo: '3. Os dados das licitações',
      paragrafos: [
        'As licitações vêm de portais e bases públicas, coletadas com identificação honesta e dentro do ritmo que cada portal tolera. O painel não garante que a coleta seja completa, atual ou livre de erro: portal fora do ar, bloqueio de coleta e mudança de layout acontecem.',
        'Confira sempre o edital e o portal oficial antes de decidir, e respeite os prazos publicados lá. A pontuação, o prazo calculado e as exigências extraídas são apoio, não substituem a sua leitura.',
      ],
    },
    {
      titulo: '4. Inteligência artificial',
      paragrafos: [
        'Onde houver leitura assistida por IA (resumo do edital, pergunte ao edital, sugestão de exigências), a resposta é uma sugestão e pode estar errada, incompleta ou desatualizada. Ela não muda pontuação, etapa, preço nem documento do seu cofre por conta própria.',
        'Leia o trecho do edital citado antes de agir. A responsabilidade pela decisão e pelos documentos enviados é sua.',
      ],
    },
    {
      titulo: '5. Plano, teste e cobrança',
      paragrafos: [
        'Toda organização nova começa com um período de teste. Terminado o teste ou o pagamento, o acesso fica somente leitura até a regularização; a organização suspensa não acessa o painel.',
        'Os limites e recursos de cada plano estão na tela Assinatura. Cancelar a assinatura não apaga os dados: a exclusão é um pedido à parte (item 8).',
      ],
    },
    {
      titulo: '6. Uso adequado',
      paragrafos: [
        'É proibido usar o painel para sobrecarregar portais de terceiros, burlar bloqueios ou CAPTCHA, revender o acesso, ou extrair o catálogo em massa fora da API oferecida no seu plano.',
        'Tokens de API e webhooks são pessoais da organização; quem os cria responde pelo uso.',
      ],
    },
    {
      titulo: '7. Disponibilidade e responsabilidade',
      paragrafos: [
        'O serviço é oferecido como está, sem promessa de funcionamento ininterrupto. A tela Status das ferramentas mostra, em tempo real, se a coleta e o worker estão rodando.',
        `Na medida permitida em lei, ${o.razao_social} não responde por licitação perdida, prazo não cumprido ou documento enviado com erro. Nada neste painel é consultoria jurídica.`,
      ],
    },
    {
      titulo: '8. Seus dados e a exclusão',
      paragrafos: [
        'Os dados que a sua organização cadastra são seus. Você pode exportá-los e pedir a exclusão pelo próprio painel (Privacidade e dados). Veja a política de privacidade.',
      ],
    },
    {
      titulo: '9. Mudanças nestes termos',
      paragrafos: [
        'Quando estes termos mudarem, a versão sobe e você será convidado a ler e aceitar de novo no próximo acesso.',
        `Dúvidas: ${o.contato}.`,
      ],
    },
  ];
}

function privacidade(o) {
  return [
    {
      titulo: '1. Quem é o controlador',
      paragrafos: [
        `${o.razao_social} (CNPJ ${o.cnpj}). Contato do encarregado pelo tratamento de dados: ${o.encarregado}.`,
        'Sobre os dados que a sua empresa guarda no painel (documentos, propostas, contratos, equipe), a sua organização é a controladora e o painel atua como operador.',
      ],
    },
    {
      titulo: '2. Que dados tratamos',
      paragrafos: [
        'Da conta: nome, e-mail e senha (guardada só como hash, nunca em texto). Da organização: nome, CNPJ e CNAEs, palavras-chave, filtros, decisões sobre cada licitação, tarefas, anotações, propostas, contratos e a equipe convidada.',
        'Do cofre: os documentos que você sobe (certidões, atestados, declarações), guardados em volume próprio. Do uso: a trilha de auditoria (quem entrou e quem alterou documento, tarefa, etapa e equipe, com data e IP) e o registro de aceite dos termos.',
        'Das licitações: informações públicas dos portais. Elas não são dados pessoais da sua organização e ficam num catálogo compartilhado.',
      ],
    },
    {
      titulo: '3. Para que usamos',
      paragrafos: [
        'Para entregar o serviço contratado (base legal: execução de contrato), proteger a conta e a organização (legítimo interesse e prevenção a fraude), cobrar o plano e cumprir obrigações legais.',
        'Pedimos uma nota de satisfação (NPS) depois de 30 dias de uso; você pode dispensar a pesquisa.',
      ],
    },
    {
      titulo: '4. Com quem compartilhamos',
      paragrafos: [
        'Provedor de e-mail (para o boletim, os avisos e a recuperação de senha) e, quando ligado, o provedor de IA: nele vão apenas o trecho do edital e a pergunta que você fez, nunca o cofre de documentos nem as suas senhas. Gateway de pagamento, se o seu plano for pago.',
        'Não vendemos dados. O painel não guarda senha de portal de compras, certificado digital nem senha do gov.br.',
      ],
    },
    {
      titulo: '5. Por quanto tempo guardamos',
      paragrafos: [
        'Enquanto a organização existir. A trilha de auditoria é mantida por 2 anos. Arquivos baixados de licitações descartadas são limpos depois de 180 dias.',
        'Pedida a exclusão, a organização fica 7 dias em carência (você pode cancelar) e depois todos os dados dela são apagados, inclusive os arquivos do cofre.',
      ],
    },
    {
      titulo: '6. Seus direitos (LGPD, art. 18)',
      paragrafos: [
        'Você pode pedir confirmação do tratamento, acesso, correção, portabilidade e eliminação dos dados. Dois deles já estão na tela Privacidade e dados: baixar uma cópia (JSON) e pedir a exclusão da organização (só o dono).',
        `Para o resto, abra uma solicitação na categoria "Privacidade e dados" ou escreva para ${o.encarregado}.`,
      ],
    },
    {
      titulo: '7. Segurança',
      paragrafos: [
        'Cada organização só enxerga os próprios dados; o acesso exige login; senhas são guardadas com hash; tokens de API são guardados como hash e mostrados uma única vez.',
        'Nenhum sistema é infalível. Se houver incidente que afete dados pessoais, avisaremos o dono da organização.',
      ],
    },
    {
      titulo: '8. Cookies e armazenamento',
      paragrafos: [
        'O painel guarda no navegador apenas o necessário para manter você logado e lembrar o tema escolhido. Não usamos cookies de publicidade.',
      ],
    },
  ];
}

function avisoIa() {
  return [
    'A leitura assistida por IA pode errar. Ela resume, responde e sugere a partir do texto do edital, e pode omitir uma exigência, trocar um número ou interpretar mal uma cláusula.',
    'Toda resposta mostra o trecho do edital em que se apoia: confira nele antes de agir. A IA só sugere — não altera pontuação, etapa, preço nem documento do cofre.',
    'O edital é tratado como dado, nunca como instrução: um texto no edital não consegue mandar a IA fazer outra coisa.',
  ];
}

/** O que a rota pública devolve. */
function documentos(env = process.env) {
  const o = operadora(env);
  return {
    versao: VERSAO_TERMOS,
    ...revisao(env, 'LEGAL'),
    operadora: o,
    termos: termos(o),
    privacidade: privacidade(o),
    aviso_ia: avisoIa(),
  };
}

module.exports = { VERSAO_TERMOS, LACUNA, operadora, documentos };
