import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: '#141414',
          surface: '#1E1E1E',
          elevated: '#252525',
        },
        accent: {
          DEFAULT: '#FF6B3D',
          hover: '#FF8A63',
          muted: '#FF6B3D1A',
        },
        success: {
          DEFAULT: '#4ADE80',
          muted: '#4ADE801A',
        },
        border: {
          DEFAULT: '#2A2A2A',
          subtle: '#1F1F1F',
        },
        text: {
          primary: '#FFFFFF',
          secondary: '#A1A1AA',
          muted: '#71717A',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      fontWeight: {
        heading: '700',
        metric: '700',
      },
      borderRadius: {
        card: '12px',
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
