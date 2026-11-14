import { useEffect, useState } from 'react';
import { Loader2, Sparkles, AlertTriangle, RefreshCcw, FileDown, Mail, Printer, FileQuestion, Save } from 'lucide-react';
import { api } from '../servicos/api';
import { dataHora } from '../servicos/formato';

/**
 * Aba "Resumo do edital" (Seção 11 do plano SaaS) — a ficha completa.
 *
 * Toda afirmação mostra de onde saiu (arquivo, página e a frase copiada do
 * edital). O que a IA não conseguiu sustentar com uma frase literal aparece
 * como "Não informado", nunca como palpite. Gera uma vez: refazer é a pedido.
 */
const NAO_INFORMADO = 'Não informado';

function onde(c) {
  if (!c) return '';
  return `${c.arquivo || 'edital'} · ${c.pagina ? `página ${c.pagina}` : 'página não identificada'}`;
}

export default function ResumoEdital({ id, aoQuestionar }) {
  const [estado, setEstado] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(null);
  const [consideracoes, setConsideracoes] = useState('');

  // Gerar de novo não apaga o que foi digitado e ainda não salvo.
  const aplicar = (r, manterRascunho = false) => {
    setEstado(r);
    if (!manterRascunho) setConsideracoes(r.consideracoes || '');
  };

  useEffect(() => {
    api
      .resumoEdital(id)
      .then(aplicar)
      .catch((e) => setErro(e.message));
  }, [id]);

  const fazer = async (chave, acao) => {
    setOcupado(chave);
    setErro(null);
    setAviso(null);
    try {
      await acao();
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(null);
    }
  };

  const gerar = (forcar) =>
    fazer('gerar', async () => {
      const r = await api.gerarResumoEdital(id, forcar);
      aplicar(r, true);
      setAviso(r.mensagem);
    });

  if (erro && !estado) return <p className="text-sm text-erro">{erro}</p>;
  if (!estado) return <Loader2 size={16} className="animate-spin text-texto-suave" />;

  const d = estado.dados;

  if (!d) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-texto-suave flex items-start gap-2">
          <Sparkles size={14} className="shrink-0 mt-0.5 text-voltagem" />
          A IA preenche a ficha do edital — sessão, garantias, prazos, habilitação, pagamento, multas e possíveis
          questionamentos — e cada item cita o trecho e a página de onde saiu. O que ela não achar fica &quot;
          {NAO_INFORMADO}&quot;.
        </p>
        {estado.disponivel ? (
          <button className="botao-primario flex items-center gap-1" onClick={() => gerar(false)} disabled={Boolean(ocupado)}>
            {ocupado === 'gerar' ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
            gerar o resumo
          </button>
        ) : (
          <p className="text-xs text-atencao">{estado.motivo}</p>
        )}
        {ocupado === 'gerar' && <p className="text-xs text-texto-suave">Lendo o edital… pode levar alguns minutos.</p>}
        {erro && <p className="text-xs text-erro">{erro}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Data e aviso sempre visíveis, no topo, antes de qualquer dado. */}
      <header className="border border-atencao/40 rounded p-3 bg-superficie/40 flex items-start gap-2 flex-wrap">
        <AlertTriangle size={14} className="text-atencao shrink-0 mt-0.5" />
        <p className="text-xs flex-1 min-w-[200px]">
          Gerado pela IA em <span className="font-mono">{dataHora(estado.em)}</span>.{' '}
          <strong className="text-atencao">A IA pode errar:</strong> confira cada item no trecho citado.{' '}
          <span className="text-texto-suave">
            {d.preenchidos} de {d.total} campos sustentados por citação literal.
          </span>
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="botao flex items-center gap-1" onClick={() => fazer('docx', () => api.baixarResumoDocx(id))} disabled={Boolean(ocupado)}>
            {ocupado === 'docx' ? <Loader2 size={11} className="animate-spin" /> : <FileDown size={11} />} .docx
          </button>
          <button
            className="botao flex items-center gap-1"
            onClick={() => fazer('email', async () => setAviso((await api.enviarResumoEmail(id)).mensagem))}
            disabled={Boolean(ocupado)}
          >
            {ocupado === 'email' ? <Loader2 size={11} className="animate-spin" /> : <Mail size={11} />} e-mail
          </button>
          <button className="botao flex items-center gap-1" onClick={() => imprimir(estado, consideracoes)}>
            <Printer size={11} /> imprimir
          </button>
          {estado.disponivel && (
            <button className="botao flex items-center gap-1" onClick={() => gerar(true)} disabled={Boolean(ocupado)}>
              {ocupado === 'gerar' ? <Loader2 size={11} className="animate-spin" /> : <RefreshCcw size={11} />} gerar de novo
            </button>
          )}
        </div>
      </header>

      {erro && <p className="text-xs text-erro">{erro}</p>}
      {aviso && <p className="text-xs text-texto-suave">{aviso}</p>}

      {d.suspeitos && d.suspeitos.length > 0 && (
        <p className="text-xs text-atencao flex items-start gap-2">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          O edital tem texto dirigido a uma IA ({d.suspeitos.map(onde).join('; ')}). Foi tratado como dado, mas vale ler
          esse trecho com atenção.
        </p>
      )}

      {d.grupos.map((g) => (
        <section key={g.chave}>
          <h3 className="font-titulo text-sm mb-1">{g.titulo}</h3>
          <dl>
            {g.campos.map((c) => (
              <Afirmacao key={c.chave} rotulo={c.rotulo} valor={c.valor} citacao={c.citacao} />
            ))}
          </dl>
        </section>
      ))}

      {d.listas.map((l) => (
        <section key={l.chave}>
          <h3 className="font-titulo text-sm mb-1">{l.titulo}</h3>
          {l.itens.length === 0 ? (
            <p className="text-xs text-texto-suave">{NAO_INFORMADO}</p>
          ) : (
            <dl>
              {l.itens.map((a, i) => (
                <Afirmacao key={i} rotulo={String(i + 1)} valor={a.valor} citacao={a.citacao} />
              ))}
            </dl>
          )}
        </section>
      ))}

      <section>
        <h3 className="font-titulo text-sm mb-1">Possíveis questionamentos</h3>
        {d.questionamentos.length === 0 ? (
          <p className="text-xs text-texto-suave">Nenhum ponto apontado pela IA.</p>
        ) : (
          <ul className="space-y-2">
            {d.questionamentos.map((q, i) => (
              <li key={i} className="border border-borda rounded p-2">
                <p className="text-sm">{q.ponto}</p>
                <Citacao citacao={q.citacao} />
                {q.lei && <p className="text-[11px] text-texto-suave mt-1">Lei invocada (sugestão da IA, confira): {q.lei}</p>}
                <button
                  className="botao mt-2 flex items-center gap-1"
                  onClick={() =>
                    aoQuestionar &&
                    aoQuestionar({ codigo: q.tipo === 'impugnacao' ? 'impugnacao_restritiva' : 'esclarecimento', questionamento: i, ponto: q.ponto })
                  }
                >
                  <FileQuestion size={11} /> abrir {q.tipo === 'impugnacao' ? 'impugnação' : 'pedido de esclarecimento'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="font-titulo text-sm mb-1">Considerações do licitante</h3>
        <p className="text-[11px] text-texto-suave mb-1">Só a sua organização vê. Entram no .docx, no e-mail e na impressão.</p>
        <textarea
          className="campo-caixa w-full text-xs p-2"
          rows={4}
          maxLength={5000}
          value={consideracoes}
          onChange={(e) => setConsideracoes(e.target.value)}
        />
        <button
          className="botao mt-1 flex items-center gap-1"
          disabled={Boolean(ocupado) || consideracoes === (estado.consideracoes || '')}
          onClick={() =>
            fazer('consideracoes', async () => {
              await api.salvarConsideracoes(id, consideracoes);
              setEstado({ ...estado, consideracoes });
              setAviso('Considerações salvas.');
            })
          }
        >
          {ocupado === 'consideracoes' ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} salvar
        </button>
      </section>

      {d._meta && (
        <p className="text-[11px] text-texto-suave pt-1 border-t border-borda/60">
          {d._meta.modelo} · {d._meta.trechos} trechos de {d._meta.arquivos} arquivo(s)
          {d.confianca !== null && d.confianca !== undefined && <> · confiança do modelo {Number(d.confianca).toFixed(2)}</>}
          {d._meta.descartados && d._meta.descartados.length > 0 && (
            <span className="block text-atencao mt-0.5">
              {d._meta.descartados.length} afirmação(ões) descartada(s) por não citar o edital literalmente.
            </span>
          )}
        </p>
      )}
    </div>
  );
}

function Afirmacao({ rotulo, valor, citacao }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-1 sm:gap-3 py-1.5 border-b border-borda/60">
      <dt className="text-xs uppercase tracking-wide text-texto-suave">{rotulo}</dt>
      <dd className="text-sm min-w-0">
        {valor ? (
          <>
            {valor}
            <Citacao citacao={citacao} />
          </>
        ) : (
          <span className="text-texto-suave">{NAO_INFORMADO}</span>
        )}
      </dd>
    </div>
  );
}

function Citacao({ citacao }) {
  if (!citacao) return null;
  return (
    <blockquote className="mt-0.5 text-[11px] text-texto-suave border-l-2 border-borda pl-2 break-words">
      “{citacao.texto}” <span className="font-mono">— {onde(citacao)}</span>
    </blockquote>
  );
}

function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Impressão: uma página limpa, com data e aviso no topo, montada dos mesmos dados. */
function imprimir(estado, consideracoes) {
  const d = estado.dados;
  const linha = (rotulo, valor, citacao) =>
    `<tr><th>${escapar(rotulo)}</th><td>${valor ? `${escapar(valor)}${citacao ? `<div class="c">“${escapar(citacao.texto)}” — ${escapar(onde(citacao))}</div>` : ''}` : `<span class="n">${NAO_INFORMADO}</span>`}</td></tr>`;
  const secoes = [
    ...d.grupos.map((g) => `<h2>${escapar(g.titulo)}</h2><table>${g.campos.map((c) => linha(c.rotulo, c.valor, c.citacao)).join('')}</table>`),
    ...d.listas.map(
      (l) =>
        `<h2>${escapar(l.titulo)}</h2><table>${l.itens.length ? l.itens.map((a, i) => linha(String(i + 1), a.valor, a.citacao)).join('') : linha('—', null)}</table>`
    ),
    `<h2>Possíveis questionamentos</h2><table>${
      d.questionamentos.length
        ? d.questionamentos.map((q, i) => linha(String(i + 1), q.lei ? `${q.ponto} — ${q.lei} (sugestão da IA)` : q.ponto, q.citacao)).join('')
        : linha('—', null)
    }</table>`,
    consideracoes && consideracoes.trim() ? `<h2>Considerações do licitante</h2><p>${escapar(consideracoes)}</p>` : '',
  ];
  const l = estado.licitacao || {};
  const titulo = `Resumo do edital — ${[l.modalidade, l.numero_compra].filter(Boolean).join(' ')}${l.orgao_nome ? ` · ${l.orgao_nome}` : ''}`;
  const janela = window.open('', '_blank');
  if (!janela) return;
  janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapar(titulo)}</title>
<style>body{font:12px/1.4 system-ui,sans-serif;color:#111;margin:24px}h1{font-size:16px}h2{font-size:13px;margin:16px 0 4px}
table{width:100%;border-collapse:collapse}th{width:28%;text-align:left;vertical-align:top;font-weight:600}
th,td{border-bottom:1px solid #ddd;padding:4px}.c{color:#555;font-size:11px}.n{color:#777}.aviso{border:1px solid #c80;padding:6px}</style>
</head><body><h1>${escapar(titulo)}</h1><p class="aviso">Gerado pela IA em ${escapar(dataHora(estado.em))}. A IA pode errar: confira cada item no trecho citado do edital.</p>
${secoes.join('')}</body></html>`);
  janela.document.close();
  janela.focus();
  janela.print();
}
