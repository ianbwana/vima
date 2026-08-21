import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: { DEFAULT: '#0F0F0F', surface: '#1A1A1A', elevated: '#222222' },
        accent: { DEFAULT: '#6366F1', hover: '#818CF8', muted: '#6366F11A' },
        success: { DEFAULT: '#4ADE80', muted: '#4ADE801A' },
        warning: { DEFAULT: '#FBBF24', muted: '#FBBF241A' },
        border: { DEFAULT: '#2A2A2A' },
        text: { primary: '#FFFFFF', secondary: '#A1A1AA', muted: '#71717A' },
      },
      fontWeight: { heading: '700' },
      borderRadius: { card: '12px' },
    },
  },
  plugins: [],
};

export default config;
