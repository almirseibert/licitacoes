// Job `monitorar` (seções 21.2 e 21.3) — o que muda depois que a licitação
// entra no radar.
//
// Depois de enviar a proposta, acompanhar é trabalho manual: abrir o portal,
// procurar a sessão, ver se saiu resultado. O PNCP publica tudo isso em API
// aberta, então aqui é só olhar com a frequência certa e avisar quando mudar.
//
// Três coisas são observadas em cada checagem:
//   1. a lista de arquivos — hash diferente quer dizer edital alterado;
//   2. as datas de abertura e encerramento — reabertura de prazo;
//   3. a situação e o resultado — deserta, fracassada, anulada, homologada.
//
// Nada aqui sobrescreve decisão sua: o card só se move sozinho de "Em disputa"
// para "Ganhamos" ou "Perdemos", que é conclusão do portal, não opinião do
// painel.
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const { pipeline } = require('stream/promises');

const pool = require('../config/db');
const escopo = require('../servicos/escopo');
const fila = require('../servicos/fila');
const adaptadores = require('../adaptadores');
const arquivos = require('../servicos/arquivos');
const servico = require('../servicos/monitor');
const regras = require('../regras/monitor');
const alertas = require('../servicos/alertas');
const encerradas = require('./encerradas');
const perfil = require('../servicos/perfil');

function recortar(valor, tamanho) {
  if (valor === null || valor === undefined) return null;
  return String(valor).slice(0, tamanho);
}

function listarTitulos(lista, quantos = 3) {
  const nomes = lista.map((a) => a.titulo || `documento ${a.sequencial}`).filter(Boolean);
  if (!nomes.length) return '';
  return nomes.slice(0, quantos).join(', ') + (nomes.length > quantos ? ` e mais ${nomes.length - quantos}` : '');
}

/**
 * Compara a lista de arquivos do portal com a que está gravada e devolve o que
 * mudou. Compara por sequencial: arquivo novo, arquivo que sumiu e arquivo que
 * ficou com outro título ou outro tamanho — que é a troca silenciosa.
 */
function diferencaDeArquivos(doPortal, gravados) {
  const porSequencial = new Map(gravados.map((a) => [Number(a.sequencial), a]));
  const novos = [];
  const trocados = [];

  for (const arquivo of doPortal) {
    const anterior = porSequencial.get(Number(arquivo.sequencial));
    if (!anterior) {
      novos.push(arquivo);
      continue;
    }
    const tituloMudou = String(anterior.titulo || '').trim() !== String(arquivo.titulo || '').trim();
    if (tituloMudou) trocados.push({ ...arquivo, anterior });
  }

  const sumidos = gravados.filter(
    (a) => !doPortal.some((p) => Number(p.sequencial) === Number(a.sequencial))
  );

  return { novos, trocados, sumidos };
}

/**
 * Baixa a versão nova de um arquivo ao lado da antiga (seção 21.3).
 * A antiga nunca é tocada: `01_Edital.pdf` fica, e entra `01_Edital_v2.pdf`.
 */
async function baixarNovaVersao({ licitacaoId, pasta, arquivo, adaptador, versao }) {
  const pastaAbsoluta = arquivos.caminhoAbsoluto(pasta);
  await arquivos.garantirPasta(pastaAbsoluta);

  const resposta = await adaptador.baixarArquivo({ url: arquivo.url });
  const extensao = arquivos.extensaoDe(resposta.disposicao, resposta.tipo, arquivo.titulo);
  const nomeBase = arquivos.nomeDoArquivo(arquivo.sequencial, arquivo.titulo, extensao);
  const nome = regras.nomeDaVersao(nomeBase, versao);
  const destino = path.join(pastaAbsoluta, nome);
  const temporario = `${destino}.tmp`;

  const hash = crypto.createHash('sha256');
  let bytes = 0;
  await pipeline(resposta.corpo, async function* (origem) {
    for await (const pedaco of origem) {
      hash.update(pedaco);
      bytes += pedaco.length;
      yield pedaco;
    }
  }, fs.createWriteStream(temporario));

  if (bytes === 0) {
    await fsp.unlink(temporario).catch(() => {});
    throw new Error('o portal devolveu um arquivo vazio');
  }
  await fsp.rename(temporario, destino);

  await pool.query(
    `INSERT INTO licitacao_arquivos
       (licitacao_id, sequencial, versao, titulo, nome_arquivo, extensao, tamanho_bytes,
        caminho, url_origem, hash_sha256, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ok')
     ON DUPLICATE KEY UPDATE
       tamanho_bytes = VALUES(tamanho_bytes),
       hash_sha256 = VALUES(hash_sha256),
       status = 'ok'`,
    [
      licitacaoId,
      arquivo.sequencial,
      versao,
      recortar(arquivo.titulo, 255),
      recortar(nome, 255),
      recortar(extensao, 10),
      bytes,
      recortar(path.join(pasta, nome).split(path.sep).join('/'), 500),
      recortar(arquivo.url, 500),
      hash.digest('hex'),
    ]
  );

  return { nome, tamanho: bytes };
}

