// Seção 2 do PLANO_SAAS_CONLICITACAO.md — contraste dos dois temas.
// Erra calado: quem mexe numa variável de cor em estilo.css não vê o tema que
// não está usando. Lê os trios RGB dos blocos [data-tema] e mede WCAG 2.1.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '../frontend/src/estilo.css'), 'utf8');

function tokens(seletor) {
  const inicio = css.indexOf(`[data-tema='${seletor}'] {`);
  assert.ok(inicio >= 0, `bloco do tema ${seletor} não encontrado`);
  const bloco = css.slice(inicio, css.indexOf('}', inicio));
  const cores = {};
  for (const [, nome, r, g, b] of bloco.matchAll(/--cor-([a-z-]+):\s*(\d+)\s+(\d+)\s+(\d+)/g)) {
    cores[nome] = [Number(r), Number(g), Number(b)];
  }
  return cores;
}

function luminancia(rgb) {
  const [r, g, b] = rgb.map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a, b) {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const OBRIGATORIOS = [
  'obsidiana', 'superficie', 'borda', 'navy', 'voltagem', 'texto', 'texto-suave',
  'ok', 'atencao', 'erro', 'apagado', 'realce', 'rolagem', 'rolagem-foco',
];

for (const tema of ['escuro', 'claro']) {
  const c = tokens(tema);

  test(`tema ${tema}: define todas as cores que o tailwind.config.js usa`, () => {
    for (const nome of OBRIGATORIOS) assert.ok(c[nome], `falta --cor-${nome}`);
  });

  // AAA (7:1) para o texto; AA (4,5:1) para o resto — o texto-suave do escuro é o
  // #94A3B8 da seção 15 da spec (6,9:1 sobre a superfície), que não se muda aqui.
  test(`tema ${tema}: texto >= 7:1, suave e cor de estado >= 4,5:1 sobre fundo e superfície`, () => {
    for (const fundo of ['obsidiana', 'superficie']) {
      assert.ok(contraste(c.texto, c[fundo]) >= 7, `texto sobre ${fundo}: ${contraste(c.texto, c[fundo]).toFixed(2)}`);
      for (const nome of ['texto-suave', 'voltagem', 'ok', 'atencao', 'erro', 'apagado']) {
        assert.ok(contraste(c[nome], c[fundo]) >= 4.5, `${nome} sobre ${fundo}: ${contraste(c[nome], c[fundo]).toFixed(2)}`);
      }
    }
  });

  test(`tema ${tema}: cabeçalho de tabela e botão de destaque legíveis`, () => {
    assert.ok(contraste(c['texto-suave'], c.navy) >= 4.5, 'texto-suave sobre navy');
    // Login/Radar: `bg-voltagem text-obsidiana`.
    assert.ok(contraste(c.obsidiana, c.voltagem) >= 4.5, 'obsidiana sobre voltagem');
    // "Baixa" é apagada de propósito, mas ainda abaixo do texto-suave na hierarquia.
    assert.ok(contraste(c.apagado, c.obsidiana) < contraste(c['texto-suave'], c.obsidiana), 'apagado mais fraco que suave');
  });
}

test('index.html usa a mesma chave de localStorage que servicos/tema.js', () => {
  const html = fs.readFileSync(path.join(__dirname, '../frontend/index.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '../frontend/src/servicos/tema.js'), 'utf8');
  const chave = js.match(/CHAVE_TEMA = '([^']+)'/)[1];
  assert.ok(html.includes(`localStorage.getItem('${chave}')`), `index.html não lê '${chave}'`);
});

test('o escuro do :root é o mesmo do [data-tema=escuro] (sem atributo não muda nada)', () => {
  assert.match(css, /:root,\s*\[data-tema='escuro'\] \{/);
});
