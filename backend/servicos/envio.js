// Montagem do envio (seção 17.4) — o cruzamento kit × exigências × cofre.
//
// Regras da tela, que valem aqui no backend para a resposta já chegar pronta:
//   · código exigido pelo edital e presente no kit entra marcado;
//   · código do kit que o edital não pede entra desmarcado, mas visível —
//     mandar a mais raramente atrapalha, mandar a menos elimina;
//   · documento vencido entra desmarcado e em vermelho; só vai no pacote se o
//     usuário confirmar, e isso fica registrado no pacote;
//   · exigência do edital sem documento no cofre vira aviso, nunca bloqueio.
const fs = require('fs');
const path = require('path');

const pool = require('../config/db');
const arquivos = require('./arquivos');
const perfis = require('./perfil');
const proposta = require('./proposta');
const { semaforo, tituloPadrao } = require('../regras/validades');
const declaracao = require('./declaracao');
const pacote = require('./pacote');
const { PORCODIGO } = require('../regras/exigencias');

// Códigos que são condição, não papel para anexar: cobrá-los do cofre só
// encheria a tela de pendência falsa. O objeto social é conferido pelo contrato
// social e pelo cartão CNPJ; o patrimônio mínimo, pelo balanço; LGPD e
// assinatura digital são cláusula e forma, não documento.
const CONDICOES = new Set([
  'objeto_social',
  'exclusivo_me',
  'lgpd',
  'assinatura_digital',
  'amostra_poc',
  'pl_minimo',
]);

function rotuloDe(codigo, titulo) {
  if (titulo) return titulo;
  const doCatalogo = PORCODIGO.get(codigo);
  return (doCatalogo && doCatalogo.rotulo) || tituloPadrao(codigo);
}

// Continua exportado daqui — as rotas o chamam por `envio.perfilPadrao` —, mas
// a consulta vive em servicos/perfil.js para quebrar o círculo com `proposta`.
const perfilPadrao = (organizacaoId, perfilId) => perfis.padrao(organizacaoId, perfilId);

async function escolherKit(organizacaoId, perfilId, kitId) {
  const [kits] = await pool.query(
    'SELECT * FROM documento_kits WHERE organizacao_id = ? AND perfil_id = ? AND ativo = 1 ORDER BY padrao DESC, nome ASC',
    [organizacaoId, perfilId]
  );
  if (!kits.length) throw new Error('Nenhum kit cadastrado para este perfil.');
  const escolhido = (kitId && kits.find((k) => k.id === Number(kitId))) || kits[0];
  return { kit: escolhido, kits };
}

// Declarações que entram marcadas mesmo sem o edital citar o código: são as
// que praticamente todo certame pede na sessão.
const DECLARACOES_DE_PRAXE = new Set(['cumpre_requisitos', 'fato_impeditivo', 'ciencia_do_edital']);

/**
 * Bloco 2 da tela (seção 17.4): o que o painel gera com os dados da licitação.
 *
 * Quando o edital traz anexo próprio de declaração, o modelo genérico perde
 * para o anexo — a tela avisa, como manda a seção 18.2.
 */
async function sugerirDeclaracoes({ organizacaoId, licitacaoId, exigidos, perfilId }) {
  // Modelo do sistema (organizacao_id NULL) serve a todos; a cópia editada é
  // só de quem a fez (Seção 1b).
  const [modelos] = await pool.query(
    `SELECT id, codigo, titulo, padrao_sistema FROM modelos_declaracao
      WHERE ativo = 1 AND (organizacao_id IS NULL OR organizacao_id = ?)
        AND (perfil_id IS NULL OR perfil_id = ?)
      ORDER BY padrao_sistema ASC, titulo ASC`,
    [organizacaoId, perfilId]
  );
  if (!modelos.length) return [];

  // Modelo próprio do usuário tem preferência sobre o do sistema, por código.
  const escolhidos = new Map();
  for (const modelo of modelos) {
    const atual = escolhidos.get(modelo.codigo);
    if (!atual || (atual.padrao_sistema && !modelo.padrao_sistema)) escolhidos.set(modelo.codigo, modelo);
  }

  const [arquivosDoEdital] = await pool.query(
    // DISTINCT porque desde a Fase 10 o mesmo documento pode ter duas versões
    // na pasta: aqui só interessa se existe um anexo de declaração, não
    // quantos.
    "SELECT DISTINCT titulo, nome_arquivo FROM licitacao_arquivos WHERE licitacao_id = ? AND status = 'ok'",
    [licitacaoId]
  );
  const temAnexoDeDeclaracao = arquivosDoEdital.some((a) =>
    /declarac|anexo/i.test(`${a.titulo || ''} ${a.nome_arquivo || ''}`.normalize('NFD').replace(/[̀-ͯ]/g, ''))
  );

  return [...escolhidos.values()].map((modelo) => ({
    modelo_id: modelo.id,
    codigo: modelo.codigo,
    titulo: modelo.titulo,
    do_sistema: Boolean(modelo.padrao_sistema),
    exigido_no_edital: exigidos.has(modelo.codigo),
    marcado: exigidos.has(modelo.codigo) || DECLARACOES_DE_PRAXE.has(modelo.codigo),
    aviso: temAnexoDeDeclaracao
      ? 'o edital tem anexo próprio de declaração — se for o caso, use o anexo em vez deste modelo'
      : null,
  }));
}

