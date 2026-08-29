/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Pile système moderne · un logiciel installé doit ressembler au
        // système sur lequel il tourne, pas à une page web. `ui-sans-serif`
        // en tête prend la police d'interface native de chaque plateforme ;
        // Segoe UI Variable reste nommée pour Windows 11.
        sans: [
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          '"Segoe UI Variable Text"',
          '"Segoe UI"',
          'Inter',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', '"Courier New"', 'monospace'],
      },
      colors: {
        chrome: 'var(--chrome)',
        'chrome-alt': 'var(--chrome-alt)',
        'chrome-border': 'var(--chrome-border)',
        'chrome-text': 'var(--chrome-text)',
        'chrome-text-dim': 'var(--chrome-text-dim)',
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-alt': 'var(--surface-alt)',
        border: 'var(--border)',
        'border-dark': 'var(--border-dark)',
        text: 'var(--text)',
        'text-dim': 'var(--text-dim)',
        sel: 'var(--sel)',
        'sel-soft': 'var(--sel-soft)',
        positive: 'var(--positive)',
        'positive-soft': 'var(--positive-soft)',
        warning: 'var(--warning)',
        'warning-soft': 'var(--warning-soft)',
        danger: 'var(--danger)',
        'danger-soft': 'var(--danger-soft)',
      },
      borderRadius: {
        DEFAULT: '6px',
      },
      boxShadow: {
        plate: 'var(--ombre-plate)',
        posee: 'var(--ombre-posee)',
        flottante: 'var(--ombre-flottante)',
        dominante: 'var(--ombre-dominante)',
        focus: 'var(--anneau-focus)',
      },
      transitionTimingFunction: {
        sortie: 'var(--t-sortie)',
        ressort: 'var(--t-ressort)',
        doux: 'var(--t-doux)',
      },
    },
  },
  plugins: [],
};
