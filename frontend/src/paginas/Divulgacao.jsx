import { useEffect, useRef, useState } from 'react';
import {
  Radar, ArrowRight, Check, Sparkles, FileSearch, BellRing, FolderLock, KanbanSquare, LineChart,
  ShieldCheck, Scale, MessagesSquare, Menu, X, ChevronDown, Eye, Ban, Lock, Users,
} from 'lucide-react';
import Login from './Login';
import AlternarTema from '../componentes/AlternarTema';

/**
 * Página de divulgação do Painel de Licitações — é o que se vê em
 * licitacoes.studiomythos.com.br antes de entrar. A entrada (login, criar conta
 * e "esqueci a senha") é um popup sobre esta página (Login.jsx).
 *
 * Regras de conteúdo: nada de número inventado. Os preços vêm do banco
 * (`/api/publico/planos`, a mesma tabela que cobra); se a chamada falhar, a
 * vitrine diz "fale conosco" em vez de mostrar valor. O que o painel NÃO faz
 * (robô de lance, assinatura, senha de portal) está dito de propósito.
 */

const RECURSOS = [
  { icone: Radar, titulo: 'Radar de oportunidades', texto: 'Coleta as licitações abertas das fontes públicas e pontua cada uma pelo seu perfil: palavras-chave, região, valor e modalidade. A pontuação é da sua empresa, não de um catálogo único.' },
  { icone: BellRing, titulo: 'Boletim diário e alertas', texto: 'Todo dia, no seu e-mail, o que apareceu de novo no seu filtro. Aviso por tipo de acontecimento — prazo acabando, edital alterado, resultado — e por canal.' },
  { icone: FileSearch, titulo: 'Pergunte ao Edital', texto: 'Faça perguntas ao edital e receba a resposta com a página e o trecho de onde ela saiu. Sem trecho que confirme, o painel diz que não encontrou — não chuta.' },
  { icone: Sparkles, titulo: 'Resumo e checklist de exigências', texto: 'Objeto, prazos, habilitação, garantia e riscos em uma ficha de leitura rápida, com a lista de exigências para você conferir uma a uma.' },
  { icone: KanbanSquare, titulo: 'Funil, tarefas e equipe', texto: 'Do interesse ao resultado: etapas, responsável, tarefas com prazo e linha do tempo de cada licitação. A coleta nunca desfaz uma decisão sua.' },
  { icone: FolderLock, titulo: 'Cofre de documentos e declarações', texto: 'Certidões com data de validade e aviso antes de vencer, modelos de declaração preenchidos com os dados da empresa e pacote pronto para enviar.' },
  { icone: LineChart, titulo: 'Concorrentes, mercado e preço de referência', texto: 'Veja quem vence no seu segmento, por quanto e em quais órgãos. O histórico de preços ajuda a decidir se vale entrar e com que margem.' },
  { icone: MessagesSquare, titulo: 'Monitor de chat do pregão', texto: 'Onde o portal publica o chat sem exigir login, o painel lê e avisa quando chega mensagem de convocação, anexo ou diligência.' },
  { icone: Scale, titulo: 'Consultor da Lei 14.133', texto: 'Tire dúvidas sobre a lei com resposta que cita o artigo. É um apoio de leitura — não substitui a opinião de um advogado.' },
];

const PASSOS = [
  { n: '01', titulo: 'Conte o que você vende', texto: 'Cadastre a empresa, as palavras-chave e as regiões em que atua. O assistente de primeiros passos leva uns minutos.' },
  { n: '02', titulo: 'O painel coleta e pontua', texto: 'Todos os dias as fontes públicas são lidas e cada licitação ganha uma nota de aderência ao seu perfil, com o motivo.' },
  { n: '03', titulo: 'Leia o edital com apoio', texto: 'Resumo, exigências e perguntas com citação. A decisão de entrar — e o preço — continuam sendo seus.' },
  { n: '04', titulo: 'Prepare e acompanhe', texto: 'Documentos, declarações e proposta no mesmo lugar; depois, acompanhe prazos, chat e resultado até o contrato.' },
];

