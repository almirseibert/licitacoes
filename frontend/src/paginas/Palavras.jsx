import { useEffect, useState } from 'react';
import { api } from '../servicos/api';

/**
 * Tela de Palavras-chave — leitura. A edição com "Simular" entra na Fase 2
 * (seção 16): é o que permite adicionar "videomonitoramento" sem tocar em código.
 */
export default function Palavras() {
  const [palavras, setPalavras] = useState([]);
  const [excluidas, setExcluidas] = useState([]);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    api.palavras()
      .then((r) => {
        setPalavras(r.dados);
        setExcluidas(r.excluidas);
      })
      .catch((e) => setErro(e.message));
  }, []);

  const grupos = [...new Set(palavras.map((p) => p.grupo))];

  return (
    <div className="h-full overflow-auto">
      <div className="px-4 py-3 border-b border-borda flex items-center gap-4">
        <h1 className="font-titulo text-xl">Palavras-chave</h1>
        <p className="text-xs text-texto-suave">
          {palavras.length} termos · {excluidas.length} palavras de corte. Edição entra na Fase 2.
        </p>
      </div>

      {erro && <p className="m-4 text-sm text-erro">{erro}</p>}

      <div className="p-4 grid gap-4 lg:grid-cols-3">
        {grupos.map((grupo) => (
          <section key={grupo} className="border border-borda rounded bg-superficie">
            <h2 className="px-3 py-2 text-xs uppercase tracking-wide text-texto-suave border-b border-borda">
              {grupo}
            </h2>
            <ul className="divide-y divide-borda/60">
              {palavras
                .filter((p) => p.grupo === grupo)
                .map((p) => (
                  <li key={p.id} className="px-3 py-1.5 flex items-center gap-2 text-sm">
                    <span className={p.ativa ? '' : 'text-texto-suave line-through'}>{p.termo}</span>
                    <span className="ml-auto font-mono text-[11px] text-texto-suave">peso {p.peso}</span>
                    <span className="font-mono text-[11px] text-texto-suave w-10 text-right" title="licitações no radar com esta palavra">
                      {p.licitacoes}
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        ))}

        <section className="border border-borda rounded bg-superficie">
          <h2 className="px-3 py-2 text-xs uppercase tracking-wide text-texto-suave border-b border-borda">
            Palavras excluídas — cortam ruído
          </h2>
          <ul className="divide-y divide-borda/60">
            {excluidas.map((e) => (
              <li key={e.id} className="px-3 py-1.5 text-sm">
                <span className={e.ativa ? '' : 'text-texto-suave line-through'}>{e.termo}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
