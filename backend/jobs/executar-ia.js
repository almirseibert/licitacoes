// Leitura assistida pela linha de comando (seção 23).
//   npm run ia                      → estado e gasto
//   npm run ia -- --licitacao=195    → lê uma
//   npm run ia -- --lote=10          → lê as que valem e ainda não foram lidas
//   npm run ia -- --palavras         → sugere palavras-chave (seção 23.5)
// Acrescente --forcar para ignorar o cache.
const pool = require('../config/db');
const ia = require('../servicos/ia');
const job = require('./ia-resumos');

const argumentos = process.argv.slice(2);
function opcao(nome, padrao) {
  const achado = argumentos.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.split('=')[1] : padrao;
}
const forcar = argumentos.includes('--forcar');

function reais(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 4 });
}

function imprimir(id, r) {
  if (!r.ok) {
    console.log(`  licitação ${id}: ${r.motivo}`);
    return false;
  }
  const d = r.dados;
  console.log(`\n  licitação ${id}${r.cache ? ' (do cache, sem custo novo)' : ''}`);
  console.log(`  resumo: ${d.resumo}`);
  if (d.prazo_execucao) console.log(`  prazo: ${d.prazo_execucao}`);
  if (d.o_que_pedem.length) console.log(`  pedem: ${d.o_que_pedem.join(' | ')}`);
  for (const e of d.exigencias_criticas) {
    console.log(`  exigência [${e.gravidade}] ${e.rotulo}: ${e.texto}`);
  }
  for (const a of d.armadilhas) console.log(`  armadilha: ${a}`);
  if (d.pode_participar) {
    console.log(`  parecer: ${d.pode_participar.resposta} — ${d.pode_participar.porque}`);
  }
  console.log(`  confiança ${d.confianca} · leu ${d._meta.secoes.join(', ')}${d._meta.cortado ? ' · texto cortado' : ''}`);
  if (d._meta.descartados.length) {
    console.log(`  DESCARTADO na validação: ${d._meta.descartados.join('; ')}`);
  }
  if (r.tokens) console.log(`  tokens ${r.tokens.entrada}→${r.tokens.saida} · ${reais(r.custo)}`);
  return true;
}

async function principal() {
  if (!ia.disponivel()) {
    console.log(
      'Leitura assistida desligada: falta GEMINI_API_KEY no .env.\n' +
        'O painel funciona inteiro sem ela — a IA é acréscimo, não alicerce.'
    );
    const g = await ia.gasto({});
    console.log(`\nLivro-caixa dos últimos ${g.dias} dias: ${g.chamadas} chamada(s), ${reais(g.custo)}.`);
    return;
  }

  const licitacao = opcao('licitacao');
  const lote = Number(opcao('lote', 0));

  if (argumentos.includes('--palavras')) {
    const r = await job.sugerirPalavras({ forcar });
    if (!r.ok) {
      console.log(`Sugestão de palavras: ${r.motivo}`);
    } else {
      console.log(`${r.gravadas} termo(s) novo(s):`);
      for (const t of r.dados.termos) console.log(`  ${t.termo}${t.grupo ? ` [${t.grupo}]` : ''} — ${t.porque || ''}`);
    }
  } else if (licitacao) {
    imprimir(licitacao, await job.resumirLicitacao({ licitacaoId: Number(licitacao), forcar }));
  } else if (lote) {
    const [candidatas] = await pool.query(
      // GROUP BY em vez de DISTINCT: com DISTINCT o MySQL recusa ordenar por
      // coluna que não está no SELECT, e a ordem aqui importa (favorita e
      // pontuação primeiro).
      `SELECT l.id
         FROM licitacoes l
         JOIN licitacao_arquivos a ON a.licitacao_id = l.id AND a.status = 'ok' AND a.texto_extraido IS NOT NULL
        WHERE l.descartada = 0 ${forcar ? '' : 'AND l.ia_resumo IS NULL'}
        GROUP BY l.id, l.favorito, l.pontuacao
        ORDER BY l.favorito DESC, l.pontuacao DESC LIMIT ?`,
      [lote]
    );
    console.log(`Lendo ${candidatas.length} edital(is)...`);
    let ok = 0;
    for (const c of candidatas) {
      if (imprimir(c.id, await job.resumirLicitacao({ licitacaoId: c.id, forcar }))) ok += 1;
    }
    console.log(`\n${ok} de ${candidatas.length} leram sem erro.`);
  }

  const g = await ia.gasto({});
  console.log(
    `\nLivro-caixa dos últimos ${g.dias} dias · modelo ${g.modelo} · ` +
      `${g.chamadas} chamada(s), ${g.falhas} falha(s), ` +
      `${g.tokens_entrada}→${g.tokens_saida} tokens, ${reais(g.custo)}.`
  );
}

principal()
  .then(() => pool.end())
  .catch(async (erro) => {
    console.error('Falha na leitura assistida:', erro.sqlMessage || erro.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
