import {
  Radar as IconeRadar, Database, Tags, SlidersHorizontal, FolderLock, FileSignature, KanbanSquare,
  TrendingDown, Stethoscope, Sparkles, CalendarRange, Landmark, FileCheck2, BarChart3, Users,
  CreditCard, Gauge, Building2, Newspaper, LayoutDashboard, ListTodo, ScrollText, BookMarked,
  BellRing, PieChart, Plug, Trophy, Rocket, LifeBuoy, Activity, ShieldCheck, History,
  MessagesSquare, Handshake, Scale, Compass, ClipboardList, BrainCircuit, Settings2,
} from 'lucide-react';

// Agrupamento inspirado no "Nossas Ferramentas" do ConLicitação (4 blocos), mantendo o
// Voltage Obsidian: a referência é a lógica de agrupamento, não o visual deles.
export const CATEGORIAS = [
  { chave: 'descoberta', rotulo: 'Descoberta', icone: Compass },
  { chave: 'gestao', rotulo: 'Gestão', icone: ClipboardList },
  { chave: 'inteligencia', rotulo: 'Inteligência', icone: BrainCircuit },
  { chave: 'administracao', rotulo: 'Administração', icone: Settings2 },
];

// `categoria: null` marca a tela que fica fora das categorias (o Dashboard, acessado
// direto pelo botão home da barra superior). `grupo` é o subtítulo dentro da sidebar
// contextual daquela categoria.
export const TELAS = [
  { chave: 'dashboard', rotulo: 'Dashboard', icone: LayoutDashboard, recurso: 'gestao', categoria: null },

  { chave: 'radar', rotulo: 'Radar', icone: IconeRadar, categoria: 'descoberta', grupo: 'Oportunidades' },
  { chave: 'boletins', rotulo: 'Boletins', icone: Newspaper, recurso: 'boletim', categoria: 'descoberta', grupo: 'Oportunidades' },
  { chave: 'oportunidades', rotulo: 'Oportunidades', icone: Sparkles, recurso: 'estrategicas', categoria: 'descoberta', grupo: 'Oportunidades' },

  { chave: 'fontes', rotulo: 'Fontes', icone: Database, categoria: 'descoberta', grupo: 'Busca e configuração' },
  { chave: 'palavras', rotulo: 'Palavras-chave', icone: Tags, categoria: 'descoberta', grupo: 'Busca e configuração' },
  { chave: 'calendario', rotulo: 'Calendário', icone: CalendarRange, categoria: 'descoberta', grupo: 'Busca e configuração' },
  { chave: 'precos', rotulo: 'Preço de referência', icone: TrendingDown, recurso: 'historico', categoria: 'descoberta', grupo: 'Busca e configuração' },

  { chave: 'funil', rotulo: 'Funil', icone: KanbanSquare, categoria: 'gestao', grupo: 'Funil' },
  { chave: 'tarefas', rotulo: 'Tarefas', icone: ListTodo, recurso: 'gestao', categoria: 'gestao', grupo: 'Funil' },

  // Seção 12: "Meus contratos" (os que a organização ganhou) × "Contratos do mercado" (PNCP).
  { chave: 'contratos', rotulo: 'Meus contratos', icone: FileCheck2, recurso: 'contratos', categoria: 'gestao', grupo: 'Contratos' },
  { chave: 'mercado_contratos', rotulo: 'Contratos do mercado', icone: ScrollText, recurso: 'mercado', categoria: 'gestao', grupo: 'Contratos' },
  { chave: 'mercado_atas', rotulo: 'Atas', icone: BookMarked, recurso: 'mercado', categoria: 'gestao', grupo: 'Contratos' },

  { chave: 'acompanhamentos', rotulo: 'Acompanhamentos', icone: BellRing, recurso: 'acompanhamentos', categoria: 'gestao', grupo: 'Acompanhamento' },
  // Seção 6: chat do pregão, onde o portal publica sem login.
  { chave: 'monitor_chat', rotulo: 'Monitor de chat', icone: MessagesSquare, recurso: 'acompanhamentos', categoria: 'gestao', grupo: 'Acompanhamento' },
  { chave: 'orgaos', rotulo: 'Órgãos', icone: Landmark, recurso: 'concorrentes', categoria: 'gestao', grupo: 'Acompanhamento' },

  { chave: 'cofre', rotulo: 'Documentos', icone: FolderLock, categoria: 'gestao', grupo: 'Documentos' },
  { chave: 'modelos', rotulo: 'Declarações', icone: FileSignature, categoria: 'gestao', grupo: 'Documentos' },
  // Seção 18: seguro garantia, assessoria cadastral e demais serviços por parceria.
  { chave: 'servicos', rotulo: 'Serviços', icone: Handshake, categoria: 'gestao', grupo: 'Documentos' },

  // Seção 13: análise por segmento, concorrentes recorrentes e motivos de perda.
  { chave: 'diagnostico', rotulo: 'Diagnóstico', icone: Stethoscope, recurso: 'relatorios', categoria: 'inteligencia', grupo: 'Análises' },
  { chave: 'analise_mercado', rotulo: 'Análise de mercado', icone: PieChart, recurso: 'mercado', categoria: 'inteligencia', grupo: 'Análises' },
  { chave: 'desempenho', rotulo: 'Meu desempenho', icone: Trophy, recurso: 'relatorios', categoria: 'inteligencia', grupo: 'Análises' },
  { chave: 'relatorio', rotulo: 'Relatório mensal', icone: BarChart3, recurso: 'relatorios', categoria: 'inteligencia', grupo: 'Análises' },

  // Seção 16: consultor jurídico (chat sobre a Lei 14.133) e biblioteca Jurídico Fácil.
  { chave: 'juridico', rotulo: 'Jurídico', icone: Scale, recurso: 'consultor_juridico', categoria: 'inteligencia', grupo: 'Jurídico' },

  { chave: 'equipe', rotulo: 'Equipe', icone: Users, categoria: 'administracao', grupo: 'Conta' },
  // Seção 14: token de API e webhook de novas oportunidades.
  { chave: 'integracoes', rotulo: 'Integrações', icone: Plug, recurso: 'api', categoria: 'administracao', grupo: 'Conta' },
  { chave: 'configuracoes', rotulo: 'Configurações', icone: SlidersHorizontal, categoria: 'administracao', grupo: 'Conta' },

  { chave: 'assinatura', rotulo: 'Assinatura', icone: CreditCard, categoria: 'administracao', grupo: 'Plano' },
  { chave: 'uso', rotulo: 'Uso do plano', icone: Gauge, categoria: 'administracao', grupo: 'Plano' },

  // Seção 17: onboarding, ajuda e suporte, status, privacidade e auditoria.
  { chave: 'primeiros_passos', rotulo: 'Primeiros passos', icone: Rocket, categoria: 'administracao', grupo: 'Suporte' },
  { chave: 'ajuda', rotulo: 'Ajuda', icone: LifeBuoy, categoria: 'administracao', grupo: 'Suporte' },
  { chave: 'status', rotulo: 'Status', icone: Activity, categoria: 'administracao', grupo: 'Suporte' },
  { chave: 'privacidade', rotulo: 'Privacidade e dados', icone: ShieldCheck, categoria: 'administracao', grupo: 'Suporte' },

  { chave: 'auditoria', rotulo: 'Auditoria', icone: History, soAdmin: true, categoria: 'administracao', grupo: 'Sistema' },
  // Só aparece quando o backend diz `superadmin` (Seção 3).
  { chave: 'organizacoes', rotulo: 'Organizações', icone: Building2, soSuperadmin: true, categoria: 'administracao', grupo: 'Sistema' },
  { chave: 'parceiros', rotulo: 'Parceiros', icone: Handshake, soSuperadmin: true, categoria: 'administracao', grupo: 'Sistema' },
];

// Seção 12: as três telas do mercado são o mesmo componente, por tipo de lista.
export const TELAS_MERCADO = { mercado_contratos: 'contratos', mercado_atas: 'atas', acompanhamentos: 'acompanhamentos' };

export function categoriaDaTela(chave) {
  const tela = TELAS.find((t) => t.chave === chave);
  return tela ? tela.categoria : null;
}