/**
 * Move o card conforme o vencedor (seção 21.3). Só mexe em card que está em
 * disputa: licitação que você já classificou à mão fica como está.
 */
async function moverPeloResultado(licitacao) {
  if (!regras.ETAPAS_DISPUTANDO.includes(licitacao.etapa)) return null;

  // O CNPJ é o da organização dona deste monitoramento (Seção 1b): a mesma
  // licitação pode ser "Ganhamos" para uma e "Perdemos" para outra.
  const meuCnpj = (await perfil.cnpjDaEmpresa(licitacao.organizacao_id).catch(() => null)) || null;
  const [vencedores] = await pool.query(
    `SELECT cnpj_vencedor, fornecedor_vencedor, SUM(valor_homologado) AS total, COUNT(*) AS itens
       FROM licitacao_itens
      WHERE licitacao_id = ? AND cnpj_vencedor IS NOT NULL
      GROUP BY cnpj_vencedor, fornecedor_vencedor
      ORDER BY total DESC`,
    [licitacao.id]
  );
  if (!vencedores.length) return null;

  const nosso = meuCnpj ? vencedores.find((v) => v.cnpj_vencedor === meuCnpj) : null;
  const etapa = nosso ? 'Ganhamos' : 'Perdemos';
  const principal = nosso || vencedores[0];

  // Sem CNPJ da empresa no perfil não dá para saber se ganhamos: o painel não
  // chuta. Fica o evento e o card parado, com o aviso na tela.
  if (!meuCnpj) return { etapa: null, aviso: 'sem CNPJ no perfil da empresa — o card não se move sozinho' };

  // O vencedor é fato público (catálogo); a etapa é da organização.
  await pool.query(
    `UPDATE licitacoes SET vencedor = ?, cnpj_vencedor = ?, valor_final = ? WHERE id = ?`,
    [
      recortar(principal.fornecedor_vencedor, 255),
      recortar(principal.cnpj_vencedor, 20),
      Number(principal.total) || null,
      licitacao.id,
    ]
  );
  await pool.query(
    'UPDATE org_licitacoes SET etapa = ?, etapa_em = NOW() WHERE organizacao_id = ? AND licitacao_id = ?',
    [etapa, licitacao.organizacao_id, licitacao.id]
  );
  await pool.query(
    "INSERT INTO anotacoes (organizacao_id, licitacao_id, texto, tipo) VALUES (?, ?, ?, 'sistema')",
    [licitacao.organizacao_id, licitacao.id, `${licitacao.etapa} → ${etapa} (resultado publicado no portal)`]
  );

  return { etapa, vencedor: principal.fornecedor_vencedor, valor: Number(principal.total) || null };
}

/**
 * Uma checagem completa de uma licitação para TODAS as organizações que a
 * monitoram (Seção 1c). O portal é lido uma vez — detalhe, lista de arquivos,
 * resultado, download da versão nova — e o que mudou é espalhado: o evento do
 * catálogo é gravado uma vez, e cada organização recebe o seu alerta e o seu
 * próximo horário, pelos hashes e pela etapa dela. A seção 5.4 manda ir devagar:
 * N organizações na mesma licitação não podem virar N idas ao portal.
 *
 * @param {object[]} grupo monitoramentos ativos da MESMA licitação (uma linha por organização)
 * @returns {Promise<object[]>} um resumo por linha de `grupo`, na mesma ordem; `erro` quando a
 *          parte daquela organização falhou (a leitura do portal que falha lança, para todas)
 */
