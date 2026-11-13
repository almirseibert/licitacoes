import { useCallback, useEffect, useState } from 'react';
import { Loader2, UserPlus, Trash2, Copy } from 'lucide-react';
import { api } from '../servicos/api';
import { data as formatarData } from '../servicos/formato';

const PAPEIS = [
  { chave: 'dono', rotulo: 'Dono', explica: 'tudo, inclusive passar a posição de dono' },
  { chave: 'admin', rotulo: 'Administrador', explica: 'convida, muda papéis e configura' },
  { chave: 'membro', rotulo: 'Membro', explica: 'usa o painel no dia a dia' },
  { chave: 'leitor', rotulo: 'Leitor', explica: 'só consulta, não muda nada' },
];
const ROTULO = Object.fromEntries(PAPEIS.map((p) => [p.chave, p.rotulo]));
const NIVEL = { leitor: 0, membro: 1, admin: 2, dono: 3 };

/**
 * Equipe da organização (Seção 1b): quem tem acesso, com que papel, e os
 * convites abertos. Todo membro vê a lista; só admin e dono mexem.
 */
export default function Equipe() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [link, setLink] = useState(null);
  const [convite, setConvite] = useState({ email: '', papel: 'membro' });
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(() => {
    api.equipe().then(setDados).catch((e) => setErro(e.message));
  }, []);
  useEffect(carregar, [carregar]);

  const agir = async (acao) => {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      const r = await acao();
      if (r && r.mensagem) setAviso(r.mensagem);
      carregar();
      return r;
    } catch (e) {
      setErro(e.message);
      return null;
    } finally {
      setOcupado(false);
    }
  };

  const convidar = async (evento) => {
    evento.preventDefault();
    setLink(null);
    const r = await agir(() => api.convidar(convite.email, convite.papel));
    if (r) {
      setConvite({ email: '', papel: convite.papel });
      // Sem e-mail configurado, o link volta para ser mandado à mão.
      if (!r.email_enviado) setLink(r.link);
    }
  };

  if (!dados) {
    return (
      <div className="p-6 text-sm text-texto-suave">
        {erro || (
          <span className="flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" /> carregando a equipe…
          </span>
        )}
      </div>
    );
  }

  const meuNivel = NIVEL[dados.eu.papel] ?? 0;
  const administra = meuNivel >= NIVEL.admin;
  // Admin não oferece "dono"; só o dono passa a posição.
  const papeisOferecidos = PAPEIS.filter((p) => p.chave !== 'dono' || dados.eu.papel === 'dono');

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <header className="mb-5">
        <h1 className="font-titulo text-xl">Equipe</h1>
        <p className="text-xs text-texto-suave">
          Quem entra no painel desta organização.
        </p>
      </header>

      {erro && <p className="text-xs text-erro mb-3" role="alert">{erro}</p>}
      {aviso && <p className="text-xs text-ok mb-3" role="status">{aviso}</p>}

      <section className="border border-borda rounded bg-superficie mb-5">
        <h2 className="px-3 py-2 text-xs uppercase tracking-wide text-texto-suave border-b border-borda">
          Pessoas ({dados.membros.length})
        </h2>
        <ul>
          {dados.membros.map((m) => {
            const souEu = m.id === dados.eu.id;
            const podeMexer = administra && !souEu && (m.papel !== 'dono' || dados.eu.papel === 'dono');
            return (
              <li key={m.id} className="px-3 py-2 border-b border-borda last:border-b-0 flex flex-wrap items-center gap-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate">
                    {m.nome} {souEu && <span className="text-texto-suave text-xs">(você)</span>}
                  </p>
                  <p className="text-xs text-texto-suave truncate">{m.email}</p>
                </div>
                {podeMexer ? (
                  <select
                    className="campo-caixa text-xs"
                    value={m.papel}
                    disabled={ocupado}
                    aria-label={`Papel de ${m.nome}`}
                    onChange={(e) => agir(() => api.mudarPapel(m.id, e.target.value))}
                  >
                    {papeisOferecidos.map((p) => (
                      <option key={p.chave} value={p.chave}>{p.rotulo}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-texto-suave">{ROTULO[m.papel] || m.papel}</span>
                )}
                {podeMexer && m.papel !== 'dono' && (
                  <button
                    className="text-texto-suave hover:text-erro"
                    title="Tirar da organização"
                    aria-label={`Tirar ${m.nome} da organização`}
                    disabled={ocupado}
                    onClick={() => {
                      if (window.confirm(`Tirar ${m.nome} desta organização? A conta dela continua existindo.`)) {
                        agir(() => api.removerDaEquipe(m.id));
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {administra && (
        <section className="border border-borda rounded bg-superficie">
          <h2 className="px-3 py-2 text-xs uppercase tracking-wide text-texto-suave border-b border-borda">
            Convidar
          </h2>
          <form onSubmit={convidar} className="p-3 flex flex-wrap gap-2 items-end">
            <label className="flex-1 min-w-[200px]">
              <span className="block text-[11px] uppercase tracking-wide text-texto-suave mb-0.5">E-mail</span>
              <input
                type="email"
                required
                className="campo-caixa w-full"
                value={convite.email}
                onChange={(e) => setConvite({ ...convite, email: e.target.value })}
              />
            </label>
            <label>
              <span className="block text-[11px] uppercase tracking-wide text-texto-suave mb-0.5">Papel</span>
              <select
                className="campo-caixa"
                value={convite.papel}
                onChange={(e) => setConvite({ ...convite, papel: e.target.value })}
              >
                {PAPEIS.filter((p) => p.chave !== 'dono').map((p) => (
                  <option key={p.chave} value={p.chave}>{p.rotulo} — {p.explica}</option>
                ))}
              </select>
            </label>
            <button type="submit" className="botao-primario flex items-center gap-1" disabled={ocupado}>
              {ocupado ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
              Convidar
            </button>
          </form>

          {link && (
            <div className="mx-3 mb-3 p-2 rounded border border-atencao/40 text-xs">
              <p className="text-atencao mb-1">O e-mail do painel não está configurado: mande este link à mão. Vale 72 h.</p>
              <div className="flex items-center gap-2">
                <code className="truncate flex-1">{link}</code>
                <button
                  className="text-texto-suave hover:text-texto"
                  title="Copiar o link"
                  onClick={() => navigator.clipboard && navigator.clipboard.writeText(link)}
                >
                  <Copy size={13} />
                </button>
              </div>
            </div>
          )}

          {dados.convites.length > 0 && (
            <ul className="border-t border-borda">
              {dados.convites.map((c) => (
                <li key={c.id} className="px-3 py-2 border-b border-borda last:border-b-0 flex items-center gap-3 text-sm">
                  <span className="flex-1 truncate">{c.email}</span>
                  <span className="text-xs text-texto-suave">{ROTULO[c.papel]}</span>
                  <span className="text-xs text-texto-suave">vence {formatarData(c.expira_em)}</span>
                  <button
                    className="text-texto-suave hover:text-erro"
                    title="Cancelar o convite"
                    aria-label={`Cancelar o convite de ${c.email}`}
                    disabled={ocupado}
                    onClick={() => agir(() => api.cancelarConvite(c.id))}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
