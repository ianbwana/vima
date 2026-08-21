import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: '#FAF8F3',
          surface: '#FFFFFF',
          elevated: '#F1EFE6',
        },
        accent: {
          DEFAULT: '#C8F169',
          hover: '#B8E455',
          muted: 'rgba(200,241,105,0.16)',
        },
        success: {
          DEFAULT: '#3F7D20',
          muted: 'rgba(63,125,32,0.1)',
        },
        border: {
          DEFAULT: 'rgba(22,21,14,0.1)',
          subtle: 'rgba(22,21,14,0.06)',
        },
        text: {
          primary: '#16150E',
          secondary: '#6B6A5E',
          muted: '#9C9A88',
        },
        green: {
          DEFAULT: '#4B5A1F',
          light: '#C8F169',
        },
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        serif: ['Instrument Serif', 'Georgia', 'serif'],
      },
      fontWeight: {
        heading: '700',
        metric: '700',
      },
      borderRadius: {
        card: '16px',
      },
      keyframes: {
        'slide-in': {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
      animation: {
        'slide-in': 'slide-in 0.2s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
