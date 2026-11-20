import { Lock, X, LayoutDashboard } from 'lucide-react';
import { CATEGORIAS, TELAS, telaPermitida } from '../config/navegacao';

/**
 * Painel lateral com os itens da categoria ativa, agrupados por subgrupo
 * (ex.: dentro de "Gestão": Funil, Contratos, Acompanhamento, Documentos).
 * Some quando não há categoria selecionada (telas fixas, como o Dashboard).
 * No mobile vira uma gaveta por cima do conteúdo; no desktop fica fixa ao
 * lado do `<main>`, como a sidebar antiga.
 */
export default function SidebarContextual({ categoria, telaAtiva, aoIrPara, podeAdministrar, superadmin, temRecurso, gavetaAberta = false, aoFechar }) {
  if (!categoria) return null;

  const infoCategoria = CATEGORIAS.find((c) => c.chave === categoria);
  const itens = TELAS.filter(
    (t) => t.categoria === categoria && telaPermitida(t.chave, { podeAdministrar, superadmin }),
  );
  const grupos = [];
  for (const item of itens) {
    let grupo = grupos.find((g) => g.nome === item.grupo);
    if (!grupo) { grupo = { nome: item.grupo, itens: [] }; grupos.push(grupo); }
    grupo.itens.push(item);
  }

  return (
    <>
      {gavetaAberta && <div className="fixed inset-0 top-14 z-10 bg-obsidiana/60 md:hidden" onClick={aoFechar} />}
      <nav className={`w-56 shrink-0 border-r border-borda bg-superficie flex flex-col overflow-y-auto fixed inset-y-14 left-0 z-20 md:static md:inset-auto md:bg-superficie/40 ${gavetaAberta ? '' : 'max-md:hidden'}`}>
        <div className="px-3 py-3 border-b border-borda flex items-center justify-between md:hidden">
          <p className="text-xs font-titulo">{infoCategoria ? infoCategoria.rotulo : ''}</p>
          <button onClick={aoFechar} aria-label="Fechar menu" className="text-texto-suave hover:text-texto">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 py-2">
          {/* A aba "Dashboard" também abre esta sidebar (seção descoberta); este
              item fixo leva à tela de métricas, igual ao botão "Painel". */}
          {categoria === 'descoberta' && (
            <div className="mb-1 pb-1 border-b border-borda">
              <button
                onClick={() => aoIrPara('dashboard')}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm transition-colors ${
                  telaAtiva === 'dashboard'
                    ? 'text-texto bg-realce/[0.06] border-l-2 border-texto'
                    : 'text-texto-suave hover:text-texto border-l-2 border-transparent'
                }`}
              >
                <LayoutDashboard size={15} />
                <span>Visão geral</span>
              </button>
            </div>
          )}
          {grupos.map((grupo) => (
            <div key={grupo.nome} className="mb-1">
              <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-widest text-texto-suave">{grupo.nome}</p>
              {grupo.itens.map(({ chave, rotulo, icone: Icone, recurso }) => (
                <button
                  key={chave}
                  onClick={() => aoIrPara(chave)}
                  aria-label={rotulo}
                  title={rotulo}
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm transition-colors ${
                    telaAtiva === chave
                      ? 'text-texto bg-realce/[0.06] border-l-2 border-texto'
                      : 'text-texto-suave hover:text-texto border-l-2 border-transparent'
                  }`}
                >
                  <Icone size={15} />
                  <span>{rotulo}</span>
                  {!temRecurso(recurso) && <Lock size={11} className="ml-auto" aria-label="fora do seu plano" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}
