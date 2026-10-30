/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb', // Primary brand blue
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        cyan: {
          400: '#38bdf8',
          500: '#0ea5e9', // Secondary accent
          600: '#0284c7',
        },
        // Balanced Gray / Slate mapping:
        // Dark theme: 900 = main bg (#101827), 850 = secondary bg (#151F32), 800 = card bg (#1B273B), 700 = elevated (#243249), 600 = border (#334155)
        // Light theme: 50 = page bg (#F5F7FB), white = card bg (#FFFFFF), 200 = border (#E2E8F0), 900 = primary text (#172033)
        gray: {
          50: '#F5F7FB',  // Light page background
          100: '#EFF4FA', // Light subtle surface / hover
          200: '#E2E8F0', // Light border
          300: '#CBD5E1',
          400: '#94A3B8', // Muted text
          500: '#64748B', // Light secondary text
          600: '#475569',
          700: '#243249', // Dark elevated surface / modal
          800: '#1B273B', // Dark card surface
          850: '#151F32', // Dark secondary / sidebar
          900: '#101827', // Dark main page background
          950: '#0B111D',
        },
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
        'card-hover': '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
        'dark-card': '0 4px 20px -2px rgba(0, 0, 0, 0.35)',
        'glow-blue': '0 0 25px -5px rgba(37, 99, 235, 0.25)',
      },
    },
  },
  plugins: [],
};
