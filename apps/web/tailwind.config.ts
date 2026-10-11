import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fbf6ee',
          100: '#f3e6c8',
          200: '#e6c98a',
          300: '#d4a84a',
          400: '#c48a2a',
          500: '#b06f1c',
          600: '#955816',
          700: '#784616',
          800: '#623a18',
          900: '#523216',
        },
        ink: {
          900: '#120e0a',
          800: '#1c1610',
          700: '#2a2218',
          600: '#3a3024',
          500: '#5c5140',
          400: '#8a7d68',
          300: '#b7ad9a',
          200: '#ddd6c8',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
