import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { api, obterToken } from '../servicos/api';
import { definirTema, temaAtual } from '../servicos/tema';

/**
 * Alternador claro/escuro (Seção 2 do plano SaaS). Troca na hora e guarda no
 * navegador; salvar no usuário é melhor-esforço — se a rede falhar, a escolha vale
 * nesta sessão e o banco volta a mandar no próximo login.
 */
export default function AlternarTema({ compacto = false }) {
  const [tema, setTema] = useState(temaAtual);

  useEffect(() => {
    const aoMudar = (e) => setTema(e.detail);
    window.addEventListener('tema', aoMudar);
    return () => window.removeEventListener('tema', aoMudar);
  }, []);

  const alternar = () => {
    const novo = tema === 'escuro' ? 'claro' : 'escuro';
    definirTema(novo);
    if (obterToken()) api.salvarTema(novo).catch(() => {});
  };

  const Icone = tema === 'escuro' ? Sun : Moon;
  const rotulo = tema === 'escuro' ? 'Tema claro' : 'Tema escuro';
  return (
    <button
      type="button"
      onClick={alternar}
      title={rotulo}
      aria-label={rotulo}
      className="flex items-center gap-2 text-xs text-texto-suave hover:text-texto"
    >
      <Icone size={14} />
      {!compacto && <span className="hidden md:inline">{rotulo.toLowerCase()}</span>}
    </button>
  );
}