async function checarLicitacao(grupo, { agora = new Date() } = {}) {
  const base = grupo[0];
  const id = base.licitacao_id;
  const adaptador = adaptadores.obter(base.adaptador);
  const resumos = grupo.map((m) => ({ licitacao_id: id, organizacao_id: m.organizacao_id, eventos: [], alertas: 0 }));
  const paraTodas = (evento) => resumos.forEach((r) => r.eventos.push(evento));
  const alertarEditalAlterado = async (indice, { fim_propostas: fim }, oQueMudou) => {
    const m = grupo[indice];
    const criado = await servico.alertarEditalAlterado(
      { id, organizacao_id: m.organizacao_id, orgao_nome: base.orgao_nome, fim_propostas: fim },
      oQueMudou
    );
    if (criado) resumos[indice].alertas += 1;
  };

  // ---------------------------------------------------- detalhe: datas e situação
  let detalhe = null;
  if (typeof adaptador.detalhar === 'function') {
    detalhe = await adaptador.detalhar({ chaveExterna: base.chave_externa });
  }

  if (detalhe) {
    const hashNovo = regras.hashDatas(detalhe);
    const quemVeMudanca = grupo.map((m, i) => i).filter((i) => grupo[i].hash_datas && hashNovo !== grupo[i].hash_datas);
    if (quemVeMudanca.length) {
      const antes = base.fim_propostas ? new Date(base.fim_propostas).toLocaleString('pt-BR') : 'sem data';
      const depois = detalhe.fim_propostas ? new Date(detalhe.fim_propostas).toLocaleString('pt-BR') : 'sem data';
      await servico.registrarEvento({
        licitacaoId: id,
        tipo: 'data_alterada',
        descricao: `O prazo das propostas mudou de ${antes} para ${depois}.`,
        dados: { antes: base.fim_propostas, depois: detalhe.fim_propostas },
        ocorridoEm: agora,
        chave: `data_alterada:${id}:${hashNovo.slice(0, 16)}`,
      });
      paraTodas('data_alterada');
      for (const i of quemVeMudanca) {
        await alertarEditalAlterado(i, detalhe, { hash: hashNovo, resumo: `o prazo passou de ${antes} para ${depois}` });
      }
    }

    // Situação nova vira evento próprio: deserta, fracassada, anulada, suspensa.
    const situacaoNova = detalhe.situacao || null;
    if (situacaoNova && situacaoNova !== base.situacao) {
      await servico.registrarEvento({
        licitacaoId: id,
        tipo: 'situacao',
        descricao: `Situação no portal: ${base.situacao || 'não informada'} → ${situacaoNova}.`,
        dados: { antes: base.situacao, depois: situacaoNova },
        ocorridoEm: agora,
        chave: `situacao:${id}:${situacaoNova}`,
      });
      paraTodas('situacao');
    }

    await pool.query(
      `UPDATE licitacoes
          SET situacao = COALESCE(?, situacao),
              abertura_propostas = COALESCE(?, abertura_propostas),
              fim_propostas = COALESCE(?, fim_propostas),
              valor_homologado = COALESCE(?, valor_homologado)
        WHERE id = ?`,
      [detalhe.situacao, detalhe.abertura_propostas, detalhe.fim_propostas, detalhe.valor_homologado, id]
    );
    for (const m of grupo) {
      await pool.query('UPDATE monitoramentos SET hash_datas = ? WHERE organizacao_id = ? AND licitacao_id = ?', [
        hashNovo,
        m.organizacao_id,
        id,
      ]);
    }
  }

  // ---------------------------------------------------------- arquivos: o edital
  if (typeof adaptador.listarArquivos === 'function') {
    const doPortal = await adaptador.listarArquivos({ chaveExterna: base.chave_externa });
    const hashNovo = regras.hashArquivos(doPortal);
    const quemVeMudanca = grupo.map((m, i) => i).filter((i) => grupo[i].hash_arquivos && hashNovo !== grupo[i].hash_arquivos);

    if (quemVeMudanca.length) {
      const [gravados] = await pool.query(
        `SELECT sequencial, MAX(versao) AS versao, SUBSTRING_INDEX(GROUP_CONCAT(titulo ORDER BY versao DESC), ',', 1) AS titulo
           FROM licitacao_arquivos WHERE licitacao_id = ? GROUP BY sequencial`,
        [id]
      );
      const mudanca = diferencaDeArquivos(doPortal, gravados);
      const partes = [];
      if (mudanca.novos.length) partes.push(`${mudanca.novos.length} arquivo(s) novo(s): ${listarTitulos(mudanca.novos)}`);
      if (mudanca.trocados.length) partes.push(`${mudanca.trocados.length} substituído(s): ${listarTitulos(mudanca.trocados)}`);
      if (mudanca.sumidos.length) partes.push(`${mudanca.sumidos.length} removido(s) do portal`);
      const texto = partes.join('; ') || 'a lista de documentos do portal mudou';

      await servico.registrarEvento({
        licitacaoId: id,
        tipo: 'edital_alterado',
        descricao: texto,
        dados: {
          novos: mudanca.novos.map((a) => ({ sequencial: a.sequencial, titulo: a.titulo })),
          trocados: mudanca.trocados.map((a) => ({ sequencial: a.sequencial, titulo: a.titulo })),
          sumidos: mudanca.sumidos.map((a) => ({ sequencial: a.sequencial, titulo: a.titulo })),
        },
        ocorridoEm: agora,
        chave: `edital_alterado:${id}:${hashNovo.slice(0, 16)}`,
      });
      paraTodas('edital_alterado');

      for (const i of quemVeMudanca) {
        await alertarEditalAlterado(i, base, { hash: hashNovo, resumo: texto });
      }

      // Só baixa de novo o que já havia sido baixado: licitação cuja
      // documentação nunca desceu não vira download por causa do monitor.
      // O arquivo é do catálogo: baixa uma vez, e todas as organizações o têm.
      if (base.pasta) {
        for (const arquivo of [...mudanca.novos, ...mudanca.trocados]) {
          const anterior = gravados.find((g) => Number(g.sequencial) === Number(arquivo.sequencial));
          const versao = anterior ? Number(anterior.versao) + 1 : 1;
          try {
            const baixado = await baixarNovaVersao({
              licitacaoId: id,
              pasta: base.pasta,
              arquivo,
              adaptador,
              versao,
            });
            paraTodas(`baixado:${baixado.nome}`);
          } catch (erro) {
            paraTodas(`falha ao baixar ${arquivo.titulo}: ${erro.message}`);
          }
        }
      }
    }

    for (const m of grupo) {
      await pool.query('UPDATE monitoramentos SET hash_arquivos = ? WHERE organizacao_id = ? AND licitacao_id = ?', [
        hashNovo,
        m.organizacao_id,
        id,
      ]);
    }
  }

  // -------------------------------------------------------------- resultado
  // Só depois do fim das propostas: antes disso não existe resultado nenhum e
  // a chamada seria desperdício de requisição no portal.
  const passouDoFim = base.fim_propostas && new Date(base.fim_propostas) < agora;
  let resultado = null;
  if (passouDoFim) {
    const r = await encerradas.registrarResultados({ licitacaoId: id }).catch((erro) => ({
      gravados: 0,
      erro: erro.message,
    }));

    if (r.gravados) {
      resultado = r;
      await servico.registrarEvento({
        licitacaoId: id,
        tipo: 'resultado',
        descricao: `O portal publicou resultado: ${r.gravados} item(ns) com vencedor.`,
        dados: { itens: r.itens, gravados: r.gravados },
        ocorridoEm: agora,
        chave: `resultado:${id}:${r.gravados}`,
      });
      paraTodas('resultado');
    }
  }

  // ------------------------------------- o que é de cada organização: card, alerta, próxima volta
  for (let i = 0; i < grupo.length; i += 1) {
    const monitoramento = grupo[i];
    const resumo = resumos[i];
    const organizacaoId = monitoramento.organizacao_id;
    try {
      if (resultado) {
        const movido = await moverPeloResultado({ id, organizacao_id: organizacaoId, etapa: monitoramento.etapa });
        if (movido && movido.etapa) {
          resumo.eventos.push(`card → ${movido.etapa}`);
          await alertas.criar({
            organizacaoId,
            tipo: 'resultado',
            nivel: movido.etapa === 'Ganhamos' ? 'info' : 'atencao',
            chave: `resultado:${id}`,
            licitacaoId: id,
            mensagem:
              movido.etapa === 'Ganhamos'
                ? `Ganhamos: ${base.orgao_nome || 'órgão'} homologou para a sua empresa.`
                : `Perdemos para ${movido.vencedor || 'outro fornecedor'} — ${base.orgao_nome || 'órgão'}.`,
          });
          resumo.alertas += 1;
        }
        if (movido && movido.aviso) resumo.eventos.push(movido.aviso);
      }

      const [[atual]] = await pool.query(
        `SELECT id, etapa, fim_propostas FROM ${escopo.daOrganizacao(organizacaoId, { todas: true })} l WHERE id = ?`,
        [id]
      );
      const cadencia = regras.cadenciaDe(atual, agora);
      if (!cadencia) {
        await servico.desligar(organizacaoId, id);
        resumo.proxima = null;
      } else {
        const proxima = regras.proximaChecagem(cadencia, agora);
        await pool.query(
          'UPDATE monitoramentos SET proxima_checagem = ?, checagens = checagens + 1, ultimo_erro = NULL WHERE id = ?',
          [proxima, monitoramento.id]
        );
        resumo.proxima = proxima;
        resumo.cadencia = cadencia.chave;
      }
    } catch (erro) {
      resumo.erro = erro.message;
    }
  }

  return resumos;
}