const GARANTIAS = [
  { icone: Ban, titulo: 'Sem robô de lance', texto: 'O painel não dá lance por você. Quem disputa é você, no portal.' },
  { icone: Lock, titulo: 'Sem senha de portal', texto: 'Nunca pedimos nem guardamos login de portal, certificado ou senha do gov.br. Também não assinamos documento.' },
  { icone: Eye, titulo: 'Coleta honesta', texto: 'Só fontes públicas, com identificação, ritmo moderado e respeito ao que o portal permite. Portal que bloqueia não é forçado.' },
  { icone: Users, titulo: 'Dados isolados por empresa', texto: 'Cada empresa enxerga só o que é seu: licitações, funil, documentos e equipe. Ações importantes ficam em trilha de auditoria.' },
  { icone: ShieldCheck, titulo: 'LGPD', texto: 'Você exporta ou apaga os dados da empresa pela própria tela, com prazo de carência para desistir.' },
  { icone: Sparkles, titulo: 'IA só sugere', texto: 'A IA não muda nota, etapa, preço nem documento. O conteúdo do edital é tratado como dado, nunca como ordem.' },
];

const PERGUNTAS = [
  ['Preciso de cartão para testar?', 'Não. A conta nova entra com 15 dias de teste, sem cartão. Ao fim do teste o painel fica só para leitura até você escolher um plano — nada é apagado.'],
  ['De onde vêm as licitações?', 'De fontes públicas, como o PNCP e o Compras.gov.br, e de portais que a sua empresa configurar. O painel mostra a fonte de cada licitação e quando ela foi lida pela última vez.'],
  ['O painel dá lance ou envia a proposta por mim?', 'Não. Ele prepara documentos, declarações e o pacote de proposta; o envio e a disputa acontecem no portal, por você. Também não assina documentos nem guarda certificado.'],
  ['A IA pode errar?', 'Pode, e por isso toda resposta traz a página e o trecho do edital para você conferir. Quando não há trecho que sustente a resposta, o painel avisa em vez de inventar. A IA nunca altera nota, etapa, preço ou documento.'],
  ['Meus dados ficam separados dos de outras empresas?', 'Sim. Cada empresa tem o seu espaço, com usuários e permissões próprios (dono, administrador, membro e leitor).'],
  ['Posso trocar de plano ou cancelar?', 'Pode pedir a troca de plano pela própria tela de Assinatura. Seus dados continuam acessíveis para leitura e podem ser exportados.'],
];

const NOME_RECURSO = {
  radar: 'Radar com pontuação por perfil', boletim: 'Boletim diário por e-mail', gestao: 'Funil, tarefas e dashboard',
  documentos: 'Cofre de documentos', declaracoes: 'Declarações prontas', alertas: 'Alertas por tipo e canal',
  ia: 'Pergunte ao Edital e resumo por IA', acompanhamentos: 'Acompanhamentos e monitor de chat',
  contratos: 'Contratos e atas', concorrentes: 'Concorrentes e órgãos', historico: 'Histórico e preço de referência',
  api: 'API e webhook', estrategicas: 'Oportunidades estratégicas (desertas e fracassadas)', mercado: 'Análise de mercado',
  consultor_juridico: 'Consultor da Lei 14.133', relatorios: 'Relatórios e diagnóstico',
};

const reais = (centavos) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: centavos % 100 ? 2 : 0 });

