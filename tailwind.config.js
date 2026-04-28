/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        // Все реальные значения приходят через CSS-переменные из темы
        bg: 'rgb(var(--theme-bg) / <alpha-value>)',
        surface: 'rgb(var(--theme-surface) / <alpha-value>)',
        'surface-alt': 'rgb(var(--theme-surface-alt) / <alpha-value>)',
        border: 'rgb(var(--theme-border) / <alpha-value>)',
        text: 'rgb(var(--theme-text) / <alpha-value>)',
        'text-dim': 'rgb(var(--theme-text-dim) / <alpha-value>)',
        accent: 'rgb(var(--theme-accent) / <alpha-value>)',
        'accent-hover': 'rgb(var(--theme-accent-hover) / <alpha-value>)',
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
        'pulse-subtle': 'pulseSubtle 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
    },
  },
  plugins: [],
};
