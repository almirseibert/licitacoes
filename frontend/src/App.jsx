import { useState } from 'react';
import { Radar as IconeRadar, Database, Tags, SlidersHorizontal, FolderLock, LogOut } from 'lucide-react';
import { obterToken, obterUsuario, encerrarSessao } from './servicos/api';
import Login from './paginas/Login';
import Radar from './paginas/Radar';
import Fontes from './paginas/Fontes';
import Palavras from './paginas/Palavras';
import Configuracoes from './paginas/Configuracoes';
import Cofre from './paginas/Cofre';

const TELAS = [
  { chave: 'radar', rotulo: 'Radar', icone: IconeRadar },
  { chave: 'fontes', rotulo: 'Fontes', icone: Database },
  { chave: 'palavras', rotulo: 'Palavras-chave', icone: Tags },
  { chave: 'cofre', rotulo: 'Documentos', icone: FolderLock },
  { chave: 'configuracoes', rotulo: 'Configurações', icone: SlidersHorizontal },
];

export default function App() {
  const [usuario, setUsuario] = useState(() => (obterToken() ? obterUsuario() : null));
  const [tela, setTela] = useState('radar');

  if (!usuario) return <Login onEntrar={setUsuario} />;

  const sair = () => {
    encerrarSessao();
    setUsuario(null);
  };

  return (
    <div className="h-screen flex">
      {/* Navegação lateral. Ícones em traço, na cor do texto suave (seção 15). */}
      <nav className="w-14 md:w-52 shrink-0 border-r border-borda bg-superficie/40 flex flex-col">
        <div className="px-3 py-4 border-b border-borda">
          <p className="font-titulo text-sm leading-tight hidden md:block">Studio Mythos</p>
          <p className="text-[10px] uppercase tracking-widest text-texto-suave hidden md:block">Licitações</p>
          <p className="font-titulo text-base md:hidden text-center">SM</p>
        </div>

        <div className="flex-1 py-2">
          {TELAS.map(({ chave, rotulo, icone: Icone }) => (
            <button
              key={chave}
              onClick={() => setTela(chave)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                tela === chave
                  ? 'text-texto bg-white/[0.06] border-l-2 border-texto'
                  : 'text-texto-suave hover:text-texto border-l-2 border-transparent'
              }`}
            >
              <Icone size={16} />
              <span className="hidden md:inline">{rotulo}</span>
            </button>
          ))}
        </div>

        <div className="border-t border-borda p-3">
          <p className="text-[11px] text-texto-suave truncate hidden md:block mb-2">{usuario.nome || usuario.email}</p>
          <button onClick={sair} className="flex items-center gap-2 text-xs text-texto-suave hover:text-texto">
            <LogOut size={14} />
            <span className="hidden md:inline">sair</span>
          </button>
        </div>
      </nav>

      <main className="flex-1 min-w-0 overflow-hidden">
        {tela === 'radar' && <Radar />}
        {tela === 'fontes' && <Fontes />}
        {tela === 'palavras' && <Palavras />}
        {tela === 'cofre' && <Cofre />}
        {tela === 'configuracoes' && <Configuracoes />}
      </main>
    </div>
  );
}
