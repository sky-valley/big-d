import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#fafaf7',
        ink: '#1a1a1a',
        muted: '#737368',
        codebg: '#efece4',
        divider: '#e8e4d8',
        accent: {
          DEFAULT: '#b9521e',
          hover: '#9a4317',
          soft: '#f4e7dd',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'ui-sans-serif', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        serif: ['var(--font-serif)', 'ui-serif', 'Georgia', 'serif'],
      },
      letterSpacing: {
        tighter: '-0.04em',
      },
      animation: {
        'pulse-slow': 'pulseSlow 2.4s ease-in-out infinite',
        'fade-in': 'fadeIn 0.4s ease-out forwards',
      },
      keyframes: {
        pulseSlow: {
          '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.15)' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
