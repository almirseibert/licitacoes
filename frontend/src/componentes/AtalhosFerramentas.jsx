import { TELAS } from '../config/navegacao';

// Atalhos para as ferramentas mais usadas, agrupados como o "Nossas
// Ferramentas" do benchmark — mas só as principais, não as 34 do menu.
const GRUPOS = [
  { rotulo: 'Oportunidades', itens: ['radar', 'boletins', 'oportunidades', 'precos'] },
  { rotulo: 'Gestão', itens: ['funil', 'tarefas', 'contratos', 'cofre'] },
  { rotulo: 'Inteligência', itens: ['diagnostico', 'analise_mercado', 'juridico'] },
  { rotulo: 'Automação', itens: ['monitor_chat', 'acompanhamentos'] },
];

export default function AtalhosFerramentas({ aoIr, temRecurso }) {
  return (
    <section aria-label="Atalhos" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {GRUPOS.map((grupo) => (
        <div key={grupo.rotulo} className="border border-borda rounded bg-superficie/40 p-3">
          <p className="text-[10px] uppercase tracking-widest text-texto-suave mb-2">{grupo.rotulo}</p>
          <div className="space-y-0.5">
            {grupo.itens.map((chave) => {
              const tela = TELAS.find((t) => t.chave === chave);
              if (!tela) return null;
              const Icone = tela.icone;
              const liberado = temRecurso(tela.recurso);
              return (
                <button
                  key={chave}
                  onClick={() => aoIr(chave)}
                  className="w-full flex items-center gap-2 px-1.5 py-1.5 rounded text-sm text-left text-texto-suave hover:text-texto hover:bg-realce/[0.05]"
                >
                  <Icone size={14} />
                  <span className="flex-1">{tela.rotulo}</span>
                  {!liberado && <span className="text-[10px] text-texto-suave/70">plano</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
