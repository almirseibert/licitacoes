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
const { semaforo, tituloPadrao } = require('../regras/validades');
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

async function perfilPadrao(perfilId) {
  const [linhas] = perfilId
    ? await pool.query('SELECT * FROM empresa_perfis WHERE id = ?', [perfilId])
    : await pool.query('SELECT * FROM empresa_perfis ORDER BY padrao DESC, id ASC LIMIT 1');
  if (!linhas.length) throw new Error('Cadastre o perfil da empresa antes de montar um envio.');
  return linhas[0];
}

async function escolherKit(perfilId, kitId) {
  const [kits] = await pool.query(
    'SELECT * FROM documento_kits WHERE perfil_id = ? AND ativo = 1 ORDER BY padrao DESC, nome ASC',
    [perfilId]
  );
  if (!kits.length) throw new Error('Nenhum kit cadastrado para este perfil.');
  const escolhido = (kitId && kits.find((k) => k.id === Number(kitId))) || kits[0];
  return { kit: escolhido, kits };
}

/**
 * Monta a seleção sem gravar nada — é o que a tela "Montar envio" desenha.
 */
async function montar({ licitacaoId, kitId = null, perfilId = null }) {
  const [[licitacao]] = await pool.query('SELECT * FROM licitacoes WHERE id = ?', [licitacaoId]);
  if (!licitacao) throw new Error(`Licitação ${licitacaoId} não encontrada.`);

  const perfil = await perfilPadrao(perfilId);
  const { kit, kits } = await escolherKit(perfil.id, kitId);

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
      WHERE d.perfil_id = ? AND d.ativo = 1
      ORDER BY d.codigo ASC, d.versao DESC`,
    [perfil.id]
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

  const [anexos] = await pool.query(
    'SELECT id, titulo, nome_arquivo, tamanho_bytes FROM licitacao_anexos WHERE licitacao_id = ? ORDER BY id',
    [licitacaoId]
  );

  const [pacotes] = await pool.query(
    'SELECT id, formato, nome_arquivo, folhas, gerado_em FROM pacotes WHERE licitacao_id = ? ORDER BY id DESC LIMIT 5',
    [licitacaoId]
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
  licitacaoId, kitId = null, perfilId = null, formato = 'pdf',
  documentos = null, anexos = null, confirmaVencidos = false, observacao = null,
}) {
  const montagem = await montar({ licitacaoId, kitId, perfilId });
  const [[licitacao]] = await pool.query('SELECT * FROM licitacoes WHERE id = ?', [licitacaoId]);
  const perfil = await perfilPadrao(montagem.perfil.id);

  // Sem lista explícita, vale o que a montagem marcou.
  const escolhidos = documentos
    ? documentos.map(Number)
    : montagem.documentos.filter((d) => d.marcado).map((d) => d.documento_id);

  const [doBanco] = escolhidos.length
    ? await pool.query(
        `SELECT * FROM empresa_documentos WHERE id IN (${escolhidos.map(() => '?').join(',')})`,
        escolhidos
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

  // Camada 3: o que é específico desta licitação.
  const idsAnexos = anexos ? anexos.map(Number) : montagem.anexos.map((a) => a.id);
  if (idsAnexos.length) {
    const [linhasAnexo] = await pool.query(
      `SELECT * FROM licitacao_anexos WHERE licitacao_id = ? AND id IN (${idsAnexos.map(() => '?').join(',')})`,
      [licitacaoId, ...idsAnexos]
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

  return { montagem, licitacao, perfil, pecas, vencidosIncluidos, formato, observacao };
}

module.exports = { montar, gerar, perfilPadrao, rotuloDe };
