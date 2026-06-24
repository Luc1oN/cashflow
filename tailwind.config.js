/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '.midnight'],
  theme: {
    extend: {
      colors: {
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-strong': 'rgb(var(--accent-strong) / <alpha-value>)',
        'accent-soft': 'rgb(var(--accent-soft) / <alpha-value>)',
        'on-accent': 'rgb(var(--on-accent) / <alpha-value>)',
        paper: 'rgb(var(--paper) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        slate2: 'rgb(var(--slate2) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        mist: 'rgb(var(--mist) / <alpha-value>)',
        moss: 'rgb(var(--moss) / <alpha-value>)',
        mossdeep: 'rgb(var(--mossdeep) / <alpha-value>)',
        amber2: 'rgb(var(--amber2) / <alpha-value>)',
        claret: 'rgb(var(--claret) / <alpha-value>)',
        violet: 'rgb(var(--violet) / <alpha-value>)',
      },
      fontFamily: {
        display: ['Geist', 'system-ui', 'sans-serif'],
        body: ['Geist', 'system-ui', 'sans-serif'],
        num: ['"Geist Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(var(--shadow) / 0.06), 0 4px 16px rgb(var(--shadow) / 0.05)',
      },
      keyframes: {
        rise: { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        toastIn: { from: { opacity: '0', transform: 'translateY(8px) scale(0.98)' }, to: { opacity: '1', transform: 'translateY(0) scale(1)' } },
      },
      animation: {
        rise: 'rise 0.35s ease-out both',
        toastIn: 'toastIn 0.2s ease-out both',
      },
    },
  },
  plugins: [],
}