/**
 * Checagem pedida por uma organização ("checar agora"): vai ao portal uma vez
 * e atende, junto, as outras organizações que monitoram a mesma licitação.
 * Devolve o resumo da organização que pediu.
 */
async function checar(monitoramento, { agora = new Date() } = {}) {
  const irmaos = (await servico.ativosDasLicitacoes([monitoramento.licitacao_id])).filter(
    (m) => m.id !== monitoramento.id
  );
  const resumos = await checarLicitacao([monitoramento, ...irmaos], { agora });
  // A parte que falhou para as OUTRAS organizações não some: fica no monitor delas, como na rodada.
  for (let i = 1; i < resumos.length; i += 1) {
    if (resumos[i].erro) await adiar(irmaos[i - 1].id, resumos[i].erro);
  }
  if (resumos[0].erro) throw new Error(resumos[0].erro);
  return resumos[0];
}

/** Erro não trava a fila: adia esta e segue. Portal fora do ar é temporário, e insistir no mesmo minuto só piora. */
async function adiar(monitoramentoId, mensagem) {
  await pool.query(
    `UPDATE monitoramentos
        SET proxima_checagem = DATE_ADD(NOW(), INTERVAL 3 HOUR),
            checagens = checagens + 1,
            ultimo_erro = ?
      WHERE id = ?`,
    [recortar(mensagem, 255), monitoramentoId]
  );
}

