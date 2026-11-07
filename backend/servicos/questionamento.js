// Pedido de esclarecimento e impugnação (seção 25.2).
//
// Isto não é lembrete de prazo. O pedido de esclarecimento é ferramenta de
// trabalho: destrava exigência desproporcional, confirma por escrito que um
// documento seu serve, e corrige especificação impossível antes que o item
// fracasse. Resposta do órgão no processo vale como parte do edital — por isso
// ela é guardada aqui, com data e protocolo.
const pool = require('../config/db');
const regras = require('../regras/prazos');
const feriados = require('./feriados');
const perfilEmpresa = require('./perfil');
const declaracao = require('./declaracao');

/**
 * Os três modelos da seção 25.2. Usam o mesmo motor de variáveis das
 * declarações (seção 18), então `{{razao_social}}`, `{{numero_licitacao}}` e companhia
 * já funcionam — e o que faltar vira lacuna visível, nunca valor inventado.
 */
const MODELOS = [
  {
    codigo: 'esclarecimento',
    tipo: 'esclarecimento',
    titulo: 'Pedido de esclarecimento',
    corpo: `À {{orgao}}
Ref.: {{modalidade}} nº {{numero_licitacao}}{{processo_frase}}

{{razao_social}}, inscrita no CNPJ sob o nº {{cnpj}}, com sede em {{endereco}}, por seu representante legal, vem, tempestivamente e com fundamento no art. 164 da Lei nº 14.133/2021, solicitar ESCLARECIMENTO quanto ao edital em referência, nos seguintes termos:

1. O item ____________ do edital estabelece que ____________.

2. Resta dúvida quanto a ____________, uma vez que ____________.

3. Diante disso, solicita-se esclarecer se ____________.

A resposta a este pedido integrará o edital, nos termos do art. 164, parágrafo único, da Lei nº 14.133/2021.

Nestes termos, pede deferimento.

{{cidade_empresa}}, {{data_extenso}}.


____________________________________________
{{razao_social}}
{{representante}}
CPF {{cpf_representante}}`,
  },
  {
    codigo: 'impugnacao_restritiva',
    tipo: 'impugnacao',
    titulo: 'Impugnação — exigência restritiva',
    corpo: `À {{orgao}}
Ref.: {{modalidade}} nº {{numero_licitacao}}{{processo_frase}}

{{razao_social}}, inscrita no CNPJ sob o nº {{cnpj}}, com sede em {{endereco}}, por seu representante legal, vem, tempestivamente e com fundamento no art. 164 da Lei nº 14.133/2021, apresentar IMPUGNAÇÃO ao edital em referência, pelas razões a seguir.

1. DA EXIGÊNCIA IMPUGNADA

O item ____________ do edital exige ____________.

2. DA RESTRIÇÃO À COMPETITIVIDADE

O art. 37, inciso XXI, da Constituição Federal admite apenas as exigências de qualificação técnica e econômica indispensáveis à garantia do cumprimento das obrigações. No mesmo sentido, o art. 11, inciso IV, da Lei nº 14.133/2021 impõe à licitação o dever de evitar cláusulas que comprometam o caráter competitivo do certame.

A exigência combatida é desproporcional ao objeto porque ____________, não guardando pertinência com ____________.

3. DO PEDIDO

Requer-se o acolhimento desta impugnação para que a exigência do item ____________ seja ____________, com a republicação do edital e a reabertura do prazo, na forma do art. 55, §1º, da Lei nº 14.133/2021.

Nestes termos, pede deferimento.

{{cidade_empresa}}, {{data_extenso}}.


____________________________________________
{{razao_social}}
{{representante}}
CPF {{cpf_representante}}`,
  },
  {
    codigo: 'impugnacao_especificacao',
    tipo: 'impugnacao',
    titulo: 'Impugnação — erro de especificação',
    corpo: `À {{orgao}}
Ref.: {{modalidade}} nº {{numero_licitacao}}{{processo_frase}}

{{razao_social}}, inscrita no CNPJ sob o nº {{cnpj}}, com sede em {{endereco}}, por seu representante legal, vem, tempestivamente e com fundamento no art. 164 da Lei nº 14.133/2021, apresentar IMPUGNAÇÃO ao edital em referência, pelas razões a seguir.

1. DO ERRO APONTADO

O item ____________ do termo de referência especifica ____________.

A especificação é inexequível ou contraditória porque ____________.

2. DA CONSEQUÊNCIA

Mantida como está, a especificação tende a produzir item deserto ou fracassado, ou a inviabilizar a comparação objetiva entre as propostas, contrariando o art. 11, inciso I, da Lei nº 14.133/2021, que impõe à licitação assegurar a seleção da proposta mais vantajosa.

3. DO PEDIDO

Requer-se a correção do item ____________ para ____________, com a republicação do edital e a reabertura do prazo, na forma do art. 55, §1º, da Lei nº 14.133/2021.

Nestes termos, pede deferimento.

{{cidade_empresa}}, {{data_extenso}}.


____________________________________________
{{razao_social}}
{{representante}}
CPF {{cpf_representante}}`,
  },
];

