/** Voltage Obsidian — paleta e tipografia da seção 15, com tema claro (Seção 2 do plano SaaS). */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Seção 2 do PLANO_SAAS: cada cor é um trio RGB em variável CSS (estilo.css),
      // trocado por [data-tema]. O `<alpha-value>` mantém `bg-voltagem/10` funcionando.
      colors: {
        obsidiana: 'rgb(var(--cor-obsidiana) / <alpha-value>)',
        superficie: 'rgb(var(--cor-superficie) / <alpha-value>)',
        borda: 'rgb(var(--cor-borda) / <alpha-value>)',
        navy: 'rgb(var(--cor-navy) / <alpha-value>)',
        voltagem: 'rgb(var(--cor-voltagem) / <alpha-value>)',
        texto: 'rgb(var(--cor-texto) / <alpha-value>)',
        'texto-suave': 'rgb(var(--cor-texto-suave) / <alpha-value>)',
        ok: 'rgb(var(--cor-ok) / <alpha-value>)',
        atencao: 'rgb(var(--cor-atencao) / <alpha-value>)',
        erro: 'rgb(var(--cor-erro) / <alpha-value>)',
        apagado: 'rgb(var(--cor-apagado) / <alpha-value>)',
        realce: 'rgb(var(--cor-realce) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        titulo: ['Fraunces', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
