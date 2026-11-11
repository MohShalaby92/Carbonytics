/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      screens: {
        // em, not px: scales with the user's text-size setting so the full navbar only appears when it fits.
        nav: { raw: '(min-width: 68em)' },
      },
      colors: {
        // Verdant green scale — existing components using `primary-*` reskin to this.
        primary: {
          50: '#eef6f0',
          100: '#d6ebdd',
          200: '#aed8bd',
          300: '#7fbf96',
          400: '#4fa370',
          500: '#2f8a55',
          600: '#1f7347',
          700: '#1a5c3a',
          800: '#16482f',
          900: '#123a27',
        },
        forest: '#1f3d2b',
        // Semantic, theme-aware tokens (flip between Verdant light & Console dark)
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        card: 'rgb(var(--surface) / <alpha-value>)',
        fg: 'rgb(var(--fg) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        'line-strong': 'rgb(var(--line-strong) / <alpha-value>)',
        brand: 'rgb(var(--brand) / <alpha-value>)',
        'brand-fg': 'rgb(var(--brand-fg) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        ring: 'rgb(var(--ring) / <alpha-value>)',
        emphasis: 'rgb(var(--emphasis) / <alpha-value>)',
        positive: 'rgb(var(--positive) / <alpha-value>)',
        caution: 'rgb(var(--caution) / <alpha-value>)',
        critical: 'rgb(var(--critical) / <alpha-value>)',
        info: 'rgb(var(--info) / <alpha-value>)',
        'scope-1': 'rgb(var(--scope-1) / <alpha-value>)',
        'scope-2': 'rgb(var(--scope-2) / <alpha-value>)',
        'scope-3': 'rgb(var(--scope-3) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Hanken Grotesk', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Archivo', 'Archivo Fallback', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(16,24,20,0.04), 0 8px 24px -12px rgba(16,24,20,0.12)',
        lift: '0 12px 40px -16px rgba(16,24,20,0.28)',
      },
      ringColor: {
        DEFAULT: 'rgb(var(--ring) / 0.5)',
      },
    },
  },
  plugins: [],
};
