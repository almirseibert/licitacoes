import { useEffect, useState } from 'react';
import { Loader2, Save, AlertTriangle } from 'lucide-react';
import { api } from '../servicos/api';

/**
 * Dados da empresa (seções 9 e 11.13) — o que a capa do pacote e as declarações
 * da seção 18 preenchem sozinhas.
 *
 * Isto não existia na tela, e a consequência era silenciosa: o painel gerava a
 * declaração com `____________` no lugar da razão social porque o perfil só
 * tinha o que vem do seed, e não havia por onde completar sem mexer no banco.
 * O gerador nunca inventa dado — então a lacuna aparece no PDF. O aviso aqui em
 * cima diz, antes de gerar, quais campos vão sair em branco.
 */

// Campos sem os quais a declaração sai com lacuna (ver `declaracao.js`).
const ESSENCIAIS = [
  ['razao_social', 'razão social'],
  ['cnpj', 'CNPJ'],
  ['endereco', 'endereço'],
  ['representante', 'representante legal'],
  ['cpf_representante', 'CPF do representante'],
];

const NATUREZAS = ['ME', 'EPP', 'LTDA', 'Outra'];
const REGIMES = ['Simples Nacional', 'Lucro Presumido', 'Lucro Real'];

/** Só os dígitos, para conferir o tamanho sem brigar com a pontuação. */
function digitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

/** Data do banco (ISO, às vezes com hora) no formato que o `<input date>` quer. */
function paraInputData(valor) {
  if (!valor) return '';
  return String(valor).slice(0, 10);
}

