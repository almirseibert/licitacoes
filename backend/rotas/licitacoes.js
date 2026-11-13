// GET/PATCH /api/licitacoes — alimenta a tela Radar (seções 11.1 e 13).
const fs = require('fs');
const express = require('express');
const { responderErro } = require('../middlewares/responder-erro');
const pool = require('../config/db');
const fila = require('../servicos/fila');
const servicoArquivos = require('../servicos/arquivos');
const funil = require('../regras/funil');
const descarte = require('../regras/descarte');
const exigencias = require('../regras/exigencias');
const prazos = require('../jobs/prazos');
const contrato = require('../servicos/contrato');
const exportar = require('../servicos/exportar');
const servicoMonitor = require('../servicos/monitor');
const monitorar = require('../jobs/monitorar');
const servicoIa = require('../servicos/ia');
const jobIa = require('../jobs/ia-resumos');
const questionamento = require('../servicos/questionamento');
const jobBaixar = require('../jobs/baixar');
const escopo = require('../servicos/escopo');

const rotas = express.Router();

const ORDENACOES = {
  // Ordenação padrão do Radar: pontuação desc, depois prazo asc (seção 11.1)
  relevancia: 'l.pontuacao DESC, (l.fim_propostas IS NULL) ASC, l.fim_propostas ASC',
  prazo: '(l.fim_propostas IS NULL) ASC, l.fim_propostas ASC',
  valor: 'l.valor_estimado DESC',
  recentes: 'l.criado_em DESC',
};

// As etapas vivem em regras/funil.js, com o que cada uma pede e dispara.
const ETAPAS = funil.CHAVES;

function montarFiltros(q) {
  const onde = [];
  const valores = [];

  if (q.incluir_descartadas !== '1') onde.push('l.descartada = 0');

  if (q.grupo) {
    onde.push('l.grupo = ?');
    valores.push(q.grupo);
  }
  if (q.uf) {
    const ufs = String(q.uf).split(',').map((u) => u.trim().toUpperCase()).filter(Boolean);
    onde.push(`l.uf IN (${ufs.map(() => '?').join(',')})`);
    valores.push(...ufs);
  }
  if (q.modalidade) {
    onde.push('l.modalidade LIKE ?');
    valores.push(`%${q.modalidade}%`);
  }
  if (q.fonte_id) {
    onde.push('l.fonte_id = ?');
    valores.push(Number(q.fonte_id));
  }
  if (q.valor_min) {
    onde.push('l.valor_estimado >= ?');
    valores.push(Number(q.valor_min));
  }
  if (q.valor_max) {
    onde.push('l.valor_estimado <= ?');
    valores.push(Number(q.valor_max));
  }
  // Por padrão o Radar esconde a faixa "Baixa" (<30), conforme a seção 6.
  const pontuacaoMinima = q.pontuacao_min === undefined || q.pontuacao_min === '' ? 30 : Number(q.pontuacao_min);
  if (pontuacaoMinima > 0) {
    onde.push('l.pontuacao >= ?');
    valores.push(pontuacaoMinima);
  }
  if (q.prazo_dias) {
    onde.push('l.fim_propostas IS NOT NULL AND l.fim_propostas <= DATE_ADD(NOW(), INTERVAL ? DAY)');
    valores.push(Number(q.prazo_dias));
  }
  if (q.em_aberto === '1') {
    onde.push('(l.fim_propostas IS NULL OR l.fim_propostas >= NOW())');
  }
  if (q.pode_participar) {
    onde.push('l.pode_participar = ?');
    valores.push(q.pode_participar);
  }
  if (q.objeto_social) {
    onde.push('l.objeto_social = ?');
    valores.push(q.objeto_social);
  }
  if (q.exclusivo_me === '1') {
    onde.push("l.beneficio_me IN ('exclusivo','cota')");
  }
  if (q.etapa) {
    onde.push('l.etapa = ?');
    valores.push(q.etapa);
  }
  if (q.favorito === '1') onde.push('l.favorito = 1');
  if (q.novas_24h === '1') onde.push('l.criado_em >= DATE_SUB(NOW(), INTERVAL 24 HOUR)');
  if (q.busca) {
    onde.push('(l.objeto LIKE ? OR l.orgao_nome LIKE ? OR l.municipio LIKE ?)');
    const alvo = `%${q.busca}%`;
    valores.push(alvo, alvo, alvo);
  }

  return { onde: onde.length ? `WHERE ${onde.join(' AND ')}` : '', valores };
}

