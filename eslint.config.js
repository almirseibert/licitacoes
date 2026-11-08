// Configuração do ESLint (seção 32, primeiro item do checklist).
//
// O painel não tinha lint nem teste, e o checklist de qualidade pede os dois.
// A régua aqui é deliberadamente baixa em estilo e alta no que pega defeito:
// variável que não se usa, nome que não existe, `await` esquecido num `for`.
// Formatação não entra — ninguém deste projeto precisa de uma discussão sobre
// vírgula, e o diff de um reformatador esconderia mudança de verdade.
//
// Três ambientes diferentes no mesmo repositório, daí três blocos:
//   · backend e worker — CommonJS no Node;
//   · frontend          — módulos ES no navegador, com JSX;
//   · testes            — CommonJS com o executor do próprio Node.
const js = require('@eslint/js');
const globals = require('globals');
const react = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');

const regrasQuePegamDefeito = {
  // `no-unused-vars` é o que mais pega import e parâmetro que sobraram de uma
  // refatoração. Argumento usado só para posição (`_req`) fica de fora.
  'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  'no-undef': 'error',
  // Promise esquecida dentro de laço ou condição é o defeito mais caro deste
  // código: a fila segue sem esperar o portal e o resultado chega vazio.
  'require-atomic-updates': 'error',
  'no-constant-condition': ['error', { checkLoops: false }],
  'no-empty': ['error', { allowEmptyCatch: true }],
  // `==` entre tipos diferentes já causou comparação de id numérico com string
  // de query string neste projeto.
  eqeqeq: ['error', 'smart'],
  // Caractere de controle em expressão regular é intencional aqui: nome de
  // arquivo vindo do Content-Disposition (seção 30, item 3), célula de planilha
  // e resposta do modelo (seção 23.4) são limpos justamente por isso.
  'no-control-regex': 'off',
  'no-var': 'error',
  'prefer-const': 'error',
};

module.exports = [
  {
    ignores: ['frontend/dist/**', 'node_modules/**', 'dados/**', 'frontend/node_modules/**'],
  },
  // ---------------------------------------------------- backend e worker
  {
    files: ['backend/**/*.js', 'worker/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: { ...js.configs.recommended.rules, ...regrasQuePegamDefeito },
  },
  // ---------------------------------------------------------- frontend
  {
    files: ['frontend/src/**/*.{js,jsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...js.configs.recommended.rules,
      ...regrasQuePegamDefeito,
      // Sem estas duas, componente importado e usado só no JSX seria acusado de
      // não ser usado, e o lint viraria barulho que ninguém lê.
      'react/jsx-uses-react': 'error',
      'react/jsx-uses-vars': 'error',
      // Dependência faltando em `useEffect` é efeito que não roda de novo
      // quando devia — o filtro do Radar que não recarrega, por exemplo. Como
      // aviso, não erro: há casos legítimos, e o código já marca os dele com
      // `eslint-disable-next-line`.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  // ------------------------------------------------------------- testes
  {
    files: ['testes/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: { ...js.configs.recommended.rules, ...regrasQuePegamDefeito },
  },
  // Configuração do próprio lint: CommonJS no Node.
  {
    files: ['eslint.config.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { ...js.configs.recommended.rules },
  },
  // Configuração do frontend (Vite, Tailwind, PostCSS): módulos ES rodando no
  // Node. É o único canto do repositório que é as duas coisas ao mesmo tempo.
  {
    files: ['frontend/*.config.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
    rules: { ...js.configs.recommended.rules },
  },
];
