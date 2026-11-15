import { useState } from 'react';
import { LogOut, Menu, X } from 'lucide-react';
import { CATEGORIAS } from '../config/navegacao';
import Alertas from './Alertas';
import AlternarTema from './AlternarTema';

/**
 * Barra de navegação superior (substitui a antiga sidebar plana): botão home
 * fixo para o Dashboard, as categorias que abrem a sidebar contextual, e as
 * mesmas ações que já existiam (alertas, tema, usuário, sair, trocar de
 * organização). Lógica de agrupamento inspirada no ConLicitação — visual é
 * Voltage Obsidian, sem nenhuma cor nova.
 */
export default function BarraSuperior({
  organizacao, organizacoes, aoTrocarOrganizacao, usuario,
  categoriaAtiva, aoSelecionarCategoria, aoIrParaDashboard,
  aoAbrirLicitacao, aoSair,
}) {
  const [menuMobileAberto, setMenuMobileAberto] = useState(false);

  const selecionarCategoria = (chave) => {
    aoSelecionarCategoria(chave);
    setMenuMobileAberto(false);
  };

  return (
    <header className="shrink-0 border-b border-borda bg-superficie/40">
      <div className="h-14 px-3 flex items-center gap-2">
        <button
          onClick={() => { aoIrParaDashboard(); setMenuMobileAberto(false); }}
          aria-label="Painel"
          title="Painel"
          className="flex items-center gap-2 pr-2 border-r border-borda"
        >
          <span className="font-titulo text-sm">SM</span>
          <span className="hidden lg:flex flex-col items-start leading-tight">
            <span className="text-xs truncate max-w-[10rem]">{(organizacao && organizacao.nome) || 'Painel'}</span>
            <span className="text-[10px] uppercase tracking-widest text-texto-suave">Licitações</span>
          </span>
        </button>

        {organizacoes.length > 1 && (
          <select
            className="campo-caixa text-xs hidden lg:block max-w-[9rem]"
            aria-label="Trocar de organização"
            value={organizacao ? organizacao.id : ''}
            onChange={(e) => aoTrocarOrganizacao(e.target.value)}
          >
            {organizacoes.map((o) => (
              <option key={o.id} value={o.id}>{o.nome}</option>
            ))}
          </select>
        )}

        <nav className="hidden md:flex items-center gap-1 ml-1">
          {CATEGORIAS.map(({ chave, rotulo, icone: Icone }) => (
            <button
              key={chave}
              onClick={() => selecionarCategoria(chave)}
              aria-current={categoriaAtiva === chave}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors ${
                categoriaAtiva === chave
                  ? 'text-texto bg-realce/[0.08]'
                  : 'text-texto-suave hover:text-texto'
              }`}
            >
              <Icone size={15} />
              {rotulo}
            </button>
          ))}
        </nav>

        <button
          onClick={() => setMenuMobileAberto((a) => !a)}
          aria-label="Abrir menu"
          className="md:hidden text-texto-suave hover:text-texto"
        >
          {menuMobileAberto ? <X size={18} /> : <Menu size={18} />}
        </button>

        <div className="flex-1" />

        <Alertas aoAbrirLicitacao={aoAbrirLicitacao} />
        <AlternarTema compacto />
        <span className="hidden lg:inline text-[11px] text-texto-suave truncate max-w-[9rem]">
          {usuario.nome || usuario.email}
        </span>
        <button onClick={aoSair} className="flex items-center gap-1.5 text-xs text-texto-suave hover:text-texto" title="Sair">
          <LogOut size={14} />
          <span className="hidden lg:inline">sair</span>
        </button>
      </div>

      {menuMobileAberto && (
        <nav className="md:hidden border-t border-borda flex flex-col">
          {CATEGORIAS.map(({ chave, rotulo, icone: Icone }) => (
            <button
              key={chave}
              onClick={() => selecionarCategoria(chave)}
              className={`flex items-center gap-2.5 px-4 py-2.5 text-sm text-left ${
                categoriaAtiva === chave ? 'text-texto bg-realce/[0.06]' : 'text-texto-suave'
              }`}
            >
              <Icone size={16} />
              {rotulo}
            </button>
          ))}
        </nav>
      )}
    </header>
  );
}