// GET /api/licitacoes
rotas.get('/', async (req, res) => {
  try {
    const { onde, valores } = montarFiltros(req.query);
    const ordem = ORDENACOES[req.query.ordem] || ORDENACOES.relevancia;
    const porPagina = Math.min(Number(req.query.por_pagina || 50), 200);
    const pagina = Math.max(Number(req.query.pagina || 1), 1);
    const deslocamento = (pagina - 1) * porPagina;

    const [linhas] = await pool.query(
      `SELECT l.id, l.chave_externa, l.orgao_nome, l.unidade, l.uf, l.municipio, l.esfera,
              l.modalidade, l.modo_disputa, l.objeto, l.valor_estimado, l.orcamento_sigiloso,
              l.abertura_propostas, l.fim_propostas, l.situacao, l.plataforma_disputa,
              l.link_portal, l.link_disputa, l.grupo, l.palavra_casada, l.pontuacao,
              l.pode_participar, l.motivo_participacao, l.objeto_social, l.beneficio_me,
              l.etapa, l.favorito, l.criado_em, l.arquivos_status,
              f.nome AS fonte_nome,
              (SELECT COUNT(*) FROM licitacao_itens i WHERE i.licitacao_id = l.id) AS total_itens
         FROM ${escopo.daOrganizacao(req.organizacaoId)} l
         JOIN fontes f ON f.id = l.fonte_id
         ${onde}
         ORDER BY ${ordem}
         LIMIT ? OFFSET ?`,
      [...valores, porPagina, deslocamento]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM ${escopo.daOrganizacao(req.organizacaoId)} l
         JOIN fontes f ON f.id = l.fonte_id ${onde}`,
      valores
    );

    res.json({ dados: linhas, total: Number(total), pagina, por_pagina: porPagina });
  } catch (erro) {
    console.error('Erro ao listar licitações:', erro.message);
    responderErro(res, 500, 'Não foi possível carregar as licitações.', erro);
  }
});

// GET /api/licitacoes/exportar — o Radar em Excel, com os filtros da tela
// (Fase 14). Vem antes de `/:id` porque "exportar" casaria com o parâmetro.
//
// Por que Excel e não CSV: o Radar tem objeto longo, valor em real e data com
// hora, e o CSV entrega os três errados — o Excel quebra a linha no ponto e
// vírgula do objeto, lê 1.234,56 como texto e inverte dia com mês.
rotas.get('/exportar', async (req, res) => {
  try {
    const { onde, valores } = montarFiltros(req.query);
    const ordem = ORDENACOES[req.query.ordem] || ORDENACOES.relevancia;

    const r = await exportar.radarEmExcel({ organizacaoId: req.organizacaoId, onde, valores, ordem });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${r.arquivo}"`);
    res.setHeader('X-Linhas', String(r.linhas));
    res.send(r.buffer);
  } catch (erro) {
    console.error('Erro ao exportar o Radar:', erro.message);
    responderErro(res, 500, 'Não foi possível gerar a planilha do Radar.', erro);
  }
});

// GET /api/licitacoes/relatorio — quantas disputei, quantas ganhei e o desconto
// médio das minhas propostas (Fase 14). `?formato=xlsx` baixa a planilha.
rotas.get('/relatorio', async (req, res) => {
  const meses = Math.min(Math.max(Number(req.query.meses || 12), 1), 60);

  try {
    if (req.query.formato === 'xlsx') {
      const r = await exportar.relatorioEmExcel({ organizacaoId: req.organizacaoId, meses });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${r.arquivo}"`);
      return res.send(r.buffer);
    }
    res.json(await exportar.relatorioMensal({ organizacaoId: req.organizacaoId, meses }));
  } catch (erro) {
    console.error('Erro no relatório mensal:', erro.message);
    responderErro(res, 500, 'Não foi possível montar o relatório.', erro);
  }
});

