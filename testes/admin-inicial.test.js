// Primeiro acesso (Seção 1 do plano SaaS): `npm run admin`. Erra calado — o painel
// subiu em produção sem nenhum usuário e o login só dizia "e-mail ou senha incorretos".
// Sem banco: um `pool` falso e um bcrypt falso.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { garantirAdmin, normalizarEmail, descrever } = require('../backend/servicos/admin-inicial');

const bcryptFalso = {
  hash: async (s) => `hash(${s})`,
  compare: async (s, h) => h === `hash(${s})`,
};

/** Banco em memória que responde só às consultas que o módulo faz. */
function poolFalso({ usuarios = [], membros = [] } = {}) {
  const gravacoes = [];
  const pool = {
    gravacoes,
    usuarios,
    membros,
    async query(sql, params = []) {
      if (/COUNT\(\*\)/.test(sql)) return [[{ n: usuarios.length }]];
      if (/SELECT id, senha_hash FROM usuarios/.test(sql)) {
        return [usuarios.filter((u) => u.email === params[0]).slice(0, 1)];
      }
      if (/INSERT INTO usuarios/.test(sql)) {
        const id = usuarios.length + 1;
        usuarios.push({ id, email: params[1], senha_hash: params[2] });
        gravacoes.push('usuario');
        return [{ insertId: id }];
      }
      if (/UPDATE usuarios SET senha_hash/.test(sql)) {
        usuarios.find((u) => u.id === params[1]).senha_hash = params[0];
        gravacoes.push('senha');
        return [{}];
      }
      if (/SELECT papel FROM organizacao_membros/.test(sql)) {
        return [membros.filter((m) => m.org === params[0] && m.usuario === params[1])];
      }
      if (/INSERT INTO organizacao_membros/.test(sql)) {
        membros.push({ org: params[0], usuario: params[1], papel: 'dono' });
        gravacoes.push('vinculo');
        return [{}];
      }
      if (/UPDATE organizacao_membros SET papel/.test(sql)) {
        membros.find((m) => m.org === params[0] && m.usuario === params[1]).papel = 'dono';
        gravacoes.push('promocao');
        return [{}];
      }
      throw new Error(`consulta inesperada: ${sql}`);
    },
  };
  return pool;
}

test('normaliza o e-mail como o login: sem espaço e em minúsculas', () => {
  assert.equal(normalizarEmail('  Almir.Seibert@Gmail.com \n'), 'almir.seibert@gmail.com');
  assert.equal(normalizarEmail(undefined), '');
});

test('sem as variáveis não grava nada e diz por quê', async () => {
  const pool = poolFalso();
  const r = await garantirAdmin({ pool, bcrypt: bcryptFalso, email: '', senha: '' });
  assert.equal(r.acao, 'sem_variaveis');
  assert.deepEqual(pool.gravacoes, []);
});

test('cria o administrador mesmo com outros usuários já no banco', async () => {
  const pool = poolFalso({ usuarios: [{ id: 1, email: 'cliente@x.com', senha_hash: 'h' }] });
  const r = await garantirAdmin({ pool, bcrypt: bcryptFalso, email: ' Admin@Teste.com ', senha: 'SenhaForte123' });
  assert.equal(r.acao, 'criado');
  assert.equal(r.totalUsuarios, 1);
  assert.equal(pool.usuarios[1].email, 'admin@teste.com');
  assert.deepEqual(pool.membros, [{ org: 1, usuario: 2, papel: 'dono' }]);
});

test('usuário que já existe sem vínculo vira dono da organização 1, sem trocar a senha', async () => {
  const pool = poolFalso({ usuarios: [{ id: 7, email: 'a@x.com', senha_hash: 'hash(Antiga123)' }] });
  const r = await garantirAdmin({ pool, bcrypt: bcryptFalso, email: 'a@x.com', senha: 'Nova12345' });
  assert.equal(r.acao, 'vinculado');
  assert.equal(r.senhaConfere, false);
  assert.equal(pool.usuarios[0].senha_hash, 'hash(Antiga123)');
  assert.ok(r.avisos.some((a) => a.includes('--redefinir-senha')));
});

test('só troca a senha com o pedido explícito', async () => {
  const base = { usuarios: [{ id: 3, email: 'a@x.com', senha_hash: 'hash(Antiga123)' }], membros: [{ org: 1, usuario: 3, papel: 'dono' }] };
  const sem = poolFalso(structuredClone(base));
  assert.equal((await garantirAdmin({ pool: sem, bcrypt: bcryptFalso, email: 'a@x.com', senha: 'Nova12345' })).acao, 'ja_existia');
  assert.deepEqual(sem.gravacoes, []);

  const com = poolFalso(structuredClone(base));
  const r = await garantirAdmin({ pool: com, bcrypt: bcryptFalso, email: 'a@x.com', senha: 'Nova12345', redefinirSenha: true });
  assert.equal(r.acao, 'senha_redefinida');
  assert.equal(com.usuarios[0].senha_hash, 'hash(Nova12345)');
});

test('papel menor na organização 1 sobe para dono', async () => {
  const pool = poolFalso({ usuarios: [{ id: 3, email: 'a@x.com', senha_hash: 'hash(Boa123456)' }], membros: [{ org: 1, usuario: 3, papel: 'leitor' }] });
  const r = await garantirAdmin({ pool, bcrypt: bcryptFalso, email: 'a@x.com', senha: 'Boa123456' });
  assert.equal(r.acao, 'vinculado');
  assert.equal(pool.membros[0].papel, 'dono');
});

test('senha curta avisa, mas não bloqueia, e a senha nunca aparece no texto', async () => {
  const pool = poolFalso();
  const r = await garantirAdmin({ pool, bcrypt: bcryptFalso, email: 'a@x.com', senha: '123456' });
  assert.equal(r.acao, 'criado');
  const texto = descrever(r).join('\n');
  assert.match(texto, /AVISO: a senha tem 6 caracteres/);
  assert.ok(!texto.includes('123456') && !texto.includes('hash('));
  assert.ok(!JSON.stringify(r).includes('123456'));
});
