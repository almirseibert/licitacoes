import { useEffect, useRef, useState } from 'react';
import { api, obterToken, obterUsuario, obterOrganizacao, guardarSessao, encerrarSessao } from './servicos/api';
import { TELAS_MERCADO, categoriaDaTela, telaPermitida } from './config/navegacao';
import BarraSuperior from './componentes/BarraSuperior';
import SidebarContextual from './componentes/SidebarContextual';
import Divulgacao from './paginas/Divulgacao';
import Convite from './paginas/Convite';
import RedefinirSenha from './paginas/RedefinirSenha';
import RadarPublico from './paginas/RadarPublico';
import Equipe from './paginas/Equipe';
import Integracoes from './paginas/Integracoes';
import Radar from './paginas/Radar';
import Fontes from './paginas/Fontes';
import Palavras from './paginas/Palavras';
import Boletins from './paginas/Boletins';
import Configuracoes from './paginas/Configuracoes';
import Cofre from './paginas/Cofre';
import Modelos from './paginas/Modelos';
import Funil from './paginas/Funil';
import Precos from './paginas/Precos';
import Diagnostico from './paginas/Diagnostico';
import Oportunidades from './paginas/Oportunidades';
import Calendario from './paginas/Calendario';
import Orgaos from './paginas/Orgaos';
import Contratos from './paginas/Contratos';
import Mercado from './paginas/Mercado';
import AnaliseMercado from './paginas/AnaliseMercado';
import Relatorio from './paginas/Relatorio';
import Desempenho from './paginas/Desempenho';
import Assinatura from './paginas/Assinatura';
import Organizacoes from './paginas/Organizacoes';
import Dashboard from './paginas/Dashboard';
import Tarefas from './paginas/Tarefas';
import MonitorChat from './paginas/MonitorChat';
import Assistente from './paginas/Assistente';
import Ajuda from './paginas/Ajuda';
import Status from './paginas/Status';
import Privacidade from './paginas/Privacidade';
import Auditoria from './paginas/Auditoria';
import Legal from './paginas/Legal';
import Servicos from './paginas/Servicos';
import Parceiros from './paginas/Parceiros';
import Juridico from './paginas/Juridico';
import AceiteTermos from './componentes/AceiteTermos';
import PesquisaNps from './componentes/PesquisaNps';
import { seguirSistema, definirTema, temaGuardado, temaPendente, salvarTemaNoUsuario } from './servicos/tema';

// Situações em que vale um aviso fixo no topo (Seção 3).
const AVISAR = ['teste_vencido', 'vencida', 'suspensa'];

// Links que chegam por e-mail (Seção 1b): /convite/<token> e
// /redefinir-senha/<token>. O painel não tem roteador; o caminho é lido uma vez.
function linkDeEmail() {
  const achado = window.location.pathname.match(/^\/(convite|redefinir-senha)\/([A-Za-z0-9]+)\/?$/);
  return achado ? { tipo: achado[1], token: achado[2] } : null;
}

// Termos e política abertos sem login (Seção 17): /termos e /privacidade.
const PAGINA_LEGAL = (window.location.pathname.match(/^\/(termos|privacidade)\/?$/) || [])[1];

// Lista do Radar compartilhada por link (Seção 7): /publico/radar/<token>, sem login.
const TOKEN_PUBLICO = (window.location.pathname.match(/^\/publico\/radar\/([A-Za-z0-9_-]{43})\/?$/) || [])[1];

// /entrar e /cadastro abrem o popup de entrada sobre a página de divulgação.
const POPUP_INICIAL = { '/entrar': 'entrar', '/cadastro': 'cadastrar' }[window.location.pathname.replace(/\/$/, '')] || null;

function voltarParaRaiz() {
  window.history.replaceState(null, '', '/');
}