/** Revela o bloco quando ele entra na tela (sem JavaScript de rolagem; respeita movimento reduzido). */
function useRevelar() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (!('IntersectionObserver' in window)) { el.classList.add('visivel'); return undefined; }
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { el.classList.add('visivel'); obs.disconnect(); } }, { threshold: 0.12 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

function Bloco({ className = '', children, ...resto }) {
  const ref = useRevelar();
  return <div ref={ref} className={`revelar ${className}`} {...resto}>{children}</div>;
}

function Secao({ id, rotulo, titulo, texto, children }) {
  return (
    <section id={id} className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-5">
        <Bloco className="max-w-2xl mb-12">
          <p className="text-xs uppercase tracking-[0.18em] text-voltagem mb-3">{rotulo}</p>
          <h2 className="font-titulo text-3xl sm:text-4xl leading-tight">{titulo}</h2>
          {texto && <p className="mt-4 text-texto-suave leading-relaxed">{texto}</p>}
        </Bloco>
        {children}
      </div>
    </section>
  );
}

/** Marca: um raio de radar dentro de um quadrado, no tom de voltagem. */
function Marca() {
  return (
    <span className="inline-grid place-items-center size-8 rounded-lg bg-voltagem/15 text-voltagem border border-voltagem/30">
      <Radar size={17} strokeWidth={2.2} />
    </span>
  );
}

/** Prévia ilustrativa do Radar — dados de exemplo, avisados na própria imagem. */
function PreviaRadar() {
  const linhas = [
    { orgao: 'Prefeitura Municipal — exemplo', objeto: 'Aquisição de material de escritório e expediente', nota: 92, cor: 'ok', prazo: 'abre em 3 dias' },
    { orgao: 'Secretaria de Saúde — exemplo', objeto: 'Registro de preços de insumos hospitalares', nota: 78, cor: 'ok', prazo: 'abre em 6 dias' },
    { orgao: 'Câmara Municipal — exemplo', objeto: 'Serviços de manutenção predial', nota: 54, cor: 'atencao', prazo: 'abre em 9 dias' },
    { orgao: 'Autarquia — exemplo', objeto: 'Locação de veículos com motorista', nota: 31, cor: 'apagado', prazo: 'abre em 12 dias' },
  ];
  const corNota = { ok: 'text-ok bg-ok/10 border-ok/30', atencao: 'text-atencao bg-atencao/10 border-atencao/30', apagado: 'text-apagado bg-apagado/10 border-apagado/30' };
  return (
    <div className="relative animate-flutuar" aria-hidden="true">
      <div className="absolute -inset-6 bg-voltagem/10 blur-3xl rounded-full" />
      <div className="relative cartao-vidro rounded-2xl shadow-2xl shadow-black/30 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-borda">
          <span className="size-2.5 rounded-full bg-erro/70" /><span className="size-2.5 rounded-full bg-atencao/70" /><span className="size-2.5 rounded-full bg-ok/70" />
          <span className="ml-3 text-[11px] text-texto-suave font-mono">Radar · pontuação para a sua empresa</span>
        </div>
        <ul>
          {linhas.map((l) => (
            <li key={l.objeto} className="flex items-center gap-3 px-4 py-3.5 border-b border-borda/70 last:border-0">
              <span className={`shrink-0 w-11 text-center rounded-lg border py-1 font-mono text-sm font-semibold ${corNota[l.cor]}`}>{l.nota}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm truncate">{l.objeto}</span>
                <span className="block text-[11px] text-texto-suave truncate">{l.orgao}</span>
              </span>
              <span className="hidden sm:block shrink-0 text-[11px] text-texto-suave">{l.prazo}</span>
            </li>
          ))}
        </ul>
        <div className="px-4 py-2.5 bg-navy/60 text-[10.5px] text-texto-suave">Exemplo ilustrativo — não são licitações reais.</div>
      </div>
      <div className="relative -mt-3 ml-auto mr-4 cartao-vidro rounded-xl px-4 py-3 shadow-xl shadow-black/30 max-w-[17rem]">
        <p className="text-[10.5px] uppercase tracking-wider text-voltagem mb-1">Pergunte ao Edital</p>
        <p className="text-xs leading-snug">“Exige garantia de proposta?” <span className="text-texto-suave">→ Resposta com página e trecho do edital.</span></p>
      </div>
    </div>
  );
}

function Planos({ aoEscolher }) {
  const [planos, setPlanos] = useState(null); // null = carregando; [] = indisponível
  const [anual, setAnual] = useState(false);
  useEffect(() => {
    let vivo = true;
    fetch('/api/publico/planos')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('indisponível'))))
      .then((r) => vivo && setPlanos(r.planos || []))
      .catch(() => vivo && setPlanos([]));
    return () => { vivo = false; };
  }, []);

  if (planos === null) return <div className="h-72 rounded-2xl border border-borda animate-pulse" aria-busy="true" />;
  if (!planos.length) {
    return (
      <div className="cartao-vidro rounded-2xl p-8 text-center">
        <p className="text-texto-suave">Os valores não puderam ser carregados agora. Crie a conta de teste e veja os planos dentro do painel.</p>
        <button type="button" onClick={() => aoEscolher('cadastrar')} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-voltagem text-obsidiana px-5 py-2.5 text-sm font-medium hover:brightness-110">Começar o teste grátis <ArrowRight size={15} /></button>
      </div>
    );
  }
  const destaque = planos.find((p) => p.codigo === 'profissional') ? 'profissional' : null;
  return (
    <>
      <div className="flex justify-center mb-10">
        <div className="inline-flex rounded-full border border-borda p-1 bg-superficie text-sm" role="group" aria-label="Ciclo de cobrança">
          {[[false, 'Mensal'], [true, 'Anual']].map(([valor, rotulo]) => (
            <button key={rotulo} type="button" aria-pressed={anual === valor} onClick={() => setAnual(valor)}
              className={`px-5 py-1.5 rounded-full transition-colors ${anual === valor ? 'bg-voltagem text-obsidiana font-medium' : 'text-texto-suave hover:text-texto'}`}>
              {rotulo}{valor && <span className="ml-1.5 text-[10px] opacity-80">2 meses grátis</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        {planos.map((p, i) => {
          const anteriores = new Set(planos.slice(0, i).flatMap((q) => q.recursos));
          const novos = p.recursos.filter((r) => !anteriores.has(r) && NOME_RECURSO[r]);
          const mensal = anual ? Math.round(p.preco_anual_centavos / 12) : p.preco_mensal_centavos;
          const em = p.codigo === destaque;
          return (
            <Bloco key={p.codigo} className={`relative rounded-2xl p-7 flex flex-col ${em ? 'border-2 border-voltagem/70 bg-superficie shadow-xl shadow-voltagem/10' : 'cartao-vidro'}`}>
              {em && <span className="absolute -top-3 left-7 rounded-full bg-voltagem text-obsidiana text-[10.5px] font-semibold uppercase tracking-wider px-3 py-1">Mais escolhido</span>}
              <h3 className="font-titulo text-2xl">{p.nome}</h3>
              <p className="mt-2 text-sm text-texto-suave min-h-[4.5rem]">{p.descricao}</p>
              <p className="mt-5"><span className="text-4xl font-semibold tracking-tight">{reais(mensal)}</span><span className="text-sm text-texto-suave"> /mês</span></p>
              <p className="text-xs text-texto-suave h-4 mt-1">{anual ? `${reais(p.preco_anual_centavos)} cobrados por ano` : 'cobrança mensal'}</p>
              <ul className="mt-6 space-y-2.5 text-sm flex-1">
                <li className="flex gap-2.5"><Check size={16} className="text-ok shrink-0 mt-0.5" />{i > 0 ? `Tudo do ${planos[i - 1].nome}, mais:` : 'Inclui:'}</li>
                {novos.map((r) => <li key={r} className="flex gap-2.5"><Check size={16} className="text-ok shrink-0 mt-0.5" />{NOME_RECURSO[r]}</li>)}
                <li className="flex gap-2.5 text-texto-suave"><Check size={16} className="shrink-0 mt-0.5 opacity-0" />{p.limites.usuarios} usuários · {p.limites.palavras_chave} palavras-chave</li>
              </ul>
              <button type="button" onClick={() => aoEscolher('cadastrar')}
                className={`mt-7 w-full rounded-lg py-2.5 text-sm font-medium transition ${em ? 'bg-voltagem text-obsidiana hover:brightness-110' : 'border border-borda hover:border-voltagem/60 hover:text-voltagem'}`}>
                Testar 15 dias grátis
              </button>
            </Bloco>
          );
        })}
      </div>
      <p className="mt-6 text-center text-xs text-texto-suave">Sem cartão no teste. Valores em reais; o plano anual paga 10 meses.</p>
    </>
  );
}

export default function Divulgacao({ onEntrar, abrirInicial = null }) {
  const [popup, setPopup] = useState(abrirInicial); // null | 'entrar' | 'cadastrar'
  const [menu, setMenu] = useState(false);

  const abrir = (modo) => { setMenu(false); setPopup(modo); };
  const fechar = () => {
    setPopup(null);
    if (window.location.pathname !== '/') window.history.replaceState(null, '', '/');
  };

  useEffect(() => { document.title = 'Painel de Licitações — encontre, leia e dispute com mais critério'; }, []);

  const nav = [['#recursos', 'Recursos'], ['#como-funciona', 'Como funciona'], ['#confianca', 'Confiança'], ['#planos', 'Planos'], ['#perguntas', 'Perguntas']];

  return (
    <div className="relative overflow-x-clip">
      <header className="sticky top-0 z-40 border-b border-borda/70 bg-obsidiana/80 backdrop-blur-lg">
        <div className="mx-auto max-w-6xl px-5 h-16 flex items-center gap-6">
          <a href="/" className="flex items-center gap-2.5 font-titulo text-lg"><Marca />Licitações <span className="text-texto-suave font-sans text-xs hidden sm:inline">· Studio Mythos</span></a>
          <nav className="hidden md:flex items-center gap-6 text-sm text-texto-suave ml-4" aria-label="Seções da página">
            {nav.map(([href, rotulo]) => <a key={href} href={href} className="hover:text-texto transition-colors">{rotulo}</a>)}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <AlternarTema />
            <button type="button" onClick={() => abrir('entrar')} className="hidden sm:block text-sm px-4 py-2 rounded-lg text-texto-suave hover:text-texto hover:bg-realce/10">Entrar</button>
            <button type="button" onClick={() => abrir('cadastrar')} className="text-sm px-4 py-2 rounded-lg bg-voltagem text-obsidiana font-medium hover:brightness-110">Teste grátis</button>
            <button type="button" className="md:hidden p-2 rounded-lg text-texto-suave hover:bg-realce/10" aria-label={menu ? 'Fechar menu' : 'Abrir menu'} aria-expanded={menu} onClick={() => setMenu(!menu)}>
              {menu ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {menu && (
          <nav className="md:hidden border-t border-borda px-5 py-3 flex flex-col text-sm" aria-label="Seções da página">
            {nav.map(([href, rotulo]) => <a key={href} href={href} onClick={() => setMenu(false)} className="py-2.5 text-texto-suave hover:text-texto">{rotulo}</a>)}
            <button type="button" onClick={() => abrir('entrar')} className="py-2.5 text-left text-voltagem">Entrar</button>
          </nav>
        )}
      </header>

      <main>
        {/* Herói */}
        <section className="relative">
          <div className="absolute inset-x-0 top-0 h-[44rem] fundo-grade pointer-events-none" aria-hidden="true" />
          <div className="absolute left-1/2 top-0 -translate-x-1/2 w-[60rem] max-w-full h-[28rem] bg-voltagem/10 blur-[110px] rounded-full pointer-events-none" aria-hidden="true" />
          <div className="relative mx-auto max-w-6xl px-5 pt-16 pb-24 sm:pt-24 sm:pb-32 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-16 items-center">
            <div className="animate-subir min-w-0">
              <p className="inline-flex items-center gap-2 rounded-full border border-voltagem/30 bg-voltagem/10 text-voltagem text-xs px-3.5 py-1.5 mb-7">
                <span className="size-1.5 rounded-full bg-voltagem" /> Para quem vende ao governo
              </p>
              <h1 className="font-titulo text-[2.6rem] sm:text-6xl leading-[1.05] tracking-tight">
                A licitação certa, <span className="texto-brilho">lida e decidida</span> antes da concorrência.
              </h1>
              <p className="mt-6 text-lg text-texto-suave leading-relaxed max-w-xl">
                O painel coleta as oportunidades abertas, pontua cada uma para a sua empresa, resume o edital com a fonte de cada
                afirmação e organiza documentos, prazos e proposta — do primeiro alerta ao contrato.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => abrir('cadastrar')} className="group inline-flex items-center gap-2 rounded-xl bg-voltagem text-obsidiana px-6 py-3.5 font-medium hover:brightness-110 shadow-lg shadow-voltagem/20">
                  Começar o teste grátis <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" />
                </button>
                <button type="button" onClick={() => abrir('entrar')} className="rounded-xl border border-borda px-6 py-3.5 text-texto hover:border-voltagem/60 hover:text-voltagem transition-colors">Já tenho conta</button>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-texto-suave">
                {['15 dias de teste', 'Sem cartão de crédito', 'Dados isolados por empresa'].map((t) => (
                  <li key={t} className="flex items-center gap-2"><Check size={15} className="text-ok" />{t}</li>
                ))}
              </ul>
            </div>
            <div className="min-w-0"><PreviaRadar /></div>
          </div>
        </section>

        {/* Fontes */}
        <div className="border-y border-borda/70 bg-superficie/50">
          <div className="mx-auto max-w-6xl px-5 py-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm text-texto-suave">
            <span className="text-[11px] uppercase tracking-[0.18em]">Lê fontes públicas</span>
            {['PNCP', 'Compras.gov.br', 'Portais configuráveis', 'Fontes da sua escolha'].map((f) => <span key={f} className="font-medium text-texto/80">{f}</span>)}
          </div>
        </div>

        <Secao id="recursos" rotulo="Recursos" titulo="Tudo o que a sua equipe faz entre o edital e o contrato." texto="Cada módulo conversa com os outros: o que o Radar encontra vira funil, o funil vira tarefa e a tarefa puxa o documento certo do cofre.">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {RECURSOS.map(({ icone: Icone, titulo, texto }) => (
              <Bloco key={titulo} className="cartao-vidro rounded-2xl p-6 hover:border-voltagem/40 transition-colors group">
                <span className="inline-grid place-items-center size-10 rounded-xl bg-voltagem/10 text-voltagem mb-4 group-hover:bg-voltagem/20 transition-colors"><Icone size={20} /></span>
                <h3 className="font-medium text-[15px] mb-2">{titulo}</h3>
                <p className="text-sm text-texto-suave leading-relaxed">{texto}</p>
              </Bloco>
            ))}
          </div>
        </Secao>

        <Secao id="como-funciona" rotulo="Como funciona" titulo="Do cadastro ao primeiro alerta em poucos minutos.">
          <ol className="grid gap-5 md:grid-cols-4">
            {PASSOS.map((p) => (
              <Bloco key={p.n} className="relative">
                <span className="font-mono text-4xl font-semibold text-voltagem/30">{p.n}</span>
                <h3 className="font-medium mt-2 mb-2">{p.titulo}</h3>
                <p className="text-sm text-texto-suave leading-relaxed">{p.texto}</p>
              </Bloco>
            ))}
          </ol>
        </Secao>

        {/* Confiança */}
        <section id="confianca" className="scroll-mt-20 py-20 sm:py-28 bg-navy/40 border-y border-borda/70">
          <div className="mx-auto max-w-6xl px-5">
            <Bloco className="max-w-2xl mb-12">
              <p className="text-xs uppercase tracking-[0.18em] text-voltagem mb-3">Confiança</p>
              <h2 className="font-titulo text-3xl sm:text-4xl leading-tight">A IA sugere. Quem decide é você.</h2>
              <p className="mt-4 text-texto-suave leading-relaxed">Licitação mexe com prazo, dinheiro e responsabilidade. Por isso o painel foi desenhado com limites claros — e a gente os diz de frente.</p>
            </Bloco>
            <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {GARANTIAS.map(({ icone: Icone, titulo, texto }) => (
                <Bloco key={titulo} className="flex gap-4">
                  <span className="shrink-0 grid place-items-center size-10 rounded-xl border border-borda bg-superficie text-voltagem"><Icone size={18} /></span>
                  <div><h3 className="font-medium text-[15px] mb-1">{titulo}</h3><p className="text-sm text-texto-suave leading-relaxed">{texto}</p></div>
                </Bloco>
              ))}
            </div>
          </div>
        </section>

        <Secao id="planos" rotulo="Planos" titulo="Comece grátis. Pague quando fizer sentido." texto="Três planos, do essencial da captação à inteligência de mercado. Troque quando precisar.">
          <Planos aoEscolher={abrir} />
        </Secao>

        <Secao id="perguntas" rotulo="Perguntas frequentes" titulo="O que costumam perguntar antes de testar.">
          <div className="max-w-3xl divide-y divide-borda border-y border-borda">
            {PERGUNTAS.map(([p, r]) => (
              <details key={p} className="group py-5">
                <summary className="flex items-center justify-between gap-4 cursor-pointer list-none font-medium [&::-webkit-details-marker]:hidden">
                  {p}<ChevronDown size={18} className="shrink-0 text-texto-suave transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm text-texto-suave leading-relaxed pr-8">{r}</p>
              </details>
            ))}
          </div>
        </Secao>

        {/* Chamada final */}
        <section className="pb-24 sm:pb-32">
          <Bloco className="mx-auto max-w-5xl px-5">
            <div className="relative overflow-hidden rounded-3xl border border-voltagem/30 bg-superficie px-8 py-14 sm:px-16 text-center">
              <div className="absolute inset-0 bg-gradient-to-br from-voltagem/15 via-transparent to-transparent pointer-events-none" aria-hidden="true" />
              <h2 className="relative font-titulo text-3xl sm:text-5xl leading-tight">Sua próxima licitação já pode estar no Radar.</h2>
              <p className="relative mt-4 text-texto-suave max-w-xl mx-auto">Crie a conta da sua empresa, cadastre as palavras-chave e veja o que apareceu para você ainda hoje.</p>
              <button type="button" onClick={() => abrir('cadastrar')} className="relative mt-8 inline-flex items-center gap-2 rounded-xl bg-voltagem text-obsidiana px-7 py-3.5 font-medium hover:brightness-110">
                Criar conta e testar 15 dias <ArrowRight size={17} />
              </button>
            </div>
          </Bloco>
        </section>
      </main>

      <footer className="border-t border-borda/70 py-10 text-sm text-texto-suave">
        <div className="mx-auto max-w-6xl px-5 flex flex-wrap items-center gap-x-8 gap-y-3">
          <span className="flex items-center gap-2.5 font-titulo text-texto"><Marca />Licitações · Studio Mythos</span>
          <nav className="flex gap-6 sm:ml-auto" aria-label="Documentos">
            <a href="/termos" className="hover:text-texto">Termos de uso</a>
            <a href="/privacidade" className="hover:text-texto">Privacidade</a>
            <button type="button" onClick={() => abrir('entrar')} className="hover:text-texto">Entrar</button>
          </nav>
        </div>
        <p className="mx-auto max-w-6xl px-5 mt-6 text-xs">© {new Date().getFullYear()} Studio Mythos. As informações das licitações vêm de fontes públicas; confira sempre o edital original antes de decidir.</p>
      </footer>

      {popup && <Login modoInicial={popup} onEntrar={onEntrar} onFechar={fechar} />}
    </div>
  );
}
