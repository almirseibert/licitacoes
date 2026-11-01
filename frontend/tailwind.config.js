/** Voltage Obsidian — paleta e tipografia da seção 15. */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        obsidiana: '#0A0E1A',
        superficie: '#111827',
        borda: '#1F2937',
        navy: '#011F41',
        voltagem: '#22D3EE',
        texto: '#E5E7EB',
        'texto-suave': '#94A3B8',
        ok: '#34D399',
        atencao: '#FBBF24',
        erro: '#F87171',
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