export default function App() {
  const [usuario, setUsuario] = useState(() => (obterToken() ? obterUsuario() : null));
  const [telaPedida, setTela] = useState('dashboard');
  // Categoria ativa na barra superior (Descoberta/Gestão/Inteligência/Administração);
  // null quando a tela é o Dashboard, que fica fora das categorias.
  const [categoriaAtiva, setCategoriaAtiva] = useState(null);
  // Parâmetro da tela de destino (ex.: a aba do cofre), para o link do dashboard.
  const [parametros, setParametros] = useState({});
  const irPara = (destino, params = {}) => {
    setParametros(params);
    setTela(destino);
  };
  // A sidebar contextual segue a tela atual, de onde quer que ela mude (clique
  // no menu, num KPI do dashboard, ou na decisão de tela inicial abaixo).
  // Clicar numa categoria na barra superior abre a sidebar contextual sem
  // mudar de tela — só ao clicar num item dela é que `irPara` navega de fato.
  const selecionarCategoria = (chave) => setCategoriaAtiva((atual) => (atual === chave ? null : chave));
  // O sino e o funil abrem a gaveta de uma licitação pelo Radar.
  const [licitacaoAberta, setLicitacaoAberta] = useState(null);
  const abrirLicitacao = (id) => { irPara('radar'); setLicitacaoAberta(id); };
  const [link, setLink] = useState(linkDeEmail);
  const [organizacao, setOrganizacao] = useState(obterOrganizacao);
  const [organizacoes, setOrganizacoes] = useState([]);
  // Plano da organização (Seção 3): recursos para o cadeado do menu, situação
  // para o aviso e `superadmin` para o menu de Organizações — tudo do backend.
  const [plano, setPlano] = useState(null);
  // Guarda de rota (decisão de 16/11/2026): tela de administrador não abre para
  // quem não administra, nem por atalho ou link interno; cai no Radar. Sem o plano
  // carregado ainda, trata como não-admin para a tela restrita nem chegar a montar.
  const tela = telaPermitida(telaPedida, {
    podeAdministrar: Boolean(plano && plano.pode_administrar),
    superadmin: Boolean(plano && plano.superadmin),
  }) ? telaPedida : 'radar';
  useEffect(() => setCategoriaAtiva(categoriaDaTela(tela)), [tela]);
  // Seção 17: estado do assistente, dos termos e do NPS (tudo vem do backend).
  const [onb, setOnb] = useState(null);
  const [onbPronto, setOnbPronto] = useState(false); // a chamada do assistente terminou (com ou sem sucesso)
  const [npsFechado, setNpsFechado] = useState(false);
  const recarregarOnb = () => api.onboarding().then(setOnb).catch(() => {});

  useEffect(seguirSistema, []);

  // A lista de organizações do usuário vem do backend (nada de permissão
  // decidida no frontend): é ela que alimenta o seletor de troca.
  useEffect(() => {
    if (!usuario) return;
    api
      .eu()
      .then((r) => {
        setOrganizacoes(r.organizacoes || []);
        // O tema salvo no usuário manda sobre o do navegador (Seção 2); se ele
        // nunca salvou, a escolha feita aqui (ex.: na tela de login) sobe ao banco.
        // Escolha que não chegou ao servidor (2b) manda mais que o banco e é reenviada.
        const pendente = temaPendente();
        if (pendente) {
          definirTema(pendente);
          salvarTemaNoUsuario(api.salvarTema, pendente);
        } else if (r.tema) definirTema(r.tema);
        else if (temaGuardado()) salvarTemaNoUsuario(api.salvarTema, temaGuardado());
        const atual = (r.organizacoes || []).find((o) => o.id === r.usuario.organizacao_id);
        if (atual) setOrganizacao(atual);
      })
      .catch(() => {});
    api.assinatura().then(setPlano).catch(() => {});
    api
      .onboarding()
      .then(setOnb)
      .catch(() => {})
      .finally(() => setOnbPronto(true));
  }, [usuario]);

  // Tela inicial: UMA decisão, tomada quando o plano e o assistente já chegaram (antes eram dois
  // efeitos que se atropelavam). Organização nova abre no assistente — só para quem pode
  // configurá-la (`pode_administrar` vem do backend); plano sem gestão não abre no Dashboard,
  // que daria erro. Depois de decidida, não mexe mais: quem navegou fica onde está.
  const inicialDecidida = useRef(false);
  useEffect(() => {
    // Espera as duas respostas, mas não depende de o assistente ter dado certo: se a chamada dele falhar,
    // a regra de plano sem gestão ainda vale.
    if (inicialDecidida.current || !plano || !onbPronto) return;
    inicialDecidida.current = true;
    if (onb && !onb.concluido && onb.pode_administrar) setTela((t) => (['dashboard', 'radar'].includes(t) ? 'primeiros_passos' : t));
    else if (!plano.isenta && plano.plano && !plano.plano.recursos.includes('gestao')) setTela((t) => (t === 'dashboard' ? 'radar' : t));
  }, [plano, onb, onbPronto]);

  const temRecurso = (recurso) =>
    !recurso || !plano || plano.isenta || (plano.plano && plano.plano.recursos.includes(recurso));

  const entrar = (u) => {
    voltarParaRaiz();
    setLink(null);
    setUsuario(u);
  };
  const paraEntrada = () => {
    voltarParaRaiz();
    setLink(null);
  };

  if (PAGINA_LEGAL) return <Legal aba={PAGINA_LEGAL === 'privacidade' ? 'privacidade' : 'termos'} />;
  if (TOKEN_PUBLICO) return <RadarPublico token={TOKEN_PUBLICO} />;
  if (link && link.tipo === 'redefinir-senha') return <RedefinirSenha token={link.token} onSair={paraEntrada} />;
  if (link && link.tipo === 'convite') return <Convite token={link.token} onEntrar={entrar} onSair={paraEntrada} />;
  // Sem sessão: a página de divulgação, com a entrada como popup. /entrar e /cadastro
  // (links antigos e de e-mail) abrem a página já com o popup aberto.
  if (!usuario) return <Divulgacao onEntrar={entrar} abrirInicial={POPUP_INICIAL} />;

  const sair = () => {
    encerrarSessao();
    setUsuario(null);
    setOrganizacoes([]);
  };

  // Trocar de organização reemite o token; a tela recomeça do zero para não
  // sobrar na memória nada da organização anterior.
  const trocar = async (id) => {
    try {
      const r = await api.trocarOrganizacao(Number(id));
      guardarSessao(r.token, r.usuario, r.organizacao);
      window.location.reload();
    } catch (e) {
      window.alert(e.message);
    }
  };

  return (
    <div className="h-screen flex flex-col">
      <BarraSuperior
        organizacao={organizacao}
        organizacoes={organizacoes}
        aoTrocarOrganizacao={trocar}
        usuario={usuario}
        categoriaAtiva={categoriaAtiva}
        aoSelecionarCategoria={selecionarCategoria}
        telaAtiva={tela}
        aoIrParaDashboard={() => irPara('dashboard')}
        aoAbrirLicitacao={abrirLicitacao}
        aoSair={sair}
      />

      <div className="flex-1 flex min-w-0 min-h-0">
        <SidebarContextual
          categoria={categoriaAtiva}
          telaAtiva={tela}
          aoIrPara={irPara}
          podeAdministrar={Boolean(plano && plano.pode_administrar)}
          superadmin={Boolean(plano && plano.superadmin)}
          temRecurso={temRecurso}
          aoFechar={() => setCategoriaAtiva(null)}
        />

      <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {plano && !plano.isenta && AVISAR.includes(plano.situacao.codigo) && (
          <p role="alert" className="shrink-0 px-4 py-2 text-xs border-b border-borda text-atencao bg-atencao/[0.06]">
            {plano.situacao.mensagem}{' '}
            {tela !== 'assinatura' && (
              <button className="underline" onClick={() => setTela('assinatura')}>Ver planos</button>
            )}
          </p>
        )}
        <div className="flex-1 min-h-0">
        {tela === 'dashboard' && <Dashboard aoIr={irPara} aoAbrirLicitacao={abrirLicitacao} temRecurso={temRecurso} />}
        {tela === 'monitor_chat' && <MonitorChat aoAbrir={abrirLicitacao} />}
        {tela === 'tarefas' && <Tarefas aoAbrir={abrirLicitacao} />}
        {tela === 'radar' && (
          <Radar abrir={licitacaoAberta} aoAbrir={setLicitacaoAberta} aoIr={irPara} filtroInicial={parametros} />
        )}
        {tela === 'fontes' && <Fontes />}
        {tela === 'palavras' && <Palavras />}
        {tela === 'boletins' && <Boletins />}
        {tela === 'cofre' && <Cofre key={parametros.aba || 'documentos'} abaInicial={parametros.aba} />}
        {tela === 'modelos' && <Modelos />}
        {tela === 'funil' && <Funil aoAbrir={abrirLicitacao} />}
        {tela === 'precos' && <Precos />}
        {tela === 'oportunidades' && (
          <Oportunidades aoAbrir={abrirLicitacao} />
        )}
        {tela === 'calendario' && (
          <Calendario aoAbrir={abrirLicitacao} />
        )}
        {tela === 'contratos' && (
          <Contratos aoAbrir={abrirLicitacao} />
        )}
        {TELAS_MERCADO[tela] && (
          <Mercado
            key={tela}
            tipo={TELAS_MERCADO[tela]}
            aoAbrir={abrirLicitacao}
          />
        )}
        {tela === 'analise_mercado' && (
          <AnaliseMercado aoAbrir={abrirLicitacao} />
        )}
        {tela === 'orgaos' && (
          <Orgaos comMercado={temRecurso('mercado')} aoAbrir={abrirLicitacao} />
        )}
        {tela === 'diagnostico' && (
          <Diagnostico aoAbrir={abrirLicitacao} />
        )}
        {tela === 'desempenho' && <Desempenho aoAbrir={abrirLicitacao} />}
        {tela === 'relatorio' && <Relatorio />}
        {tela === 'juridico' && <Juridico />}
        {tela === 'equipe' && <Equipe />}
        {tela === 'integracoes' && <Integracoes />}
        {tela === 'configuracoes' && <Configuracoes />}
        {tela === 'assinatura' && <Assinatura aba="assinatura" key="assinatura" aoAtualizarPlano={setPlano} />}
        {tela === 'uso' && <Assinatura aba="uso" key="uso" aoAtualizarPlano={setPlano} />}
        {tela === 'organizacoes' && <Organizacoes />}
        {tela === 'parceiros' && <Parceiros />}
        {tela === 'servicos' && <Servicos key={parametros.licitacao_id || 'servicos'} inicial={parametros.servico ? parametros : null} />}
        {tela === 'primeiros_passos' && <Assistente estado={onb} aoConcluir={recarregarOnb} aoIr={irPara} />}
        {tela === 'ajuda' && <Ajuda key={parametros.aba || 'guias'} abaInicial={parametros.aba} superadmin={Boolean(plano && plano.superadmin)} aoIr={irPara} />}
        {tela === 'status' && <Status aoIr={irPara} />}
        {tela === 'privacidade' && <Privacidade aoIr={irPara} />}
        {tela === 'auditoria' && <Auditoria aoAbrir={abrirLicitacao} />}
        </div>
      </main>
      </div>

      {onb && !onb.termos.aceita && <AceiteTermos aoAceitar={() => setOnb((o) => ({ ...o, termos: { ...o.termos, aceita: true } }))} aoSair={sair} />}
      {onb && onb.termos.aceita && onb.nps.devido && !npsFechado && <PesquisaNps aoFechar={() => setNpsFechado(true)} />}
    </div>
  );
}