/**
 * Monta a seleção sem gravar nada — é o que a tela "Montar envio" desenha.
 */
async function montar({ organizacaoId, licitacaoId, kitId = null, perfilId = null }) {
  const [[licitacao]] = await pool.query('SELECT * FROM licitacoes WHERE id = ?', [licitacaoId]);
  if (!licitacao) throw new Error(`Licitação ${licitacaoId} não encontrada.`);

  const perfil = await perfilPadrao(organizacaoId, perfilId);
  const { kit, kits } = await escolherKit(organizacaoId, perfil.id, kitId);

  const [itens] = await pool.query(
    'SELECT * FROM documento_kit_itens WHERE kit_id = ? ORDER BY ordem ASC',
    [kit.id]
  );

  const [exigencias] = await pool.query(
    "SELECT codigo, detectado FROM licitacao_exigencias WHERE licitacao_id = ? AND detectado = 'sim'",
    [licitacaoId]
  );
  const exigidos = new Set(exigencias.map((e) => e.codigo));

  // Só a versão ativa mais recente de cada código entra na seleção.
  const [documentos] = await pool.query(
    `SELECT d.* FROM empresa_documentos d
      WHERE d.organizacao_id = ? AND d.perfil_id = ? AND d.ativo = 1
      ORDER BY d.codigo ASC, d.versao DESC`,
    [organizacaoId, perfil.id]
  );
  const noCofre = new Map();
  for (const documento of documentos) {
    if (!noCofre.has(documento.codigo)) noCofre.set(documento.codigo, documento);
  }

  const agora = new Date();
  const linhas = [];
  const faltando = [];

  for (const item of itens) {
    const documento = noCofre.get(item.codigo) || null;
    const exigido = exigidos.has(item.codigo);
    const rotulo = rotuloDe(item.codigo, documento && documento.titulo);

    if (item.so_se_exigido && !exigido) continue; // o kit tem, mas este edital não pede

    if (!documento) {
      const motivo = 'não há documento com esse código no cofre';
      linhas.push({
        codigo: item.codigo, rotulo, ordem: item.ordem, documento_id: null,
        exigido_no_edital: exigido, obrigatorio: Boolean(item.obrigatorio),
        marcado: false, disponivel: false, motivo,
        semaforo: { cor: 'vermelho', texto: 'não cadastrado' },
      });
      if (exigido || item.obrigatorio) faltando.push({ codigo: item.codigo, rotulo, motivo });
      continue;
    }

    const luz = semaforo(documento.valido_ate, agora);
    const vencido = luz.cor === 'vermelho';
    linhas.push({
      codigo: item.codigo,
      rotulo,
      ordem: item.ordem,
      documento_id: documento.id,
      nome_arquivo: documento.nome_arquivo,
      valido_ate: documento.valido_ate,
      emitido_em: documento.emitido_em,
      versao: documento.versao,
      renovavel_em: documento.renovavel_em,
      exigido_no_edital: exigido,
      obrigatorio: Boolean(item.obrigatorio),
      disponivel: true,
      // Marcado só quando o edital pede (ou o item é obrigatório no kit) e está válido.
      marcado: (exigido || Boolean(item.obrigatorio)) && !vencido,
      vencido,
      motivo: vencido ? 'documento vencido — renove antes de enviar' : null,
      semaforo: luz,
    });

    if (vencido && (exigido || item.obrigatorio)) {
      faltando.push({ codigo: item.codigo, rotulo, motivo: luz.texto });
    }
  }

  // Exigência do edital que o kit nem prevê: o aviso mais útil da tela.
  const noKit = new Set(itens.map((i) => i.codigo));
  const condicoes = [...exigidos]
    .filter((codigo) => CONDICOES.has(codigo))
    .map((codigo) => ({ codigo, rotulo: rotuloDe(codigo, null) }));

  const foraDoKit = [...exigidos]
    .filter((codigo) => !noKit.has(codigo) && !CONDICOES.has(codigo))
    .map((codigo) => {
      const documento = noCofre.get(codigo) || null;
      return {
        codigo,
        rotulo: rotuloDe(codigo, documento && documento.titulo),
        documento_id: documento ? documento.id : null,
        disponivel: Boolean(documento),
        semaforo: documento ? semaforo(documento.valido_ate, agora) : { cor: 'vermelho', texto: 'não cadastrado' },
      };
    });

  for (const fora of foraDoKit) {
    if (!fora.disponivel) {
      faltando.push({ codigo: fora.codigo, rotulo: fora.rotulo, motivo: 'o edital pede e não há no cofre' });
    }
  }

  const declaracoes = await sugerirDeclaracoes({ organizacaoId, licitacaoId, exigidos, perfilId: perfil.id });

  const [anexos] = await pool.query(
    'SELECT id, titulo, nome_arquivo, tamanho_bytes FROM licitacao_anexos WHERE organizacao_id = ? AND licitacao_id = ? ORDER BY id',
    [organizacaoId, licitacaoId]
  );

  // Bloco 3 (seção 17.4): a proposta gerada pela seção 19 entra aqui, junto do
  // que você anexa à mão. Sem isso o usuário geraria a proposta e teria de
  // baixar e reanexar o próprio arquivo.
  const propostas = await proposta.arquivosParaEnvio(organizacaoId, licitacaoId);

  const [pacotes] = await pool.query(
    'SELECT id, formato, nome_arquivo, folhas, gerado_em FROM pacotes WHERE organizacao_id = ? AND licitacao_id = ? ORDER BY id DESC LIMIT 5',
    [organizacaoId, licitacaoId]
  );

  return {
    licitacao: {
      id: licitacao.id, orgao_nome: licitacao.orgao_nome, modalidade: licitacao.modalidade,
      numero_compra: licitacao.numero_compra, objeto: licitacao.objeto,
      fim_propostas: licitacao.fim_propostas, exigencias_status: licitacao.exigencias_status,
    },
    perfil: { id: perfil.id, nome: perfil.nome, cnpj: perfil.cnpj, natureza: perfil.natureza },
    kit: { id: kit.id, nome: kit.nome, descricao: kit.descricao },
    kits: kits.map((k) => ({ id: k.id, nome: k.nome, padrao: Boolean(k.padrao) })),
    documentos: linhas,
    fora_do_kit: foraDoKit,
    condicoes,
    declaracoes,
    propostas,
    anexos,
    faltando,
    pacotes,
  };
}