/**
 * Uma rodada do monitor: liga o que falta e checa o que está na hora.
 * `limite` existe porque cada checagem são de duas a quatro requisições ao
 * portal, e a seção 5.4 manda andar devagar — e a licitação monitorada por
 * várias organizações custa essas requisições uma vez só (Seção 1c).
 */
async function monitorar({ limite = 25 } = {}) {
  const agora = new Date();
  const ligados = await servico.ligarOsQueFaltam({});
  const pendentes = await servico.devidas({ limite });

  const resumo = {
    ligados: ligados.ligados,
    checadas: 0, // licitações lidas no portal (uma ida por licitação)
    monitoramentos: 0, // linhas de organização atendidas por essas leituras
    eventos: 0,
    alertas: 0,
    encerrados: 0,
    erros: [],
  };

  // A hora de uma organização puxa as outras que monitoram a mesma licitação:
  // ler o portal de novo daqui a pouco para elas seria requisição jogada fora.
  const atendidas = await servico.ativosDasLicitacoes(pendentes.map((m) => m.licitacao_id));
  const porLicitacao = new Map();
  for (const m of [...pendentes, ...atendidas]) {
    if (!porLicitacao.has(m.licitacao_id)) porLicitacao.set(m.licitacao_id, new Map());
    porLicitacao.get(m.licitacao_id).set(m.id, m);
  }

  for (const [licitacaoId, linhas] of porLicitacao) {
    const grupo = [...linhas.values()];
    try {
      const resumos = await checarLicitacao(grupo, { agora });
      resumo.checadas += 1;
      resumo.monitoramentos += grupo.length;
      // O evento do catálogo é um só, por mais organizações que o recebam.
      resumo.eventos += resumos[0].eventos.filter((e) => !e.startsWith('baixado:')).length;
      for (let i = 0; i < resumos.length; i += 1) {
        const r = resumos[i];
        resumo.alertas += r.alertas;
        if (r.proxima === null) resumo.encerrados += 1;
        if (r.erro) {
          resumo.erros.push(`licitação ${licitacaoId} (organização ${r.organizacao_id}): ${r.erro}`);
          await adiar(grupo[i].id, r.erro);
        }
      }
    } catch (erro) {
      resumo.erros.push(`licitação ${licitacaoId}: ${erro.message}`);
      for (const m of grupo) await adiar(m.id, erro.message);
    }
  }

  return resumo;
}

function registrarNaFila() {
  fila.registrar('monitorar', (payload) => monitorar(payload || {}));
}

module.exports = {
  monitorar,
  checar,
  checarLicitacao,
  diferencaDeArquivos,
  baixarNovaVersao,
  moverPeloResultado,
  registrarNaFila,
};
