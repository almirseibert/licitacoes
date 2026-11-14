import { useEffect, useState } from 'react';
import { Radar as IconeRadar, Database, Tags, SlidersHorizontal, FolderLock, FileSignature, KanbanSquare, TrendingDown, Stethoscope, Sparkles, CalendarRange, Landmark, FileCheck2, BarChart3, LogOut, Users, CreditCard, Gauge, Building2, Lock, Newspaper, LayoutDashboard, ListTodo } from 'lucide-react';
import { api, obterToken, obterUsuario, obterOrganizacao, guardarSessao, encerrarSessao } from './servicos/api';
import Login from './paginas/Login';
import Convite from './paginas/Convite';
import RedefinirSenha from './paginas/RedefinirSenha';
import RadarPublico from './paginas/RadarPublico';
import Equipe from './paginas/Equipe';
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
import Relatorio from './paginas/Relatorio';
import Assinatura from './paginas/Assinatura';
import Organizacoes from './paginas/Organizacoes';
import Dashboard from './paginas/Dashboard';
import Tarefas from './paginas/Tarefas';
import Alertas from './componentes/Alertas';
import AlternarTema from './componentes/AlternarTema';
import { definirTema, seguirSistema, temaGuardado } from './servicos/tema';

const TELAS = [
  { chave: 'dashboard', rotulo: 'Dashboard', icone: LayoutDashboard, recurso: 'gestao' },
  { chave: 'radar', rotulo: 'Radar', icone: IconeRadar },
  { chave: 'funil', rotulo: 'Funil', icone: KanbanSquare },
  { chave: 'tarefas', rotulo: 'Tarefas', icone: ListTodo, recurso: 'gestao' },
  { chave: 'boletins', rotulo: 'Boletins', icone: Newspaper, recurso: 'boletim' },
  { chave: 'fontes', rotulo: 'Fontes', icone: Database },
  { chave: 'palavras', rotulo: 'Palavras-chave', icone: Tags },
  { chave: 'precos', rotulo: 'Preço de referência', icone: TrendingDown, recurso: 'historico' },
  { chave: 'oportunidades', rotulo: 'Oportunidades', icone: Sparkles, recurso: 'estrategicas' },
  { chave: 'calendario', rotulo: 'Calendário', icone: CalendarRange },
  { chave: 'contratos', rotulo: 'Contratos', icone: FileCheck2, recurso: 'contratos' },
  { chave: 'orgaos', rotulo: 'Órgãos', icone: Landmark, recurso: 'concorrentes' },
  { chave: 'diagnostico', rotulo: 'Diagnóstico', icone: Stethoscope, recurso: 'relatorios' },
  { chave: 'relatorio', rotulo: 'Relatório mensal', icone: BarChart3, recurso: 'relatorios' },
  { chave: 'cofre', rotulo: 'Documentos', icone: FolderLock },
  { chave: 'modelos', rotulo: 'Declarações', icone: FileSignature },
  { chave: 'equipe', rotulo: 'Equipe', icone: Users },
  { chave: 'configuracoes', rotulo: 'Configurações', icone: SlidersHorizontal },
  { chave: 'assinatura', rotulo: 'Assinatura', icone: CreditCard },
  { chave: 'uso', rotulo: 'Uso do plano', icone: Gauge },
  // Só aparece quando o backend diz `superadmin` (Seção 3).
  { chave: 'organizacoes', rotulo: 'Organizações', icone: Building2, soSuperadmin: true },
];

// Situações em que vale um aviso fixo no topo (Seção 3).
const AVISAR = ['teste_vencido', 'vencida', 'suspensa'];

// Links que chegam por e-mail (Seção 1b): /convite/<token> e
// /redefinir-senha/<token>. O painel não tem roteador; o caminho é lido uma vez.
function linkDeEmail() {
  const achado = window.location.pathname.match(/^\/(convite|redefinir-senha)\/([A-Za-z0-9]+)\/?$/);
  return achado ? { tipo: achado[1], token: achado[2] } : null;
}

// Lista do Radar compartilhada por link (Seção 7): /publico/radar/<token>, sem login.
const TOKEN_PUBLICO = (window.location.pathname.match(/^\/publico\/radar\/([A-Za-z0-9_-]{43})\/?$/) || [])[1];

function voltarParaRaiz() {
  window.history.replaceState(null, '', '/');
}

