import { useEffect, useState } from 'react';
import { api } from '../servicos/api';

const rotuloCampo = 'block text-[11px] uppercase tracking-wide text-texto-suave mb-1';
const campo =
  'w-full bg-superficie border border-borda rounded px-2 py-1.5 text-sm text-texto ' +
  'focus:outline-none focus:border-voltagem/60 placeholder:text-texto-suave/50';

/** "2026-11-13" no fuso de quem usa o painel, com `deslocamento` em dias. */
function dia(deslocamento = 0) {
  const d = new Date();
  d.setDate(d.getDate() + deslocamento);
  return d.toLocaleDateString('en-CA');
}

/**
 * Os filtros da Seção 7 que não cabem na linha principal do Radar: região,
 * raio, esfera, situação, órgão, nº do edital e do processo, texto nos itens e
 * na observação, datas de inclusão e de prazo com atalhos.
 */
export default function FiltrosAvancados({ valores, opcoes, onMudar }) {
  const definir = (campos) => onMudar({ ...valores, ...campos, pagina: 1 });
  const mudar = (nome) => (e) => definir({ [nome]: e.target.value });

  return (
    <div className="px-4 pb-3 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3 border-t border-borda pt-3">
      <div>
        <label className={rotuloCampo}>Região</label>
        <select className={campo} value={valores.regiao || ''} onChange={mudar('regiao')}>
          <option value="">Todas</option>
          {(opcoes.regioes || []).map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <Raio valores={valores} opcoes={opcoes} definir={definir} />

      <div>
        <label className={rotuloCampo}>Esfera</label>
        <select className={campo} value={valores.esfera || ''} onChange={mudar('esfera')}>
          <option value="">Todas</option>
          {(opcoes.esferas || []).map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      <div>
        <label className={rotuloCampo}>Situação</label>
        <select className={campo} value={valores.situacao || ''} onChange={mudar('situacao')}>
          <option value="">Todas</option>
          {(opcoes.situacoes || []).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <Texto rotulo="Órgão ou CNPJ" valor={valores.orgao} onChange={mudar('orgao')} dica="prefeitura de…" />
      <Texto rotulo="Nº do edital" valor={valores.numero_edital} onChange={mudar('numero_edital')} dica="90012/2026" />
      <Texto rotulo="Nº do processo" valor={valores.processo} onChange={mudar('processo')} />
      <Texto rotulo="Texto nos itens" valor={valores.texto_itens} onChange={mudar('texto_itens')} dica="cartucho, cadeira…" />
      <Texto rotulo="Texto na observação" valor={valores.observacao} onChange={mudar('observacao')} />

      <Periodo
        rotulo="Incluída em"
        de={valores.inclusao_de}
        ate={valores.inclusao_ate}
        atalhos={[['hoje', 0], ['ontem', -1]]}
        onMudar={(de, ate) => definir({ inclusao_de: de, inclusao_ate: ate })}
      />
      <Periodo
        rotulo="Prazo termina em"
        de={valores.prazo_de}
        ate={valores.prazo_ate}
        atalhos={[['hoje', 0], ['amanhã', 1]]}
        onMudar={(de, ate) => definir({ prazo_de: de, prazo_ate: ate })}
      />
    </div>
  );
}

function Texto({ rotulo, valor, onChange, dica = '' }) {
  return (
    <div>
      <label className={rotuloCampo}>{rotulo}</label>
      <input className={campo} value={valor || ''} onChange={onChange} placeholder={dica} />
    </div>
  );
}

function Periodo({ rotulo, de, ate, atalhos, onMudar }) {
  return (
    <div className="col-span-2">
      <label className={rotuloCampo}>
        {rotulo}
        {atalhos.map(([nome, deslocamento]) => (
          <button
            key={nome}
            type="button"
            onClick={() => onMudar(dia(deslocamento), dia(deslocamento))}
            className="ml-2 normal-case tracking-normal underline decoration-dotted hover:text-texto"
          >
            {nome}
          </button>
        ))}
        {(de || ate) && (
          <button type="button" onClick={() => onMudar('', '')} className="ml-2 normal-case tracking-normal hover:text-texto">
            × limpar
          </button>
        )}
      </label>
      <div className="flex items-center gap-1">
        <input type="date" aria-label={`${rotulo}: de`} className={campo} value={de || ''} onChange={(e) => onMudar(e.target.value, ate)} />
        <span className="text-texto-suave text-xs">a</span>
        <input type="date" aria-label={`${rotulo}: até`} className={campo} value={ate || ''} onChange={(e) => onMudar(de, e.target.value)} />
      </div>
    </div>
  );
}

/** Raio em km a partir de uma cidade: a escolhida aqui ou a da organização. */
function Raio({ valores, opcoes, definir }) {
  const base = opcoes.cidade_base;
  const [busca, setBusca] = useState(valores.raio_centro_nome || '');
  const [sugestoes, setSugestoes] = useState([]);

  useEffect(() => {
    if (busca.length < 2 || busca === valores.raio_centro_nome) {
      setSugestoes([]);
      return undefined;
    }
    const atraso = setTimeout(() => {
      api.municipios(busca).then((r) => setSugestoes(r.dados)).catch(() => setSugestoes([]));
    }, 300);
    return () => clearTimeout(atraso);
  }, [busca, valores.raio_centro_nome]);

  const escolher = (m) => {
    const nome = `${m.nome}/${m.uf}`;
    setBusca(nome);
    setSugestoes([]);
    definir({ raio_centro: String(m.codigo_ibge), raio_centro_nome: nome });
  };

  return (
    <div className="col-span-2 relative">
      <label className={rotuloCampo}>Raio de atuação</label>
      <div className="flex items-center gap-1">
        <select
          className={`${campo.replace('w-full ', '')} w-24 shrink-0`}
          value={valores.raio_km || ''}
          onChange={(e) => definir({ raio_km: e.target.value })}
          aria-label="Raio em km"
        >
          <option value="">sem raio</option>
          {[50, 100, 200, 300, 500].map((km) => <option key={km} value={km}>{km} km</option>)}
        </select>
        <input
          className={`${campo} min-w-0`}
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            if (!e.target.value) definir({ raio_centro: '', raio_centro_nome: '' });
          }}
          placeholder={base ? `de ${base.nome}/${base.uf}` : 'cidade de partida'}
          aria-label="Cidade de partida do raio"
        />
      </div>
      {sugestoes.length > 0 && (
        <ul className="absolute z-30 left-0 right-0 mt-1 max-h-56 overflow-auto bg-superficie border border-borda rounded shadow text-sm">
          {sugestoes.map((m) => (
            <li key={m.codigo_ibge}>
              <button type="button" onClick={() => escolher(m)} className="w-full text-left px-2 py-1 hover:bg-realce/[0.06]">
                {m.nome}/{m.uf}
              </button>
            </li>
          ))}
        </ul>
      )}
      {valores.raio_km && !valores.raio_centro && !base && (
        <p className="text-[11px] text-atencao mt-1">Escolha a cidade de partida para o raio valer.</p>
      )}
    </div>
  );
}
