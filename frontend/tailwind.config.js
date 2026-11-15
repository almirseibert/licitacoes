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
      // Página de divulgação e popup de entrada (animações respeitam prefers-reduced-motion em estilo.css).
      keyframes: {
        aparecer: { from: { opacity: '0' }, to: { opacity: '1' } },
        subir: { from: { opacity: '0', transform: 'translateY(14px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        flutuar: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-8px)' } },
      },
      animation: {
        aparecer: 'aparecer .18s ease-out both',
        subir: 'subir .28s cubic-bezier(.2,.8,.2,1) both',
        flutuar: 'flutuar 7s ease-in-out infinite',
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