export default function DadosDaEmpresa({ perfil, aoErro, aoAvisar, aoSalvar }) {
  const [campos, setCampos] = useState({});
  const [salvando, setSalvando] = useState(false);

  // Perfil recarregado (depois de salvar, por exemplo): o formulário volta a
  // refletir o que está gravado, sem deixar edição fantasma na tela.
  useEffect(() => {
    setCampos({});
  }, [perfil]);

  if (!perfil) {
    return (
      <section className="border border-borda rounded bg-superficie lg:col-span-2">
        <h2 className="px-3 py-2 text-xs uppercase tracking-wide text-texto-suave border-b border-borda">
          Dados da empresa
        </h2>
        <p className="px-3 py-6 text-sm text-texto-suave">
          Nenhum perfil de empresa cadastrado. Rode <span className="font-mono">npm run semear</span> para
          criar o perfil ME padrão.
        </p>
      </section>
    );
  }

  const valorDe = (chave) => (chave in campos ? campos[chave] : perfil[chave] ?? '');
  const mudar = (chave, valor) => setCampos({ ...campos, [chave]: valor });
  const temAlteracao = Object.keys(campos).length > 0;

  const faltando = ESSENCIAIS.filter(([chave]) => !String(valorDe(chave) || '').trim()).map(
    ([, rotulo]) => rotulo
  );

  const cnpjCurto = valorDe('cnpj') && digitos(valorDe('cnpj')).length !== 14;
  const cpfCurto = valorDe('cpf_representante') && digitos(valorDe('cpf_representante')).length !== 11;

  const salvar = async () => {
    setSalvando(true);
    try {
      // Campo vazio vai como null: string vazia no banco faria o gerador achar
      // que há dado e escrever nada, em vez de escrever a lacuna.
      const corpo = {};
      for (const [chave, valor] of Object.entries(campos)) {
        const texto = typeof valor === 'string' ? valor.trim() : valor;
        corpo[chave] = texto === '' ? null : texto;
      }
      const r = await api.salvarPerfil(perfil.id, corpo);
      aoAvisar(r.mensagem || 'Dados da empresa salvos.');
      aoErro(null);
      setCampos({});
      if (aoSalvar) await aoSalvar();
    } catch (e) {
      aoErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section className="border border-borda rounded bg-superficie lg:col-span-2">
      <h2 className="px-3 py-2 text-xs uppercase tracking-wide text-texto-suave border-b border-borda flex items-center gap-2">
        Dados da empresa — {perfil.nome}
        <button
          className="botao-primario ml-auto flex items-center gap-1 normal-case"
          onClick={salvar}
          disabled={!temAlteracao || salvando}
        >
          {salvando ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          Salvar dados
        </button>
      </h2>

      {faltando.length > 0 && (
        <p className="mx-3 mt-3 px-3 py-2 text-xs border border-atencao/40 text-atencao rounded bg-atencao/5 flex gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-px" />
          <span>
            Falta {faltando.join(', ')}. Enquanto faltar, a capa do pacote e as declarações saem com a
            lacuna <span className="font-mono">____________</span> nesses lugares — de propósito: o painel
            não inventa dado.
          </span>
        </p>
      )}

      <div className="p-3 grid gap-3 md:grid-cols-2">
        <Campo
          rotulo="Razão social"
          valor={valorDe('razao_social')}
          aoMudar={(v) => mudar('razao_social', v)}
          dica="Como está no contrato social — é o que vai na declaração."
        />
        <Campo
          rotulo="Nome fantasia"
          valor={valorDe('nome_fantasia')}
          aoMudar={(v) => mudar('nome_fantasia', v)}
        />
        <Campo
          rotulo="CNPJ"
          valor={valorDe('cnpj')}
          aoMudar={(v) => mudar('cnpj', v)}
          aviso={cnpjCurto ? 'Não tem 14 dígitos.' : null}
          dica="Com ou sem pontuação: vai no documento exatamente como digitado aqui."
        />
        <Campo
          rotulo="Endereço completo"
          valor={valorDe('endereco')}
          aoMudar={(v) => mudar('endereco', v)}
          dica="Termine em Cidade/UF — é de onde sai o local da assinatura. Ex.: Rua X, 123 - Centro, Lajeado/RS"
        />
        <Campo
          rotulo="Representante legal"
          valor={valorDe('representante')}
          aoMudar={(v) => mudar('representante', v)}
          dica="Quem assina pela empresa."
        />
        <Campo
          rotulo="CPF do representante"
          valor={valorDe('cpf_representante')}
          aoMudar={(v) => mudar('cpf_representante', v)}
          aviso={cpfCurto ? 'Não tem 11 dígitos.' : null}
        />

        <Selecao
          rotulo="Natureza"
          valor={valorDe('natureza')}
          opcoes={NATUREZAS}
          aoMudar={(v) => mudar('natureza', v)}
          dica="ME e EPP destravam o benefício da LC 123 na pontuação."
        />
        <Selecao
          rotulo="Regime tributário"
          valor={valorDe('regime')}
          opcoes={REGIMES}
          aoMudar={(v) => mudar('regime', v)}
        />
        <Campo
          rotulo="Capital social (R$)"
          valor={valorDe('capital_social')}
          aoMudar={(v) => mudar('capital_social', v)}
          dica="Entra na checagem do art. 69, §4º: exigência acima de 10% do estimado é impugnável."
        />
        <Campo
          rotulo="Aberta em"
          tipo="date"
          valor={paraInputData(valorDe('aberta_em'))}
          aoMudar={(v) => mudar('aberta_em', v)}
          dica="Empresa do exercício usa balanço de abertura (art. 65, §1º)."
        />
        <Campo
          rotulo="Inscrição estadual"
          valor={valorDe('insc_estadual')}
          aoMudar={(v) => mudar('insc_estadual', v)}
        />
        <Campo
          rotulo="Inscrição municipal"
          valor={valorDe('insc_municipal')}
          aoMudar={(v) => mudar('insc_municipal', v)}
        />
      </div>

      <p className="px-3 py-2 text-[11px] text-texto-suave border-t border-borda">
        Os CNAEs deste perfil ficam no bloco de objeto social, acima. Depois de mexer neles, repontue o
        Radar para a cobertura ser recalculada.
      </p>
    </section>
  );
}

function Campo({ rotulo, valor, aoMudar, dica, aviso, tipo = 'text' }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-texto-suave">{rotulo}</span>
      <input
        type={tipo}
        className="campo-caixa w-full mt-0.5"
        value={valor || ''}
        onChange={(e) => aoMudar(e.target.value)}
      />
      {aviso && <span className="block text-[11px] text-atencao mt-0.5">{aviso}</span>}
      {dica && !aviso && <span className="block text-[11px] text-texto-suave mt-0.5">{dica}</span>}
    </label>
  );
}

function Selecao({ rotulo, valor, opcoes, aoMudar, dica }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wide text-texto-suave">{rotulo}</span>
      <select
        className="campo-caixa w-full mt-0.5"
        value={valor || ''}
        onChange={(e) => aoMudar(e.target.value)}
      >
        <option value="">—</option>
        {opcoes.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {dica && <span className="block text-[11px] text-texto-suave mt-0.5">{dica}</span>}
    </label>
  );
}
