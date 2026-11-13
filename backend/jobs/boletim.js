// Boletim diário (Seção 4 do PLANO_SAAS_CONLICITACAO.md).
//
// De hora em hora o worker chama `rodar()`: para cada organização com o
// recurso `boletim` e cada filtro ativo, se um horário do filtro venceu e o
// boletim dele ainda não saiu hoje, monta o boletim com o que é NOVO para o
// filtro e manda por e-mail a quem não se descadastrou.
//
// Novo = nunca entrou em boletim deste filtro (UNIQUE perfil × licitação no
// banco), coletado nos últimos `DIAS_JANELA` dias e com proposta ainda aberta.
// A decisão do usuário vale: licitação que a organização descartou não volta.
const pool = require('../config/db');
const escopo = require('../servicos/escopo');
const limites = require('../servicos/limites');
const email = require('../servicos/email');
const { jwt, urlPublica } = require('../config/ambiente');
const regras = require('../regras/boletim');

const DIAS_JANELA = 3;
const FUSO = 'America/Sao_Paulo';
const MAX_ITENS = 200;
const MAX_TEXTO_EDITAL = 2 * 1024 * 1024;

/** Data (AAAA-MM-DD) e hora no fuso do cliente — o worker pode rodar em UTC. */
function agoraNoFuso(agora = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(agora)
      .map((p) => [p.type, p.value])
  );
  return { data: `${partes.year}-${partes.month}-${partes.day}`, hora: Number(partes.hour) };
}

/**
 * Toda organização começa com um filtro: as palavras-chave e as exclusões que
 * ela já cadastrou para o Radar. Só cria se ela não tiver nenhum.
 */
async function garantirPerfilInicial(organizacaoId, conexao = pool) {
  const org = escopo.idOrganizacao(organizacaoId);
  const [[{ total }]] = await conexao.query('SELECT COUNT(*) AS total FROM perfis_busca WHERE organizacao_id = ?', [org]);
  if (total) return false;
  const [palavras] = await conexao.query(
    'SELECT termo FROM palavras_chave WHERE organizacao_id = ? AND ativa = 1 ORDER BY peso DESC, termo LIMIT 100',
    [org]
  );
  const [excluidas] = await conexao.query(
    'SELECT termo FROM palavras_excluidas WHERE organizacao_id = ? AND ativa = 1 ORDER BY termo LIMIT 100',
    [org]
  );
  await conexao.query(
    `INSERT IGNORE INTO perfis_busca (organizacao_id, nome, palavras, exclusoes, ufs, municipios, modalidades, horarios)
     VALUES (?, 'Filtro principal', ?, ?, '[]', '[]', '[]', ?)`,
    [
      org,
      JSON.stringify(palavras.map((p) => p.termo)),
      JSON.stringify(excluidas.map((p) => p.termo)),
      JSON.stringify(regras.HORARIOS_PADRAO),
    ]
  );
  return true;
}

async function textosDoEdital(ids) {
  const textos = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200);
    const [linhas] = await pool.query(
      `SELECT licitacao_id, texto_extraido FROM licitacao_arquivos
        WHERE licitacao_id IN (?) AND texto_extraido IS NOT NULL`,
      [lote]
    );
    for (const l of linhas) {
      const antes = textos.get(l.licitacao_id) || '';
      const resta = MAX_TEXTO_EDITAL - antes.length;
      if (resta > 0) textos.set(l.licitacao_id, `${antes}\n${String(l.texto_extraido).slice(0, resta)}`);
    }
  }
  return textos;
}

/**
 * O que é novo para o filtro e casa com ele. Não grava nada.
 * @returns {Promise<Array<object>>} licitações com `palavra` e `onde`
 */