// GET /api/licitacoes/filtros — opções para os seletores do Radar
rotas.get('/filtros', async (req, res) => {
  try {
    const daOrg = escopo.daOrganizacao(req.organizacaoId);
    const [grupos] = await pool.query(
      `SELECT DISTINCT grupo FROM ${daOrg} l WHERE grupo IS NOT NULL ORDER BY grupo`
    );
    const [ufs] = await pool.query(
      `SELECT uf, COUNT(*) AS total FROM ${daOrg} l WHERE uf IS NOT NULL AND descartada = 0 GROUP BY uf ORDER BY total DESC`
    );
    const [modalidades] = await pool.query(
      'SELECT DISTINCT modalidade FROM licitacoes WHERE modalidade IS NOT NULL ORDER BY modalidade'
    );
    const [fontes] = await pool.query('SELECT id, nome FROM fontes ORDER BY nome');

    res.json({
      grupos: grupos.map((g) => g.grupo),
      ufs: ufs.map((u) => ({ uf: u.uf, total: Number(u.total) })),
      modalidades: modalidades.map((m) => m.modalidade),
      fontes,
      etapas: ETAPAS,
      funil: funil.ETAPAS,
      motivos_descarte: funil.MOTIVOS_DESCARTE,
      // O catálogo da seção 8.2 vai junto: o descarte por exigência pede o
      // código, e código digitado à mão produz grafia solta — que é
      // exatamente o que a lista fechada da seção 20.1 existe para evitar.
      exigencias: exigencias.CATALOGO.map((e) => ({ codigo: e.codigo, grupo: e.grupo, rotulo: e.rotulo })),
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar os filtros.', erro);
  }
});

// GET /api/licitacoes/:id
rotas.get('/:id', async (req, res) => {
  try {
    const [linhas] = await pool.query(
      `SELECT l.*, f.nome AS fonte_nome, f.adaptador
         FROM ${escopo.daOrganizacao(req.organizacaoId, { todas: true })} l JOIN fontes f ON f.id = l.fonte_id
        WHERE l.id = ?`,
      [req.params.id]
    );
    if (!linhas.length) return res.status(404).json({ erro: 'Licitação não encontrada.' });

    const licitacao = linhas[0];
    delete licitacao.bruto; // a resposta crua fica no banco, não na tela

    const [itens] = await pool.query(
      'SELECT * FROM licitacao_itens WHERE licitacao_id = ? ORDER BY numero_item',
      [req.params.id]
    );

    res.json({ ...licitacao, itens });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível abrir a licitação.', erro);
  }
});

// GET /api/licitacoes/:id/itens
rotas.get('/:id/itens', async (req, res) => {
  try {
    const [itens] = await pool.query(
      'SELECT * FROM licitacao_itens WHERE licitacao_id = ? ORDER BY numero_item',
      [req.params.id]
    );
    res.json({ dados: itens });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar os itens.', erro);
  }
});

// PATCH /api/licitacoes/:id — etapa do funil, favorito, descarte e os campos
// que cada etapa pede (seção 10).
// Decisão da organização: vai para `org_licitacoes` (Seção 1b).
const CAMPOS_DO_FUNIL = [
  'etapa',
  'favorito',
  'descartada',
  'motivo_descarte',
  'codigo_barrou',
  'proposta_em',
  'valor_proposto',
  'custo_estimado',
  // O resultado DIGITADO também é da organização: o do portal mora no
  // catálogo (o monitor grava), e a visão da organização prefere o dela.
  'valor_final',
  'vencedor',
  'cnpj_vencedor',
];

rotas.patch('/:id', async (req, res) => {
  const corpo = req.body || {};
  const partes = [];
  const valores = [];

  try {
    const [[antes]] = await pool.query(
      `SELECT * FROM ${escopo.daOrganizacao(req.organizacaoId, { todas: true })} l WHERE l.id = ?`,
      [req.params.id]
    );
    if (!antes) return res.status(404).json({ erro: 'Licitação não encontrada.' });

    if (corpo.etapa !== undefined) {
      if (!funil.existe(corpo.etapa)) {
        return res.status(400).json({ erro: `Etapa inválida. Use uma de: ${funil.CHAVES.join(', ')}.` });
      }
      // A etapa só avança com o que ela pede preenchido — é isso que faz o
      // histórico valer alguma coisa depois (preço, vencedor, motivo).
      const faltando = funil.faltandoPara(corpo.etapa, { ...antes, ...corpo });
      if (faltando.length) {
        return res.status(400).json({
          erro: `Para mover para "${corpo.etapa}", informe: ${faltando.join(', ')}.`,
          faltando,
        });
      }
      // Motivo vazio é o card saindo de "Descartada": limpar é operação válida,
      // e só o que tem conteúdo passa pela lista fechada.
      const motivoNovo = corpo.motivo_descarte === '' ? null : corpo.motivo_descarte;
      if (motivoNovo !== undefined && motivoNovo !== null && !descarte.ofertado(motivoNovo)) {
        return res.status(400).json({
          erro: `Motivo de descarte inválido. Use um de: ${funil.MOTIVOS_DESCARTE.map((m) => m.chave).join(', ')}.`,
        });
      }
      // Exigência e documento faltando só servem à análise com o código que
      // barrou (seção 20.1). Sem ele o descarte entra no total e desaparece do
      // ranking — que é justamente o número que deveria produzir.
      if (motivoNovo && descarte.pedeCodigo(motivoNovo)) {
        const codigo = corpo.codigo_barrou !== undefined ? corpo.codigo_barrou : antes.codigo_barrou;
        if (!codigo) {
          return res.status(400).json({
            erro: 'Informe qual exigência barrou — é esse código que faz o diagnóstico funcionar.',
            faltando: ['codigo_barrou'],
          });
        }
        if (!exigencias.PORCODIGO.has(codigo)) {
          return res.status(400).json({ erro: `Código de exigência desconhecido: ${codigo}.` });
        }
      }
    }

    for (const campo of CAMPOS_DO_FUNIL) {
      if (corpo[campo] === undefined) continue;
      partes.push(`${campo} = ?`);
      valores.push(
        campo === 'favorito' || campo === 'descartada'
          ? (corpo[campo] ? 1 : 0)
          : corpo[campo] === '' ? null : corpo[campo]
      );
    }
    if (!partes.length) return res.status(400).json({ erro: 'Nada para atualizar.' });

    const mudouEtapa = corpo.etapa !== undefined && corpo.etapa !== antes.etapa;
    if (mudouEtapa) {
      partes.push('etapa_em = NOW()');
      // "Descartada" e o sinalizador de descarte andam juntos.
      if (corpo.etapa === 'Descartada' && corpo.descartada === undefined) {
        partes.push('descartada = 1');
      }
      // A data do descarte é o eixo do período na tela de diagnóstico, por isso
      // é gravada aqui e zerada quando o card sai de "Descartada": licitação
      // ressuscitada não deve continuar pesando no ranking do mês passado.
      if (corpo.etapa === 'Descartada') {
        partes.push('descartado_em = NOW()');
      } else {
        // Sair de "Descartada" apaga o descarte inteiro, não só a data. Motivo
        // órfão num card vivo apareceria no ranking de um descarte que foi
        // desfeito, e a tela não tem como saber que aquilo não valia mais.
        partes.push('descartado_em = NULL', 'descartada = 0', 'motivo_descarte = NULL', 'codigo_barrou = NULL');
      }
    }

    await escopo.garantirLinha(pool, req.organizacaoId, req.params.id);
    await pool.query(
      `UPDATE org_licitacoes SET ${partes.join(', ')} WHERE organizacao_id = ? AND licitacao_id = ?`,
      [...valores, req.organizacaoId, req.params.id]
    );

    const avisos = [];
    if (mudouEtapa) {
      await pool.query(
        "INSERT INTO anotacoes (organizacao_id, licitacao_id, texto, autor, tipo) VALUES (?, ?, ?, ?, 'etapa')",
        [req.organizacaoId, req.params.id, `${antes.etapa} → ${corpo.etapa}`, (req.usuario && req.usuario.nome) || null]
      );

      const definicao = funil.POR_CHAVE.get(corpo.etapa);

      // Entrar em "Analisando" dispara o download da documentação.
      if (definicao.aoEntrar === 'baixar_edital' && antes.arquivos_status === 'nao_baixado') {
        await fila.enfileirar(
          'baixar_edital',
          { licitacaoId: Number(req.params.id) },
          { prioridade: 1, chaveUnica: `baixar:${req.params.id}` }
        );
        await pool.query("UPDATE licitacoes SET arquivos_status = 'na_fila' WHERE id = ?", [req.params.id]);
        avisos.push('Download da documentação entrou na fila.');
      }

      // Entrar em "Ganhamos" abre o contrato com o checklist da seção 28.3.
      // Idempotente: o card pode entrar, sair e voltar sem duplicar contrato,
      // e nada do que você já preencheu é sobrescrito.
      if (definicao.aoEntrar === 'abrir_contrato') {
        try {
          const r = await contrato.abrir(req.organizacaoId, Number(req.params.id));
          avisos.push(
            r.criado
              ? `Contrato aberto com ${r.marcos_criados} marco(s) no checklist. Confira as datas contra o edital.`
              : 'Esta licitação já tinha contrato registrado.'
          );
        } catch (erro) {
          // Falhar aqui não pode desfazer a mudança de etapa: ganhar a licitação
          // é o fato, e o contrato é o que se monta a partir dele.
          console.error('Erro ao abrir o contrato:', erro.message);
          avisos.push('A etapa mudou, mas o contrato não pôde ser aberto agora. Abra-o na tela Contratos.');
        }
      }

      // Entrar em "Vou disputar" cria os alertas de 48 h e 2 h.
      if (definicao.aoEntrar === 'alertar_prazo') {
        const r = await prazos.alertarAoDecidir(req.organizacaoId, Number(req.params.id));
        avisos.push(
          r.criados
            ? `${r.criados} alerta(s) de prazo criados agora.`
            : r.horas
              ? `Prazo acompanhado: o aviso sai 48 h antes do fim (faltam ${r.horas} h).`
              : 'Sem data de fim das propostas: não dá para alertar.'
        );
      }
    }

    res.json({ ok: true, avisos, mensagem: avisos.join(' ') || null });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível salvar a alteração.', erro);
  }
});

// Histórico do card (seção 4.9): anotações e mudanças de etapa, na mesma linha do tempo.
rotas.get('/:id/anotacoes', async (req, res) => {
  try {
    const [dados] = await pool.query(
      'SELECT * FROM anotacoes WHERE organizacao_id = ? AND licitacao_id = ? ORDER BY criado_em DESC, id DESC LIMIT 200',
      [req.organizacaoId, req.params.id]
    );
    res.json({ dados });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar o histórico.', erro);
  }
});

rotas.post('/:id/anotacoes', async (req, res) => {
  try {
    const texto = String((req.body && req.body.texto) || '').trim();
    if (!texto) return res.status(400).json({ erro: 'Escreva a anotação.' });

    const [[existe]] = await pool.query('SELECT id FROM licitacoes WHERE id = ?', [req.params.id]);
    if (!existe) return res.status(404).json({ erro: 'Licitação não encontrada.' });

    const [r] = await pool.query(
      "INSERT INTO anotacoes (organizacao_id, licitacao_id, texto, autor, tipo) VALUES (?, ?, ?, ?, 'nota')",
      [req.organizacaoId, req.params.id, texto.slice(0, 4000), (req.usuario && req.usuario.nome) || null]
    );
    res.status(201).json({ ok: true, id: r.insertId });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível salvar a anotação.', erro);
  }
});

// POST /api/licitacoes/:id/detalhar — busca detalhe e itens no portal (fila)
rotas.post('/:id/detalhar', async (req, res) => {
  try {
    await fila.enfileirar(
      'detalhar_licitacao',
      { licitacaoId: Number(req.params.id) },
      { prioridade: 1, chaveUnica: `detalhar:${req.params.id}` }
    );
    res.status(202).json({ ok: true, mensagem: 'Detalhamento na fila.' });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível enfileirar o detalhamento.', erro);
  }
});

// ------------------------------------------------- documentação (seção 7.3)

// POST /api/licitacoes/:id/baixar — enfileira o download dos documentos.
rotas.post('/:id/baixar', async (req, res) => {
  try {
    const [linhas] = await pool.query('SELECT id FROM licitacoes WHERE id = ?', [req.params.id]);
    if (!linhas.length) return res.status(404).json({ erro: 'Licitação não encontrada.' });

    const confirmado = Boolean(req.body && req.body.confirmado);
    await fila.enfileirar(
      'baixar_edital',
      { licitacaoId: Number(req.params.id), confirmado },
      { prioridade: 1, chaveUnica: `baixar:${req.params.id}` }
    );
    await pool.query(
      "UPDATE licitacoes SET arquivos_status = 'na_fila' WHERE id = ? AND arquivos_status IN ('nao_baixado','grande_demais')",
      [req.params.id]
    );
    res.status(202).json({
      ok: true,
      mensagem: confirmado
        ? `Download na fila, sem o limite de ${await jobBaixar.limiteMb()} MB.`
        : 'Download dos documentos na fila.',
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível enfileirar o download.', erro);
  }
});

rotas.get('/:id/arquivos', async (req, res) => {
  try {
    const [[licitacao]] = await pool.query(
      'SELECT id, pasta, arquivos_status, arquivos_em FROM licitacoes WHERE id = ?',
      [req.params.id]
    );
    if (!licitacao) return res.status(404).json({ erro: 'Licitação não encontrada.' });

    const [dados] = await pool.query(
      `SELECT id, sequencial, titulo, nome_arquivo, extensao, tamanho_bytes, status, erro, url_origem
         FROM licitacao_arquivos WHERE licitacao_id = ? ORDER BY sequencial ASC`,
      [req.params.id]
    );

    res.json({
      pasta: licitacao.pasta,
      status: licitacao.arquivos_status,
      baixado_em: licitacao.arquivos_em,
      prontos: dados.filter((a) => a.status === 'ok').length,
      dados,
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar os arquivos.', erro);
  }
});

// GET /api/licitacoes/:id/arquivos/:arqId — entrega o arquivo do volume.
rotas.get('/:id/arquivos/:arqId', async (req, res) => {
  try {
    const [[arquivo]] = await pool.query(
      'SELECT * FROM licitacao_arquivos WHERE id = ? AND licitacao_id = ?',
      [req.params.arqId, req.params.id]
    );
    if (!arquivo) return res.status(404).json({ erro: 'Arquivo não encontrado.' });
    if (arquivo.status !== 'ok' || !arquivo.caminho) {
      return res.status(409).json({ erro: 'Esse arquivo ainda não foi baixado.' });
    }
    // O caminho vem do banco, mas conferimos assim mesmo: nada fora do volume.
    if (!servicoArquivos.dentroDoVolume(arquivo.caminho)) {
      return res.status(400).json({ erro: 'Caminho de arquivo inválido.' });
    }

    const absoluto = servicoArquivos.caminhoAbsoluto(arquivo.caminho);
    if (!fs.existsSync(absoluto)) {
      return res.status(410).json({ erro: 'O arquivo não está mais no volume. Baixe a documentação de novo.' });
    }

    // PDF abre na tela; o resto vai como download.
    const inline = arquivo.extensao === '.pdf' && req.query.baixar !== '1';
    res.setHeader('Content-Type', arquivo.extensao === '.pdf' ? 'application/pdf' : 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(arquivo.nome_arquivo)}"`
    );
    fs.createReadStream(absoluto).pipe(res);
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível entregar o arquivo.', erro);
  }
});

// GET /api/licitacoes/:id/zip — "Baixar tudo (.zip)" (seção 7.3).
rotas.get('/:id/zip', async (req, res) => {
  try {
    const [[licitacao]] = await pool.query('SELECT id, pasta FROM licitacoes WHERE id = ?', [req.params.id]);
    if (!licitacao) return res.status(404).json({ erro: 'Licitação não encontrada.' });
    if (!licitacao.pasta || !servicoArquivos.dentroDoVolume(licitacao.pasta)) {
      return res.status(409).json({ erro: 'Esta licitação ainda não tem documentação baixada.' });
    }

    const absoluta = servicoArquivos.caminhoAbsoluto(licitacao.pasta);
    if (!fs.existsSync(absoluta)) {
      return res.status(409).json({ erro: 'Esta licitação ainda não tem documentação baixada.' });
    }

    // archiver 8 expõe classes por formato; não existe mais a fábrica archiver('zip').
    const { ZipArchive } = require('archiver');
    const zip = new ZipArchive({ zlib: { level: 6 } });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(`${licitacao.pasta}.zip`)}"`);
    // Se o empacotamento falhar no meio, o cabeçalho já foi: resta cortar a conexão.
    zip.on('error', (erro) => {
      console.error('Falha ao montar o zip:', erro);
      res.destroy(erro);
    });
    zip.pipe(res);
    zip.directory(absoluta, false);
    await zip.finalize();
  } catch (erro) {
    if (!res.headersSent) responderErro(res, 500, 'Não foi possível montar o zip.', erro);
  }
});

// Checklist de exigências do edital (seção 8.4), em arquivo próprio.
rotas.use('/:id/exigencias', require('./exigencias'));

// Montagem do envio e anexos específicos da licitação (seção 17).
rotas.use('/:id/envio', require('./envio'));

// Declarações geradas com os dados da licitação (seção 18).
rotas.use('/:id/declaracoes', require('./declaracoes'));

// Gerador de proposta (seção 19).
rotas.use('/:id/propostas', require('./propostas'));

// Preço de referência e concorrentes da licitação (seção 12).
rotas.use('/:id', require('./preco'));

// POST /api/licitacoes/:id/ler — relê o edital já baixado e refaz o checklist.
rotas.post('/:id/ler', async (req, res) => {
  try {
    const [[licitacao]] = await pool.query(
      'SELECT id, arquivos_status FROM licitacoes WHERE id = ?',
      [req.params.id]
    );
    if (!licitacao) return res.status(404).json({ erro: 'Licitação não encontrada.' });
    if (!['ok', 'parcial'].includes(licitacao.arquivos_status)) {
      return res.status(409).json({ erro: 'Baixe a documentação antes de ler o edital.' });
    }

    await fila.enfileirar(
      'ler_edital',
      { licitacaoId: Number(req.params.id) },
      { prioridade: 1, chaveUnica: `ler:${req.params.id}` }
    );
    await pool.query(
      "UPDATE licitacoes SET exigencias_status = 'na_fila' WHERE id = ? AND exigencias_status = 'nao_lido'",
      [req.params.id]
    );
    res.status(202).json({ ok: true, mensagem: 'Leitura do edital na fila.' });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível enfileirar a leitura.', erro);
  }
});

// GET /api/licitacoes/:id/linha-do-tempo — a aba da seção 21.4.
// Publicação → alterações → sessão → resultado, com data e hora de cada
// evento. É também a prova documental do que aconteceu, útil se houver recurso.
rotas.get('/:id/linha-do-tempo', async (req, res) => {
  try {
    const [[licitacao]] = await pool.query(
      `SELECT id, objeto, orgao_nome, criado_em, abertura_propostas, fim_propostas,
              situacao, etapa, estrategica, reaberta_como
         FROM ${escopo.daOrganizacao(req.organizacaoId, { todas: true })} l WHERE id = ?`,
      [req.params.id]
    );
    if (!licitacao) return res.status(404).json({ erro: 'Licitação não encontrada.' });

    const { eventos, monitoramento } = await servicoMonitor.linhaDoTempo(req.organizacaoId, req.params.id);
    res.json({ licitacao, eventos, monitoramento });
  } catch (erro) {
    console.error('Erro na linha do tempo:', erro.message);
    responderErro(res, 500, 'Não foi possível carregar a linha do tempo.', erro);
  }
});

// POST /api/licitacoes/:id/monitorar — liga, desliga ou checa agora.
rotas.post('/:id/monitorar', async (req, res) => {
  const acao = (req.body && req.body.acao) || 'ligar';
  try {
    if (acao === 'desligar') {
      await servicoMonitor.desligar(req.organizacaoId, req.params.id, 'desligado na tela');
      return res.json({ ok: true, mensagem: 'Monitoramento desligado.' });
    }

    const monitoramento = await servicoMonitor.ligar({
      organizacaoId: req.organizacaoId,
      licitacaoId: Number(req.params.id),
      motivo: (req.body && req.body.motivo) || 'interesse',
    });
    if (!monitoramento) return res.status(404).json({ erro: 'Licitação não encontrada.' });

    if (acao !== 'checar') {
      return res.json({ ok: true, monitoramento, mensagem: 'Monitoramento ligado.' });
    }

    // "Checar agora" vai ao portal na hora: é o que a pessoa faz quando
    // desconfia que mudou alguma coisa e não quer esperar a cadência.
    const [[completo]] = await pool.query(
      `SELECT m.*, l.etapa, l.objeto, l.orgao_nome, l.orgao_cnpj, l.chave_externa, l.fonte_id,
              l.abertura_propostas, l.fim_propostas, l.situacao, l.valor_estimado, l.pasta, f.adaptador
         FROM monitoramentos m
         JOIN ${escopo.daOrganizacao(req.organizacaoId, { todas: true })} l ON l.id = m.licitacao_id
         JOIN fontes f ON f.id = l.fonte_id
        WHERE m.organizacao_id = ? AND m.licitacao_id = ?`,
      [req.organizacaoId, req.params.id]
    );
    const resultado = await monitorar.checar(completo);
    res.json({
      ok: true,
      resultado,
      mensagem: resultado.eventos.length
        ? `Checado agora: ${resultado.eventos.join('; ')}.`
        : 'Checado agora: nada mudou no portal.',
    });
  } catch (erro) {
    console.error('Erro no monitoramento:', erro.message);
    responderErro(res, 500, 'Não foi possível falar com o portal agora.', erro);
  }
});

// GET /api/licitacoes/:id/ia — a sugestão da leitura assistida (seção 23).
rotas.get('/:id/ia', async (req, res) => {
  try {
    const [[l]] = await pool.query(
      `SELECT l.id, l.ia_resumo, l.ia_em, COALESCE(o.ia_situacao, l.ia_situacao) AS ia_situacao
         FROM licitacoes l
         LEFT JOIN org_licitacoes o ON o.licitacao_id = l.id AND o.organizacao_id = ?
        WHERE l.id = ?`,
      [req.organizacaoId, req.params.id]
    );
    if (!l) return res.status(404).json({ erro: 'Licitação não encontrada.' });

    res.json({
      disponivel: servicoIa.disponivel(),
      situacao: l.ia_situacao,
      em: l.ia_em,
      dados: typeof l.ia_resumo === 'string' ? JSON.parse(l.ia_resumo || 'null') : l.ia_resumo,
    });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível carregar a leitura assistida.', erro);
  }
});

// POST /api/licitacoes/:id/ia — lê agora (ou lê de novo, com forcar).
rotas.post('/:id/ia', async (req, res) => {
  try {
    const r = await jobIa.resumirLicitacao({
      licitacaoId: Number(req.params.id),
      forcar: Boolean(req.body && req.body.forcar),
    });
    if (!r.ok) return res.status(r.desligada ? 409 : 422).json({ erro: r.motivo });

    res.json({
      ...r,
      mensagem: r.cache
        ? 'Leitura recuperada do cache — este edital já havia sido lido, sem custo novo.'
        : 'Edital lido. Confira: tudo o que está aí é sugestão até você confirmar.',
    });
  } catch (erro) {
    console.error('Erro na leitura assistida:', erro.message);
    responderErro(res, 500, 'Não foi possível ler o edital com a IA.', erro);
  }
});

// PATCH /api/licitacoes/:id/ia — confirmar ou recusar a sugestão.
// A IA nunca muda pontuação, etapa ou preço: só esta coluna (seção 23.4).
rotas.patch('/:id/ia', async (req, res) => {
  const situacao = req.body && req.body.situacao;
  if (!['confirmado', 'recusado', 'sugerido'].includes(situacao)) {
    return res.status(400).json({ erro: 'Use situacao: confirmado, recusado ou sugerido.' });
  }
  try {
    // Confirmar/recusar é da organização; 'sugerido' volta ao estado do resumo.
    if (!(await escopo.garantirLinha(pool, req.organizacaoId, req.params.id))) {
      return res.status(404).json({ erro: 'Licitação não encontrada.' });
    }
    await pool.query('UPDATE org_licitacoes SET ia_situacao = ? WHERE organizacao_id = ? AND licitacao_id = ?', [
      situacao === 'sugerido' ? null : situacao,
      req.organizacaoId,
      req.params.id,
    ]);
    res.json({ ok: true });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível salvar.', erro);
  }
});

// GET /api/licitacoes/:id/questionamentos — prazo, modelos e o que já foi
// enviado (seção 25).
rotas.get('/:id/questionamentos', async (req, res) => {
  try {
    const calculado = await questionamento.calcular(req.organizacaoId, Number(req.params.id));
    if (!calculado) return res.status(404).json({ erro: 'Licitação não encontrada.' });

    res.json({
      prazo: calculado.prazo || null,
      motivo: calculado.motivo || null,
      modelos: questionamento.MODELOS.map((m) => ({ codigo: m.codigo, titulo: m.titulo, tipo: m.tipo })),
      enviados: await questionamento.listar(req.organizacaoId, req.params.id),
    });
  } catch (erro) {
    console.error('Erro nos questionamentos:', erro.message);
    responderErro(res, 500, 'Não foi possível carregar os questionamentos.', erro);
  }
});

// POST /api/licitacoes/:id/questionamentos/montar — o texto do modelo pronto.
rotas.post('/:id/questionamentos/montar', async (req, res) => {
  try {
    const r = await questionamento.montarTexto({
      organizacaoId: req.organizacaoId,
      licitacaoId: Number(req.params.id),
      codigo: (req.body && req.body.codigo) || '',
    });
    res.json(r);
  } catch (erro) {
    res.status(422).json({ erro: erro.message });
  }
});

// POST /api/licitacoes/:id/questionamentos — registra o pedido.
rotas.post('/:id/questionamentos', async (req, res) => {
  const { tipo, assunto, texto } = req.body || {};
  if (!['esclarecimento', 'impugnacao'].includes(tipo)) {
    return res.status(400).json({ erro: 'Use tipo: esclarecimento ou impugnacao.' });
  }
  try {
    const r = await questionamento.criar({
      organizacaoId: req.organizacaoId,
      licitacaoId: Number(req.params.id),
      tipo,
      assunto,
      texto,
    });
    res.status(201).json(r);
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível registrar o pedido.', erro);
  }
});

// PATCH /api/licitacoes/:id/questionamentos/:qid — protocolo, resposta e
// resultado. A resposta do órgão vale como parte do edital (seção 25.2).
const CAMPOS_QUESTIONAMENTO = ['protocolo', 'texto_enviado', 'resposta', 'resultado', 'enviado_em', 'respondido_em', 'assunto'];

rotas.patch('/:id/questionamentos/:qid', async (req, res) => {
  const corpo = req.body || {};
  const partes = [];
  const valores = [];

  for (const campo of CAMPOS_QUESTIONAMENTO) {
    if (corpo[campo] === undefined) continue;
    partes.push(`${campo} = ?`);
    valores.push(corpo[campo] === '' ? null : corpo[campo]);
  }
  if (!partes.length) return res.status(400).json({ erro: 'Nada para atualizar.' });

  try {
    const [r] = await pool.query(
      `UPDATE questionamentos SET ${partes.join(', ')} WHERE id = ? AND licitacao_id = ? AND organizacao_id = ?`,
      [...valores, req.params.qid, req.params.id, req.organizacaoId]
    );
    if (!r.affectedRows) return res.status(404).json({ erro: 'Pedido não encontrado.' });
    res.json({ ok: true });
  } catch (erro) {
    responderErro(res, 500, 'Não foi possível salvar.', erro);
  }
});

module.exports = rotas;
module.exports.ETAPAS = ETAPAS;
