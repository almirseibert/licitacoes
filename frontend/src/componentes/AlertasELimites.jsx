import { useEffect, useState } from 'react';
import { Loader2, Save, Mail, MessageCircle } from 'lucide-react';
import { api } from '../servicos/api';

/**
 * Alertas e limites (seção 11.13) — destino do aviso, teto de download e
 * janela de coleta.
 *
 * Regra do lugar, e vale repetir na tela: variável de ambiente é o padrão de
 * quem sobe o serviço; o que está digitado aqui tem a última palavra. Campo
 * vazio devolve a chave ao ambiente — é como se apaga uma configuração, em vez
 * de ter um botão "restaurar" que ninguém entende.
 *
 * `canais` vem do backend e é a diferença entre "configurei" e "vai chegar":
 * sem SMTP_HOST no ambiente, destinatário preenchido aqui não faz e-mail
 * nenhum sair, e a tela precisa dizer isso.
 */

const ROTULOS = {
  alerta_email_para: { rotulo: 'E-mail que recebe os alertas', tipo: 'text' },
  alerta_whatsapp_destino: { rotulo: 'WhatsApp que recebe os alertas', tipo: 'text' },
  radar_cidade_base: { rotulo: 'Cidade-base do raio de atuação (Radar)', tipo: 'cidade' },
  limite_mb_por_licitacao: { rotulo: 'Teto de download por licitação (MB)', tipo: 'number' },
  coleta_hora_inicio: { rotulo: 'Coleta automática começa às', tipo: 'number' },
  coleta_hora_fim: { rotulo: 'Coleta automática termina às', tipo: 'number' },
};