export default function App() {
  const [usuario, setUsuario] = useState(() => (obterToken() ? obterUsuario() : null));
  const [tela, setTela] = useState('dashboard');
  // Parâmetro da tela de destino (ex.: a aba do cofre), para o link do dashboard.
  const [parametros, setParametros] = useState({});
  const irPara = (destino, params = {}) => {
    setParametros(params);
    setTela(destino);
  };
  // O sino e o funil abrem a gaveta de uma licitação pelo Radar.
  const [licitacaoAberta, setLicitacaoAberta] = useState(null);
  const [link, setLink] = useState(linkDeEmail);
  const [organizacao, setOrganizacao] = useState(obterOrganizacao);
  const [organizacoes, setOrganizacoes] = useState([]);
  // Plano da organização (Seção 3): recursos para o cadeado do menu, situação
  // para o aviso e `superadmin` para o menu de Organizações — tudo do backend.
  const [plano, setPlano] = useState(null);

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
        if (r.tema) definirTema(r.tema);
        else if (temaGuardado()) api.salvarTema(temaGuardado()).catch(() => {});
        const atual = (r.organizacoes || []).find((o) => o.id === r.usuario.organizacao_id);
        if (atual) setOrganizacao(atual);
      })
      .catch(() => {});
    api.assinatura().then(setPlano).catch(() => {});
  }, [usuario]);

  // Plano sem gestão (ou bloqueado) não abre no Dashboard, que daria erro.
  useEffect(() => {
    if (plano && tela === 'dashboard' && !temRecurso('gestao')) setTela('radar');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plano]);

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

  if (TOKEN_PUBLICO) return <RadarPublico token={TOKEN_PUBLICO} />;
  if (link && link.tipo === 'redefinir-senha') return <RedefinirSenha token={link.token} onSair={paraEntrada} />;
  if (link && link.tipo === 'convite') return <Convite token={link.token} onEntrar={entrar} onSair={paraEntrada} />;
  if (!usuario) return <Login onEntrar={entrar} />;

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
    <div className="h-screen flex">
      {/* Navegação lateral. Ícones em traço, na cor do texto suave (seção 15). */}
      <nav className="w-14 md:w-52 shrink-0 border-r border-borda bg-superficie/40 flex flex-col">
        <div className="px-3 py-4 border-b border-borda">
          <p className="font-titulo text-sm leading-tight hidden md:block truncate">
            {(organizacao && organizacao.nome) || 'Painel'}
          </p>
          <p className="text-[10px] uppercase tracking-widest text-texto-suave hidden md:block">Licitações</p>
          {organizacoes.length > 1 && (
            <select
              className="campo-caixa w-full mt-2 text-xs hidden md:block"
              aria-label="Trocar de organização"
              value={organizacao ? organizacao.id : ''}
              onChange={(e) => trocar(e.target.value)}
            >
              {organizacoes.map((o) => (
                <option key={o.id} value={o.id}>{o.nome}</option>
              ))}
            </select>
          )}
          <p className="font-titulo text-base md:hidden text-center">SM</p>
        </div>

        <div className="flex-1 py-2">
          {TELAS.filter((t) => !t.soSuperadmin || (plano && plano.superadmin)).map(({ chave, rotulo, icone: Icone, recurso }) => (
            <button
              key={chave}
              onClick={() => irPara(chave)}
              aria-label={rotulo}
              title={rotulo}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                tela === chave
                  ? 'text-texto bg-realce/[0.06] border-l-2 border-texto'
                  : 'text-texto-suave hover:text-texto border-l-2 border-transparent'
              }`}
            >
              <Icone size={16} />
              <span className="hidden md:inline">{rotulo}</span>
              {!temRecurso(recurso) && (
                <Lock size={11} className="ml-auto hidden md:inline" aria-label="fora do seu plano" />
              )}
            </button>
          ))}
        </div>

        <div className="border-t border-borda">
          <Alertas aoAbrirLicitacao={(id) => { setTela('radar'); setLicitacaoAberta(id); }} />
        </div>

        <div className="border-t border-borda p-3">
          <p className="text-[11px] text-texto-suave truncate hidden md:block mb-2">{usuario.nome || usuario.email}</p>
          <div className="flex flex-col md:flex-row md:justify-between gap-2">
            <button onClick={sair} className="flex items-center gap-2 text-xs text-texto-suave hover:text-texto">
              <LogOut size={14} />
              <span className="hidden md:inline">sair</span>
            </button>
            <AlternarTema />
          </div>
        </div>
      </nav>

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
        {tela === 'dashboard' && <Dashboard aoIr={irPara} />}
        {tela === 'tarefas' && <Tarefas aoAbrir={(id) => { setTela('radar'); setLicitacaoAberta(id); }} />}
        {tela === 'radar' && <Radar abrir={licitacaoAberta} aoAbrir={setLicitacaoAberta} />}
        {tela === 'fontes' && <Fontes />}
        {tela === 'palavras' && <Palavras />}
        {tela === 'boletins' && <Boletins />}
        {tela === 'cofre' && <Cofre key={parametros.aba || 'documentos'} abaInicial={parametros.aba} />}
        {tela === 'modelos' && <Modelos />}
        {tela === 'funil' && <Funil aoAbrir={setLicitacaoAberta} />}
        {tela === 'precos' && <Precos />}
        {tela === 'oportunidades' && (
          <Oportunidades aoAbrir={(id) => { setTela('radar'); setLicitacaoAberta(id); }} />
        )}
        {tela === 'calendario' && (
          <Calendario aoAbrir={(id) => { setTela('radar'); setLicitacaoAberta(id); }} />
        )}
        {tela === 'contratos' && (
          <Contratos aoAbrir={(id) => { setTela('radar'); setLicitacaoAberta(id); }} />
        )}
        {tela === 'orgaos' && (
          <Orgaos aoAbrir={(id) => { setTela('radar'); setLicitacaoAberta(id); }} />
        )}
        {tela === 'diagnostico' && (
          <Diagnostico aoAbrir={(id) => { setTela('radar'); setLicitacaoAberta(id); }} />
        )}
        {tela === 'relatorio' && <Relatorio />}
        {tela === 'equipe' && <Equipe />}
        {tela === 'configuracoes' && <Configuracoes />}
        {tela === 'assinatura' && <Assinatura aba="assinatura" key="assinatura" />}
        {tela === 'uso' && <Assinatura aba="uso" key="uso" />}
        {tela === 'organizacoes' && <Organizacoes />}
        </div>
      </main>
    </div>
  );
}
