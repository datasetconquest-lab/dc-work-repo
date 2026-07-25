/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dark theme is tuned to the brand logo background (#00020e).
        // gray-900 = app/page background (exact logo color),
        // gray-800 = cards/surfaces, gray-700 = inputs/raised surfaces.
        // These shades double as near-black text colors in light mode.
        gray: {
          700: '#11182e',
          800: '#080c1c',
          900: '#00020e',
        },
      },
    },
  },
  plugins: [],
};
