// Agenda de portais (Seção 10 do plano SaaS).
//
// No lugar do cofre de senha que o projeto não faz (CLAUDE.md): nome, endereço,
// tipo, vencimento do cadastro e observação. A tabela não tem coluna de login
// nem de senha, e esta validação não aceita campo com esse nome — quem tentar
// mandar recebe 400 em vez de ver o valor sumir calado.
const { diasEntre } = require('./documentos');
const { AVISOS_DIAS } = require('./validades');

const TIPOS = ['compras', 'cadastro', 'certidao', 'outro'];
const AVISO_DIAS = 30;
const CAMPOS_PROIBIDOS = /senha|pass|login|usuario|user|token|certificado/i;

function soDia(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const texto = String(valor).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return undefined;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto ? texto : undefined;
}

/**
 * Valida o corpo de criar/alterar. `parcial` = PATCH (só o que veio).
 * @returns {{campos?:object, erro?:string}}
 */
function validar(corpo = {}, { parcial = false } = {}) {
  const proibido = Object.keys(corpo).find((k) => k !== 'login_vence_em' && CAMPOS_PROIBIDOS.test(k));
  if (proibido) return { erro: 'A agenda de portais não guarda login nem senha. Guarde-os no seu gerenciador de senhas.' };

  const campos = {};
  if (!parcial || 'nome' in corpo) {
    const nome = String(corpo.nome || '').trim();
    if (!nome) return { erro: 'Dê um nome ao portal.' };
    campos.nome = nome.slice(0, 120);
  }
  if (!parcial || 'url' in corpo) {
    const url = String(corpo.url || '').trim();
    if (url && !/^https?:\/\/[^\s]+$/i.test(url)) return { erro: 'O endereço precisa começar com http:// ou https://.' };
    if (url.length > 500) return { erro: 'Endereço longo demais.' };
    campos.url = url || null;
  }
  if (!parcial || 'tipo' in corpo) {
    const tipo = String(corpo.tipo || 'compras');
    if (!TIPOS.includes(tipo)) return { erro: 'Tipo de portal inválido.' };
    campos.tipo = tipo;
  }
  if (!parcial || 'login_vence_em' in corpo) {
    const d = soDia(corpo.login_vence_em);
    if (d === undefined) return { erro: 'Data de vencimento inválida.' };
    campos.login_vence_em = d;
  }
  if (!parcial || 'observacao' in corpo) {
    campos.observacao = String(corpo.observacao || '').trim().slice(0, 1000) || null;
  }
  if (parcial && !Object.keys(campos).length) return { erro: 'Nada para alterar.' };
  return { campos };
}

/** Situação do cadastro no portal, dado o dia de hoje (Brasília). */
function situacao(venceEm, hoje) {
  if (!venceEm) return { cor: 'cinza', dias: null, texto: 'sem vencimento' };
  const dias = diasEntre(hoje, String(venceEm).slice(0, 10));
  if (dias < 0) return { cor: 'vermelho', dias, texto: `cadastro vencido há ${-dias} dias` };
  if (dias === 0) return { cor: 'vermelho', dias, texto: 'cadastro vence hoje' };
  if (dias <= AVISO_DIAS) return { cor: 'amarelo', dias, texto: `cadastro vence em ${dias} dias` };
  return { cor: 'verde', dias, texto: `válido por ${dias} dias` };
}

/** O marco de aviso já cruzado: 30, 15, 3, '0' (vence hoje) ou 'vencido'; null se folgado. */
function marco(dias) {
  if (dias === null || dias === undefined) return null;
  if (dias < 0) return 'vencido';
  if (dias === 0) return '0';
  const cruzados = AVISOS_DIAS.filter((m) => dias <= m);
  return cruzados.length ? String(Math.min(...cruzados)) : null;
}

module.exports = { TIPOS, AVISO_DIAS, validar, situacao, marco, soDia };