async function selecionar(perfil, { dias = DIAS_JANELA } = {}) {
  const org = escopo.idOrganizacao(perfil.organizacao_id);
  const condicoes = [
    'l.descartada = 0',
    'l.criado_em >= NOW() - INTERVAL ? DAY',
    '(l.fim_propostas IS NULL OR l.fim_propostas > NOW())',
    'NOT EXISTS (SELECT 1 FROM boletim_itens bi WHERE bi.perfil_id = ? AND bi.licitacao_id = l.id)',
  ];
  const valores = [Number(dias), perfil.id];
  // UF é o corte mais barato e mais seletivo: vai para o SQL. O resto é JS puro.
  if (perfil.ufs.length) {
    condicoes.push('l.uf IN (?)');
    valores.push(perfil.ufs);
  }
  const [candidatas] = await pool.query(
    `SELECT l.id, l.objeto, l.orgao_nome, l.uf, l.municipio, l.modalidade, l.valor_estimado,
            l.orcamento_sigiloso, l.fim_propostas, l.link_portal,
            -- NULL quando a organização nunca pontuou a licitação: a nota mínima não a barra.
            (SELECT o.pontuacao FROM org_licitacoes o WHERE o.organizacao_id = ${org} AND o.licitacao_id = l.id) AS pontuacao
       FROM ${escopo.daOrganizacao(org, { todas: true })} l
      WHERE ${condicoes.join(' AND ')}
      ORDER BY l.fim_propostas IS NULL, l.fim_propostas ASC`,
    valores
  );

  const casadas = [];
  const paraEdital = [];
  for (const lic of candidatas) {
    const r = regras.casar(perfil, lic);
    if (r.casa) casadas.push({ ...lic, palavra: r.palavra, onde: r.onde });
    else if (r.motivo === 'palavra') paraEdital.push(lic);
  }
  // Só lê o texto do edital de quem passou em tudo menos na palavra.
  if (paraEdital.length) {
    const textos = await textosDoEdital(paraEdital.map((l) => l.id));
    for (const lic of paraEdital) {
      const texto = textos.get(lic.id);
      if (!texto) continue;
      const r = regras.casar(perfil, lic, texto);
      if (r.casa) casadas.push({ ...lic, palavra: r.palavra, onde: r.onde });
    }
  }
  // As do edital entraram por último: volta à ordem por prazo antes do corte.
  const prazo = (l) => (l.fim_propostas ? new Date(l.fim_propostas).getTime() : Infinity);
  return casadas.sort((a, b) => prazo(a) - prazo(b)).slice(0, MAX_ITENS);
}

async function destinatarios(perfil) {
  const [linhas] = await pool.query(
    `SELECT u.id, u.nome, u.email
       FROM organizacao_membros m
       JOIN usuarios u ON u.id = m.usuario_id AND u.ativo = 1
      WHERE m.organizacao_id = ?
        AND NOT EXISTS (SELECT 1 FROM boletim_descadastros d WHERE d.perfil_id = ? AND d.usuario_id = u.id)`,
    [perfil.organizacao_id, perfil.id]
  );
  return linhas;
}

async function enviar(perfil, boletim, itens) {
  if (!perfil.enviar_email) return { status: 'sem_email', detalhe: 'e-mail desligado no filtro' };
  const pessoas = await destinatarios(perfil);
  if (!pessoas.length) return { status: 'sem_destinatario', detalhe: 'todos se descadastraram' };
  let enviados = 0;
  let motivo = null;
  for (const pessoa of pessoas) {
    const token = regras.tokenDescadastro(jwt.segredo, perfil.id, pessoa.id);
    const linkDescadastro = urlPublica ? `${urlPublica}/api/boletins/descadastro/${token}` : '';
    const r = await email.enviarTransacional({
      para: pessoa.email,
      assunto: regras.montarAssunto(perfil, boletim),
      texto: regras.montarTexto(perfil, boletim, itens, { urlPublica, linkDescadastro }),
    });
    if (r.enviado) enviados += 1;
    else motivo = r.motivo;
  }
  if (enviados) return { status: 'enviado', detalhe: `${enviados} de ${pessoas.length} destinatário(s)` };
  return { status: motivo === 'smtp não configurado' ? 'sem_email' : 'erro', detalhe: String(motivo || '').slice(0, 255) };
}

/**
 * Gera (ou, com `simular`, só calcula) o boletim de um filtro num horário.
 * Idempotente: o mesmo filtro × dia × horário não sai duas vezes.
 */
