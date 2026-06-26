/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="midnight"]'],
  theme: {
    extend: {
      screens: {
        rail: '860px',
        full: '1140px',
      },
      colors: {
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-strong': 'rgb(var(--accent-strong) / <alpha-value>)',
        'accent-soft': 'rgb(var(--accent-soft) / <alpha-value>)',
        'on-accent': 'rgb(var(--on-accent) / <alpha-value>)',
        accent2: 'rgb(var(--accent2) / <alpha-value>)',
        paper: 'rgb(var(--paper) / <alpha-value>)',
        bg2: 'rgb(var(--bg2) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        surface2: 'rgb(var(--surface2) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        text2: 'rgb(var(--text2) / <alpha-value>)',
        slate2: 'rgb(var(--slate2) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        border2: 'rgb(var(--border2) / <alpha-value>)',
        grid: 'rgb(var(--grid) / <alpha-value>)',
        mist: 'rgb(var(--mist) / <alpha-value>)',
        chip: 'rgb(var(--chip) / <alpha-value>)',
        'chip-text': 'rgb(var(--chip-text) / <alpha-value>)',
        moss: 'rgb(var(--moss) / <alpha-value>)',
        mossdeep: 'rgb(var(--mossdeep) / <alpha-value>)',
        pos: 'rgb(var(--pos) / <alpha-value>)',
        neg: 'rgb(var(--neg) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
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
        card: 'var(--card-shadow)',
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
