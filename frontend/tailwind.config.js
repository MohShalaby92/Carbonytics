/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
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
        brand: 'rgb(var(--brand) / <alpha-value>)',
        'brand-fg': 'rgb(var(--brand-fg) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Hanken Grotesk', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
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