async function gerar(perfil, { data, horario, simular = false, dias = DIAS_JANELA } = {}) {
  const itens = await selecionar(perfil, { dias });
  if (simular) return { perfil_id: perfil.id, simulado: true, total_itens: itens.length, itens };

  const conexao = await pool.getConnection();
  let boletim;
  try {
    await conexao.beginTransaction();
    const [[{ proximo }]] = await conexao.query(
      'SELECT COALESCE(MAX(numero), 0) + 1 AS proximo FROM boletins WHERE organizacao_id = ? AND data = ? FOR UPDATE',
      [perfil.organizacao_id, data]
    );
    const [r] = await conexao.query(
      `INSERT IGNORE INTO boletins (organizacao_id, perfil_id, data, horario, numero, total_itens, email_status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [perfil.organizacao_id, perfil.id, data, horario, itens.length ? proximo : 0, itens.length, itens.length ? null : 'sem_itens']
    );
    if (!r.affectedRows) {
      await conexao.rollback();
      return { perfil_id: perfil.id, ja_gerado: true, total_itens: 0 };
    }
    const boletimId = r.insertId;
    if (itens.length) {
      // INSERT IGNORE: se outra rodada já mandou a licitação neste filtro, a
      // UNIQUE (perfil, licitação) segura — e o total abaixo é o que entrou.
      const [ins] = await conexao.query(
        'INSERT IGNORE INTO boletim_itens (organizacao_id, boletim_id, perfil_id, licitacao_id, palavra, onde) VALUES ?',
        [itens.map((i) => [perfil.organizacao_id, boletimId, perfil.id, i.id, i.palavra ? String(i.palavra).slice(0, 160) : null, i.onde])]
      );
      if (ins.affectedRows !== itens.length) {
        const [ficaram] = await conexao.query('SELECT licitacao_id FROM boletim_itens WHERE boletim_id = ?', [boletimId]);
        const ids = new Set(ficaram.map((f) => f.licitacao_id));
        itens.splice(0, itens.length, ...itens.filter((i) => ids.has(i.id)));
        await conexao.query(
          'UPDATE boletins SET total_itens = ?, email_status = IF(? = 0, \'sem_itens\', email_status) WHERE id = ?',
          [itens.length, itens.length, boletimId]
        );
      }
    }
    boletim = { id: boletimId, numero: itens.length ? proximo : 0, data, horario, total_itens: itens.length };
    await conexao.commit();
  } catch (erro) {
    await conexao.rollback().catch(() => {});
    throw erro;
  } finally {
    conexao.release();
  }

  if (!boletim.total_itens) return { perfil_id: perfil.id, boletim_id: boletim.id, total_itens: 0, email: 'sem_itens' };
  const envio = await enviar(perfil, boletim, itens);
  await pool.query(
    "UPDATE boletins SET email_status = ?, email_detalhe = ?, enviado_em = IF(? = 'enviado', NOW(), NULL) WHERE id = ?",
    [envio.status, envio.detalhe || null, envio.status, boletim.id]
  );
  return { perfil_id: perfil.id, boletim_id: boletim.id, numero: boletim.numero, total_itens: boletim.total_itens, email: envio.status, itens };
}

/** A organização recebe boletim? Plano com `boletim` e assinatura em dia. */
async function podeReceber(organizacaoId) {
  const dados = await limites.daOrganizacao(organizacaoId);
  if (!dados) return false;
  if (dados.isenta) return true;
  return limites.temRecurso(dados.plano, 'boletim') && dados.situacao.pode_escrever;
}

async function perfisAtivos(organizacaoId) {
  const [linhas] = await pool.query(
    'SELECT * FROM perfis_busca WHERE organizacao_id = ? AND ativo = 1 ORDER BY id',
    [escopo.idOrganizacao(organizacaoId)]
  );
  return linhas.map(regras.lerPerfil);
}

/**
 * Rodada do worker. `forcar` (linha de comando) ignora o horário e gera agora,
 * no slot da hora corrente. `simular` não grava nem envia.
 */
async function rodar({ agora = new Date(), org = null, simular = false, forcar = false, dias = DIAS_JANELA } = {}) {
  const { data, hora } = agoraNoFuso(agora);
  const [orgs] = org
    ? [[{ id: escopo.idOrganizacao(org) }]]
    : await pool.query("SELECT id FROM organizacoes WHERE status <> 'suspensa' ORDER BY id");
  const resultado = { data, hora, organizacoes: 0, boletins: [], erros: [] };

  for (const { id } of orgs) {
    try {
      if (!(await podeReceber(id))) continue;
      // O filtro inicial é configuração, não boletim: a simulação também o cria.
      await garantirPerfilInicial(id);
      resultado.organizacoes += 1;
      const perfis = await perfisAtivos(id);
      if (!perfis.length) continue;
      const [gerados] = await pool.query(
        'SELECT perfil_id, horario FROM boletins WHERE organizacao_id = ? AND data = ?',
        [id, data]
      );
      for (const perfil of perfis) {
        const ja = gerados.filter((g) => g.perfil_id === perfil.id).map((g) => g.horario);
        const horario = simular || forcar ? hora : regras.horarioDevido(perfil.horarios, hora, ja);
        if (horario === null) continue;
        const r = await gerar(perfil, { data, horario, simular, dias });
        resultado.boletins.push({ organizacao_id: id, perfil: perfil.nome, horario, ...r });
      }
    } catch (erro) {
      resultado.erros.push(`organização ${id}: ${erro.sqlMessage || erro.message}`);
    }
  }
  return resultado;
}

module.exports = { rodar, gerar, selecionar, garantirPerfilInicial, agoraNoFuso, DIAS_JANELA };
