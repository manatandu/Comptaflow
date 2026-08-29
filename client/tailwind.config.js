/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Registre "logiciel professionnel dense" · police système Windows,
        // pas une police web moderne (voir le canevas Compta Flow validé).
        sans: ['"Segoe UI"', 'Tahoma', 'Geneva', 'Verdana', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', '"Courier New"', 'ui-monospace', 'monospace'],
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
        DEFAULT: '3px',
      },
      boxShadow: {
        posee: 'var(--ombre-posee)',
        flottante: 'var(--ombre-flottante)',
      },
    },
  },
  plugins: [],
};