/**
 * Gera o pacote de verdade.
 *
 * @param {object} payload
 *   - licitacaoId, kitId, perfilId
 *   - formato: 'pdf' (padrão) ou 'zip'
 *   - documentos: ids de empresa_documentos na ordem desejada
 *   - anexos: ids de licitacao_anexos
 *   - confirmaVencidos: deixa passar documento vencido (fica registrado)
 */
async function gerar({
  organizacaoId,
  licitacaoId, kitId = null, perfilId = null, formato = 'pdf',
  documentos = null, anexos = null, declaracoes = null, propostas = null,
  confirmaVencidos = false, observacao = null,
}) {
  const montagem = await montar({ organizacaoId, licitacaoId, kitId, perfilId });
  const [[licitacao]] = await pool.query('SELECT * FROM licitacoes WHERE id = ?', [licitacaoId]);
  const perfil = await perfilPadrao(organizacaoId, montagem.perfil.id);

  // Sem lista explícita, vale o que a montagem marcou.
  const escolhidos = documentos
    ? documentos.map(Number)
    : montagem.documentos.filter((d) => d.marcado).map((d) => d.documento_id);

  const [doBanco] = escolhidos.length
    ? await pool.query(
        `SELECT * FROM empresa_documentos WHERE organizacao_id = ? AND id IN (${escolhidos.map(() => '?').join(',')})`,
        [organizacaoId, ...escolhidos]
      )
    : [[]];
  const porId = new Map(doBanco.map((d) => [d.id, d]));

  const agora = new Date();
  const pecas = [];
  const vencidosIncluidos = [];
  let ordem = 1;

  for (const id of escolhidos) {
    const documento = porId.get(id);
    if (!documento || !documento.arquivo_path) continue;
    if (!arquivos.dentroDoVolume(documento.arquivo_path)) continue;

    const absoluto = arquivos.caminhoAbsoluto(documento.arquivo_path);
    if (!fs.existsSync(absoluto)) continue;

    const luz = semaforo(documento.valido_ate, agora);
    if (luz.cor === 'vermelho' && !confirmaVencidos) continue; // vencido não entra por padrão
    if (luz.cor === 'vermelho') vencidosIncluidos.push(documento.titulo);

    pecas.push({
      ordem,
      rotulo: documento.titulo,
      codigo: documento.codigo,
      documento_id: documento.id,
      caminhoAbsoluto: absoluto,
      extensao: path.extname(documento.nome_arquivo || documento.arquivo_path).toLowerCase(),
      validade: luz.texto,
    });
    ordem += 1;
  }

  // Camada 2: as declarações, geradas agora com os dados desta licitação.
  const idsDeclaracoes = declaracoes
    ? declaracoes.map(Number)
    : montagem.declaracoes.filter((d) => d.marcado).map((d) => d.modelo_id);

  const lacunas = [];
  if (idsDeclaracoes.length) {
    const [modelos] = await pool.query(
      `SELECT * FROM modelos_declaracao
        WHERE (organizacao_id IS NULL OR organizacao_id = ?) AND id IN (${idsDeclaracoes.map(() => '?').join(',')})`,
      [organizacaoId, ...idsDeclaracoes]
    );
    const dadosDaDeclaracao = declaracao.variaveis({ licitacao, perfil });

    for (const modelo of modelos) {
      const { texto, faltando } = declaracao.preencher(modelo.corpo, dadosDaDeclaracao);
      if (faltando.length) lacunas.push({ titulo: modelo.titulo, faltando });

      const bytes = await declaracao.gerarPdf({ titulo: modelo.titulo, texto, dados: dadosDaDeclaracao });
      const nome = `${arquivos.limpar(modelo.titulo).replace(/\s+/g, '_').slice(0, 80)}.pdf`;
      const salvo = await pacote.gravar(`org/${organizacaoId}/declaracoes/${licitacaoId}`, nome, bytes);

      pecas.push({
        ordem,
        rotulo: modelo.titulo,
        codigo: modelo.codigo,
        modelo_id: modelo.id,
        caminhoAbsoluto: arquivos.caminhoAbsoluto(salvo.caminho),
        extensao: '.pdf',
        validade: 'gerada agora com os dados desta licitação',
      });
      ordem += 1;
    }
  }

  // Camada 3, primeira parte: a proposta gerada pela seção 19. Entra antes dos
  // anexos à mão porque é o que o portal espera ver primeiro depois das
  // declarações.
  const chavesDeProposta = propostas
    ? propostas.map(String)
    : montagem.propostas.filter((p) => p.marcado).map((p) => p.chave);

  for (const chave of chavesDeProposta) {
    const peca = montagem.propostas.find((p) => p.chave === chave);
    if (!peca || !peca.caminho || !arquivos.dentroDoVolume(peca.caminho)) continue;
    const absoluto = arquivos.caminhoAbsoluto(peca.caminho);
    if (!fs.existsSync(absoluto)) continue;

    pecas.push({
      ordem,
      rotulo: peca.titulo,
      codigo: 'proposta',
      proposta_id: peca.proposta_id,
      caminhoAbsoluto: absoluto,
      extensao: `.${peca.formato}`,
      validade: `gerada pelo painel · ${peca.status}`,
    });
    ordem += 1;
  }

  // Camada 3, segunda parte: o que você anexou à mão.
  const idsAnexos = anexos ? anexos.map(Number) : montagem.anexos.map((a) => a.id);
  if (idsAnexos.length) {
    const [linhasAnexo] = await pool.query(
      `SELECT * FROM licitacao_anexos
        WHERE organizacao_id = ? AND licitacao_id = ? AND id IN (${idsAnexos.map(() => '?').join(',')})`,
      [organizacaoId, licitacaoId, ...idsAnexos]
    );
    for (const anexo of linhasAnexo) {
      if (!anexo.arquivo_path || !arquivos.dentroDoVolume(anexo.arquivo_path)) continue;
      const absoluto = arquivos.caminhoAbsoluto(anexo.arquivo_path);
      if (!fs.existsSync(absoluto)) continue;
      pecas.push({
        ordem,
        rotulo: anexo.titulo,
        codigo: 'anexo',
        caminhoAbsoluto: absoluto,
        extensao: path.extname(anexo.nome_arquivo || '').toLowerCase(),
        validade: null,
      });
      ordem += 1;
    }
  }

  if (!pecas.length) {
    throw new Error('Nenhum documento válido para montar o envio. Suba as peças no cofre primeiro.');
  }

  return { montagem, licitacao, perfil, pecas, vencidosIncluidos, lacunas, formato, observacao };
}

module.exports = { montar, gerar, perfilPadrao, rotuloDe };