const POR_CODIGO = new Map(MODELOS.map((m) => [m.codigo, m]));

/**
 * O prazo de questionamento de uma licitação, calculado agora.
 * Guarda o resultado em `licitacoes.prazo_questionamento` para o Radar não
 * refazer a conta a cada abertura de tela.
 */
async function calcular(licitacaoId, { gravar = true } = {}) {
  const [[licitacao]] = await pool.query(
    `SELECT id, abertura_propostas, fim_propostas, uf, municipio, orgao_nome, etapa, favorito, pontuacao
       FROM licitacoes WHERE id = ?`,
    [licitacaoId]
  );
  if (!licitacao) return null;

  // A abertura das propostas é a referência legal. Faltando ela, o painel não
  // inventa a partir do fim das propostas: são datas diferentes, e errar o
  // prazo para mais é pior do que não ter prazo.
  if (!licitacao.abertura_propostas) {
    return { licitacao_id: licitacaoId, prazo: null, motivo: 'a licitação não tem data de abertura das propostas no portal.' };
  }

  // A abertura vem do mysql2 como Date, e `String(Date)` é "Wed Oct 14 2026…",
  // não uma data que o MySQL aceite de volta. O dia é montado campo a campo,
  // no fuso local, pelo mesmo motivo de sempre: data é dia de calendário.
  const abertura = new Date(licitacao.abertura_propostas);
  const comoDia = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // A janela só precisa alcançar os feriados que podem cair na contagem: 60
  // dias para trás cobre com folga três dias úteis, mesmo com recesso.
  const lista = await feriados.listar({
    de: comoDia(new Date(abertura.getTime() - 60 * 86400000)),
    ate: comoDia(abertura),
  });

  const prazo = regras.prazoQuestionamento({
    abertura: licitacao.abertura_propostas,
    uf: licitacao.uf,
    municipio: licitacao.municipio,
    feriados: lista,
  });

  if (prazo && gravar) {
    await pool.query('UPDATE licitacoes SET prazo_questionamento = ? WHERE id = ?', [prazo.limite, licitacaoId]);
  }
  return { licitacao_id: licitacaoId, prazo };
}

/** O texto do modelo, já com as variáveis da licitação trocadas. */
async function montarTexto({ licitacaoId, codigo }) {
  const modelo = POR_CODIGO.get(codigo);
  if (!modelo) throw new Error(`Modelo desconhecido: ${codigo}.`);

  const [[licitacao]] = await pool.query('SELECT * FROM licitacoes WHERE id = ?', [licitacaoId]);
  if (!licitacao) throw new Error('Licitação não encontrada.');

  const perfil = await perfilEmpresa.padrao();
  const { texto, faltando } = declaracao.preencher(modelo.corpo, declaracao.variaveis({ licitacao, perfil }));

  return { modelo, texto, faltando, titulo: modelo.titulo, tipo: modelo.tipo };
}

async function listar(licitacaoId) {
  const [dados] = await pool.query(
    'SELECT * FROM questionamentos WHERE licitacao_id = ? ORDER BY criado_em DESC',
    [licitacaoId]
  );
  return dados;
}

async function criar({ licitacaoId, tipo, assunto, texto }) {
  const calculado = await calcular(licitacaoId);
  const limite = calculado && calculado.prazo ? calculado.prazo.limite : null;

  const [r] = await pool.query(
    `INSERT INTO questionamentos (licitacao_id, tipo, assunto, prazo_limite, texto_enviado)
     VALUES (?, ?, ?, ?, ?)`,
    [licitacaoId, tipo, assunto ? String(assunto).slice(0, 255) : null, limite, texto || null]
  );
  return { id: r.insertId, prazo_limite: limite };
}

module.exports = { MODELOS, POR_CODIGO, calcular, montarTexto, listar, criar };