export default function AlertasELimites({ ajustes, canais, aoErro, aoAvisar, aoSalvar }) {
  const [campos, setCampos] = useState({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setCampos({});
  }, [ajustes]);

  // Na ordem em que ROTULOS declara, não na que o banco devolve: por chave,
  // "termina às" vinha antes de "começa às", o que se lê como erro de tela.
  const ordem = Object.keys(ROTULOS);
  const lista = (ajustes || [])
    .filter((a) => ROTULOS[a.chave])
    .sort((a, b) => ordem.indexOf(a.chave) - ordem.indexOf(b.chave));
  const valorDe = (chave) => {
    if (chave in campos) return campos[chave];
    const achado = lista.find((a) => a.chave === chave);
    return achado && achado.valor !== null ? String(achado.valor) : '';
  };
  const temAlteracao = Object.keys(campos).length > 0;

  const salvar = async () => {
    setSalvando(true);
    try {
      const r = await api.salvarAjustes(campos);
      aoAvisar(r.mensagem);
      aoErro(null);
      setCampos({});
      if (aoSalvar) await aoSalvar();
    } catch (e) {
      aoErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  if (!lista.length) {
    return (
      <section className="border border-borda rounded bg-superficie lg:col-span-2">
        <h2 className="px-3 py-2 text-xs uppercase tracking-wide text-texto-suave border-b border-borda">
          Alertas e limites
        </h2>
        <p className="px-3 py-6 text-sm text-texto-suave">
          Rode <span className="font-mono">npm run migrar</span> para criar a tabela de configurações
          (migração 015). Até lá, estes ajustes só saem das variáveis de ambiente.
        </p>
      </section>
    );
  }

  return (
    <section className="border border-borda rounded bg-superficie lg:col-span-2">
      <h2 className="px-3 py-2 text-xs uppercase tracking-wide text-texto-suave border-b border-borda flex items-center gap-2">
        Alertas e limites
        <button
          className="botao-primario ml-auto flex items-center gap-1 normal-case"
          onClick={salvar}
          disabled={!temAlteracao || salvando}
        >
          {salvando ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          Salvar ajustes
        </button>
      </h2>

      {canais && (
        <div className="px-3 py-2 border-b border-borda flex flex-wrap gap-4 text-xs">
          <Canal icone={<Mail size={13} />} nome="E-mail" ligado={canais.email} />
          <Canal icone={<MessageCircle size={13} />} nome="WhatsApp" ligado={canais.whatsapp} />
          <span className="text-texto-suave">
            O sino do painel recebe sempre — e-mail e WhatsApp são o empurrão para quem está longe da tela.
          </span>
        </div>
      )}

      <div className="p-3 grid gap-3 md:grid-cols-2">
        {lista.map((a) => {
          const def = ROTULOS[a.chave];
          const doAmbiente = a.valor === null;
          if (def.tipo === 'cidade') {
            return (
              <CidadeBase
                key={a.chave}
                rotulo={def.rotulo}
                descricao={a.descricao}
                codigo={valorDe(a.chave)}
                aoEscolher={(codigo) => setCampos({ ...campos, [a.chave]: codigo })}
              />
            );
          }
          return (
            <label key={a.chave} className="block">
              <span className="text-[11px] uppercase tracking-wide text-texto-suave">{def.rotulo}</span>
              <input
                type={def.tipo}
                className="campo-caixa w-full mt-0.5 disabled:opacity-60"
                value={valorDe(a.chave)}
                placeholder={doAmbiente ? (a.global ? 'usando a variável de ambiente' : 'ninguém recebe por este canal') : ''}
                disabled={a.editavel === false}
                onChange={(e) => setCampos({ ...campos, [a.chave]: e.target.value })}
              />
              <span className="block text-[11px] text-texto-suave mt-0.5">
                {a.descricao}
                {/* Seção 1b: o que é operação do serviço vale para todos e só a equipe do painel muda. */}
                {a.editavel === false && ' Vale para todo o serviço; só a equipe do painel muda.'}
              </span>
            </label>
          );
        })}
      </div>

      <p className="px-3 py-2 text-[11px] text-texto-suave border-t border-borda">
        Janela de coleta de 0 às 23 quer dizer "a qualquer hora". A seção 5.4 prefere a madrugada para a
        varredura larga; o que roda de hora em hora é leve e pode ficar o dia todo.
      </p>
    </section>
  );
}

/**
 * Cidade de partida do raio do Radar (Seção 7b). Guarda o código IBGE — o que o Radar
 * usa — mas mostra e busca pelo nome. Limpar o campo devolve a chave ao padrão.
 */
function CidadeBase({ rotulo, descricao, codigo, aoEscolher }) {
  const [texto, setTexto] = useState('');
  const [opcoes, setOpcoes] = useState([]);
  const [nome, setNome] = useState('');

  // Nome da cidade já escolhida (ou digitada como código).
  useEffect(() => {
    let vivo = true;
    if (!/^\d{7}$/.test(codigo || '')) {
      setNome('');
      return undefined;
    }
    api.municipioPorCodigo(codigo).then((r) => {
      if (vivo) setNome(r.dados[0] ? `${r.dados[0].nome} — ${r.dados[0].uf}` : 'código não encontrado');
    }).catch(() => vivo && setNome(''));
    return () => { vivo = false; };
  }, [codigo]);

  useEffect(() => {
    if (texto.trim().length < 2) {
      setOpcoes([]);
      return undefined;
    }
    let vivo = true;
    const espera = setTimeout(() => {
      api.municipios(texto.trim()).then((r) => vivo && setOpcoes(r.dados || [])).catch(() => {});
    }, 250);
    return () => { vivo = false; clearTimeout(espera); };
  }, [texto]);

  return (
    <div className="block relative">
      <label>
        <span className="text-[11px] uppercase tracking-wide text-texto-suave">{rotulo}</span>
        <input
          className="campo-caixa w-full mt-0.5"
          value={texto}
          placeholder={nome || (codigo ? 'conferindo…' : 'digite o nome da cidade')}
          onChange={(e) => setTexto(e.target.value)}
        />
      </label>
      {opcoes.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full max-h-48 overflow-auto bg-superficie border border-borda rounded shadow-lg text-sm" role="listbox">
          {opcoes.map((m) => (
            <li key={m.codigo_ibge}>
              <button type="button" className="w-full text-left px-3 py-1.5 hover:bg-realce/10"
                onClick={() => { aoEscolher(m.codigo_ibge); setTexto(''); setOpcoes([]); }}>
                {m.nome} — {m.uf}
              </button>
            </li>
          ))}
        </ul>
      )}
      <span className="block text-[11px] text-texto-suave mt-0.5">
        {nome ? `Escolhida: ${nome}. ` : ''}{descricao}
        {codigo && (
          <button type="button" className="ml-2 underline hover:text-texto" onClick={() => aoEscolher('')}>limpar</button>
        )}
      </span>
    </div>
  );
}

function Canal({ icone, nome, ligado }) {
  return (
    <span className={`flex items-center gap-1.5 ${ligado ? 'text-ok' : 'text-texto-suave'}`}>
      {icone}
      {nome}: {ligado ? 'ligado' : 'desligado'}
    </span>
  );
}
