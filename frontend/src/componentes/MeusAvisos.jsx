import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, Loader2, Mail, MessageCircle, MonitorSmartphone, Save, Send } from 'lucide-react';
import { api } from '../servicos/api';

/**
 * Avisos por tipo e por canal (Seção 9 do plano de SaaS).
 *
 * Cada pessoa liga e desliga, por canal, os tipos que quer receber — e diz
 * para onde. Admin também acerta a caixa da organização (o e-mail/WhatsApp de
 * "Alertas e limites"). O sino do painel recebe tudo, sempre: o que se desliga
 * aqui é só o empurrão para fora.
 */
const ICONES = { email: Mail, whatsapp: MessageCircle, push: MonitorSmartphone };

function base64ParaBytes(base64) {
  const preenchido = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(preenchido), (c) => c.charCodeAt(0));
}

const pushSuportado = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

export default function MeusAvisos({ aoErro, aoAvisar }) {
  const [dados, setDados] = useState(null);
  const [escopo, setEscopo] = useState('eu');
  const [destinos, setDestinos] = useState({ email: '', whatsapp: '' });
  const [ocupado, setOcupado] = useState(null);
  // Inscrição DESTE navegador. Ela só vale se o servidor também a tem (a org
  // atual e nenhum 410 que a apagou): por isso `ativoAqui` cruza com `navegadores`.
  const [inscricaoLocal, setInscricaoLocal] = useState(null);

  const carregar = useCallback(async () => {
    try {
      const r = await api.notificacoes();
      setDados(r);
      setDestinos({ email: r.destinos.email || '', whatsapp: r.destinos.whatsapp || '' });
    } catch (e) {
      aoErro(e.message);
    }
  }, [aoErro]);

  useEffect(() => {
    carregar();
    if (pushSuportado()) {
      navigator.serviceWorker
        .getRegistration('/sw.js')
        .then((reg) => (reg ? reg.pushManager.getSubscription() : null))
        .then(setInscricaoLocal)
        .catch(() => setInscricaoLocal(null));
    }
  }, [carregar]);

  if (!dados) {
    return (
      <section className="border border-borda rounded bg-superficie lg:col-span-2 p-3 text-sm text-texto-suave">
        Carregando avisos…
      </section>
    );
  }

  const ativoAqui = Boolean(inscricaoLocal) && dados.destinos.navegadores > 0;
  const daOrganizacao = escopo === 'organizacao';
  const matriz = daOrganizacao ? dados.organizacao.matriz : dados.minhas;
  const somenteLeitura = daOrganizacao && !dados.organizacao.editavel;
  // A caixa da organização não tem navegador: push é de cada pessoa.
  const canais = daOrganizacao ? dados.canais.filter((c) => c.chave !== 'push') : dados.canais;

  const alternar = async (tipo, canal, ativo) => {
    setOcupado(`${tipo}:${canal}`);
    try {
      const r = await api.salvarPreferenciasAviso(escopo, [{ tipo, canal, ativo }]);
      setDados((d) =>
        daOrganizacao ? { ...d, organizacao: { ...d.organizacao, matriz: r.matriz } } : { ...d, minhas: r.matriz }
      );
      aoErro(null);
    } catch (e) {
      aoErro(e.message);
    } finally {
      setOcupado(null);
    }
  };

  const salvarDestinos = async () => {
    setOcupado('destinos');
    try {
      await api.salvarDestinosAviso(destinos);
      aoAvisar('Destinos dos seus avisos salvos.');
      aoErro(null);
      await carregar();
    } catch (e) {
      aoErro(e.message);
    } finally {
      setOcupado(null);
    }
  };

  const testar = async (canal) => {
    setOcupado(`teste:${canal}`);
    try {
      const r = await api.testarAviso(canal);
      aoAvisar(r.mensagem);
      aoErro(null);
    } catch (e) {
      aoErro(e.message);
    } finally {
      setOcupado(null);
    }
  };

  const alternarPush = async () => {
    setOcupado('push');
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const atual = await reg.pushManager.getSubscription();
      if (atual && ativoAqui) {
        await api.desinscreverPush(atual.endpoint);
        await atual.unsubscribe();
        setInscricaoLocal(null);
        aoAvisar('Aviso no navegador desligado neste aparelho.');
      } else {
        const permissao = await Notification.requestPermission();
        if (permissao !== 'granted') throw new Error('O navegador não deu permissão para mostrar avisos.');
        // Se o navegador já tem inscrição (o servidor a perdeu, ou é outra
        // organização), `subscribe` devolve a mesma e ela volta a ser registrada.
        const inscricao = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64ParaBytes(dados.push_chave_publica),
        });
        await api.inscreverPush(inscricao.toJSON());
        setInscricaoLocal(inscricao);
        aoAvisar('Aviso no navegador ligado neste aparelho.');
      }
      aoErro(null);
      await carregar();
    } catch (e) {
      aoErro(e.message);
    } finally {
      setOcupado(null);
    }
  };

  const desligadoNoServidor = dados.canais.filter((c) => !dados.servico[c.chave]).map((c) => c.rotulo);
  const destinosMudaram =
    destinos.email !== (dados.destinos.email || '') || destinos.whatsapp !== (dados.destinos.whatsapp || '');

  return (
    <section className="border border-borda rounded bg-superficie lg:col-span-2 min-w-0">
      <h2 className="px-3 py-2 text-xs uppercase tracking-wide text-texto-suave border-b border-borda flex flex-wrap items-center gap-2">
        <Bell size={13} /> Avisos por tipo e canal
        <span className="ml-auto flex rounded border border-borda overflow-hidden normal-case" role="group" aria-label="De quem são as preferências">
          {[
            ['eu', 'Meus avisos'],
            ['organizacao', 'Caixa da organização'],
          ].map(([chave, rotulo]) => (
            <button
              key={chave}
              type="button"
              aria-pressed={escopo === chave}
              className={`px-2 py-0.5 ${escopo === chave ? 'bg-realce/[0.08] text-texto' : 'text-texto-suave hover:text-texto'}`}
              onClick={() => setEscopo(chave)}
            >
              {rotulo}
            </button>
          ))}
        </span>
      </h2>

      {desligadoNoServidor.length > 0 && (
        <p className="px-3 py-2 text-xs text-atencao border-b border-borda">
          Desligado neste servidor: {desligadoNoServidor.join(', ')}. Ligar aqui guarda a escolha, mas nada sai por
          esse canal até a equipe do painel configurá-lo.
        </p>
      )}

      {!daOrganizacao && (
        <div className="p-3 grid gap-3 md:grid-cols-3 border-b border-borda">
          <label className="block">
            <span className="text-[11px] uppercase tracking-wide text-texto-suave">Meu e-mail de aviso</span>
            <input
              type="email"
              className="campo-caixa w-full mt-0.5"
              value={destinos.email}
              placeholder={dados.destinos.email_login || ''}
              onChange={(e) => setDestinos({ ...destinos, email: e.target.value })}
            />
            <span className="block text-[11px] text-texto-suave mt-0.5">Vazio: vai para o e-mail de login.</span>
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wide text-texto-suave">Meu WhatsApp</span>
            <input
              type="tel"
              className="campo-caixa w-full mt-0.5"
              value={destinos.whatsapp}
              placeholder="55 51 99999-9999"
              onChange={(e) => setDestinos({ ...destinos, whatsapp: e.target.value })}
            />
            <span className="block text-[11px] text-texto-suave mt-0.5">Com DDI e DDD. Vazio: não recebe por WhatsApp.</span>
          </label>
          <div className="flex flex-wrap items-start gap-2 pt-4">
            <button className="botao-primario flex items-center gap-1" onClick={salvarDestinos} disabled={!destinosMudaram || ocupado === 'destinos'}>
              {ocupado === 'destinos' ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Salvar destinos
            </button>
            {pushSuportado() && dados.push_chave_publica && (
              <button className="botao flex items-center gap-1" onClick={alternarPush} disabled={ocupado === 'push'}>
                {ativoAqui ? <BellOff size={12} /> : <Bell size={12} />}
                {ativoAqui ? 'Desligar neste navegador' : 'Ligar neste navegador'}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-texto-suave">
              <th className="text-left font-normal px-3 py-1.5">Tipo de aviso</th>
              {canais.map((c) => {
                const Icone = ICONES[c.chave];
                return (
                  <th key={c.chave} className="font-normal px-1 sm:px-2 py-1.5 text-center">
                    <span className="inline-flex flex-col sm:flex-row items-center gap-1">
                      <Icone size={12} /> {c.rotulo}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {matriz.map((t) => (
              <tr key={t.chave} className="border-t border-borda">
                <td className="px-3 py-1.5">{t.rotulo}</td>
                {canais.map((c) => (
                  <td key={c.chave} className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${t.rotulo} por ${c.rotulo}`}
                      checked={t.canais[c.chave]}
                      disabled={somenteLeitura || ocupado === `${t.chave}:${c.chave}`}
                      onChange={(e) => alternar(t.chave, c.chave, e.target.checked)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-3 py-2 border-t border-borda flex flex-wrap items-center gap-2 text-[11px] text-texto-suave">
        {daOrganizacao ? (
          <span>
            {somenteLeitura ? 'Só um administrador muda a caixa da organização. ' : ''}O destino da caixa fica em
            “Alertas e limites”, abaixo.
          </span>
        ) : (
          <>
            <span>O sino do painel recebe tudo, sempre. Testar:</span>
            {dados.canais.map((c) => (
              <button
                key={c.chave}
                className="botao flex items-center gap-1"
                onClick={() => testar(c.chave)}
                disabled={ocupado === `teste:${c.chave}`}
              >
                <Send size={11} /> {c.rotulo}
              </button>
            ))}
          </>
        )}
      </div>
    </section>
  );
}
