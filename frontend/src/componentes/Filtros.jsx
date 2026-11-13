import { useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import FiltrosAvancados from './FiltrosAvancados';

// Os campos do painel "mais filtros" — para contar quantos estão ligados.
const AVANCADOS = [
  'regiao', 'raio_km', 'esfera', 'situacao', 'orgao', 'numero_edital', 'processo', 'texto_itens',
  'observacao', 'inclusao_de', 'inclusao_ate', 'prazo_de', 'prazo_ate',
];

const rotuloCampo = 'block text-[11px] uppercase tracking-wide text-texto-suave mb-1';
const campo =
  'w-full bg-superficie border border-borda rounded px-2 py-1.5 text-sm text-texto ' +
  'focus:outline-none focus:border-voltagem/60 placeholder:text-texto-suave/50';

/**
 * Filtros do topo do Radar (seção 11.1). O estado vive no Radar, que salva
 * tudo no localStorage por usuário.
 */
export default function Filtros({ valores, opcoes, onMudar, onLimpar }) {
  const mudar = (campoNome) => (evento) => onMudar({ ...valores, [campoNome]: evento.target.value, pagina: 1 });
  const alternar = (nome) => () => onMudar({ ...valores, [nome]: valores[nome] === '1' ? '' : '1', pagina: 1 });
  const ligados = AVANCADOS.filter((c) => valores[c]).length;
  const [aberto, setAberto] = useState(ligados > 0);

  return (
    <div className="border-b border-borda bg-obsidiana/80 backdrop-blur sticky top-0 z-20 imprimir-oculto">
      <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <div className="col-span-2 md:col-span-2">
          <label className={rotuloCampo} title='Palavras soltas: todas, em qualquer ordem. Entre aspas: a frase exata.'>
            Buscar no objeto <span className="normal-case tracking-normal">(&quot;entre aspas&quot; = exata)</span>
          </label>
          <div className="relative">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-texto-suave" />
            <input
              className={`${campo} pl-7`}
              placeholder='toner "cartucho original"'
              value={valores.busca || ''}
              onChange={mudar('busca')}
            />
          </div>
        </div>

        <div>
          <label className={rotuloCampo}>Grupo</label>
          <select className={campo} value={valores.grupo || ''} onChange={mudar('grupo')}>
            <option value="">Todos</option>
            {(opcoes.grupos || []).map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={rotuloCampo}>UF</label>
          <select className={campo} value={valores.uf || ''} onChange={mudar('uf')}>
            <option value="">Todas</option>
            {(opcoes.ufs || []).map((u) => (
              <option key={u.uf} value={u.uf}>{u.uf} ({u.total})</option>
            ))}
          </select>
        </div>

        <div>
          <label className={rotuloCampo}>Modalidade</label>
          <select className={campo} value={valores.modalidade || ''} onChange={mudar('modalidade')}>
            <option value="">Todas</option>
            {(opcoes.modalidades || []).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={rotuloCampo}>Pontuação mín.</label>
          <select className={campo} value={valores.pontuacao_min ?? 30} onChange={mudar('pontuacao_min')}>
            <option value="0">Tudo</option>
            <option value="30">30 — Talvez</option>
            <option value="55">55 — Vale analisar</option>
            <option value="80">80 — Prioridade alta</option>
          </select>
        </div>

        <div>
          <label className={rotuloCampo}>Fecha em até</label>
          <select className={campo} value={valores.prazo_dias || ''} onChange={mudar('prazo_dias')}>
            <option value="">Qualquer prazo</option>
            <option value="2">2 dias</option>
            <option value="7">7 dias</option>
            <option value="15">15 dias</option>
            <option value="30">30 dias</option>
          </select>
        </div>

        <div>
          <label className={rotuloCampo}>Valor até</label>
          <select className={campo} value={valores.valor_max || ''} onChange={mudar('valor_max')}>
            <option value="">Sem limite</option>
            <option value="5000">R$ 5 mil</option>
            <option value="80000">R$ 80 mil (ME/EPP)</option>
            <option value="200000">R$ 200 mil</option>
          </select>
        </div>
      </div>

      <div className="px-4 pb-3 flex flex-wrap items-center gap-2 text-xs">
        <Marcador ativo={valores.exclusivo_me === '1'} onClick={() => onMudar({ ...valores, exclusivo_me: valores.exclusivo_me === '1' ? '' : '1', pagina: 1 })}>
          Exclusivo ME/EPP
        </Marcador>
        <Marcador ativo={valores.novas_24h === '1'} onClick={() => onMudar({ ...valores, novas_24h: valores.novas_24h === '1' ? '' : '1', pagina: 1 })}>
          Novas em 24 h
        </Marcador>
        <Marcador ativo={valores.favorito === '1'} onClick={() => onMudar({ ...valores, favorito: valores.favorito === '1' ? '' : '1', pagina: 1 })}>
          Favoritas
        </Marcador>
        <Marcador ativo={valores.srp === '1'} onClick={alternar('srp')}>SRP</Marcador>
        <Marcador ativo={valores.com_edital === '1'} onClick={alternar('com_edital')}>Com edital baixado</Marcador>
        <Marcador ativo={valores.monitorada === '1'} onClick={alternar('monitorada')}>Monitoradas</Marcador>
        <Marcador ativo={valores.em_aberto !== '0'} onClick={() => onMudar({ ...valores, em_aberto: valores.em_aberto === '0' ? '1' : '0', pagina: 1 })}>
          Só em aberto
        </Marcador>

        <button
          onClick={() => setAberto(!aberto)}
          aria-expanded={aberto}
          className="flex items-center gap-1 px-2 py-1 rounded border border-borda text-texto-suave hover:text-texto"
        >
          <SlidersHorizontal size={12} /> mais filtros{ligados ? ` (${ligados})` : ''}
        </button>

        <select
          className="ml-auto bg-superficie border border-borda rounded px-2 py-1 text-xs text-texto-suave"
          value={valores.ordem || 'relevancia'}
          onChange={mudar('ordem')}
        >
          <option value="relevancia">Pontuação, depois prazo</option>
          <option value="prazo">Prazo mais curto</option>
          <option value="valor">Maior valor</option>
          <option value="recentes">Mais recentes</option>
        </select>

        <button onClick={onLimpar} className="flex items-center gap-1 text-texto-suave hover:text-texto px-2 py-1">
          <X size={12} /> limpar
        </button>
      </div>

      {aberto && <FiltrosAvancados valores={valores} opcoes={opcoes} onMudar={onMudar} />}
    </div>
  );
}

function Marcador({ ativo, onClick, children }) {
  return (
    // O acento só aparece na pontuação alta (seção 15): marcador ativo usa contraste, não cor.
    <button
      onClick={onClick}
      className={`px-2 py-1 rounded border transition-colors ${
        ativo
          ? 'border-texto-suave/70 text-texto bg-realce/[0.06]'
          : 'border-borda text-texto-suave hover:text-texto'
      }`}
    >
      {children}
    </button>
  );
}
