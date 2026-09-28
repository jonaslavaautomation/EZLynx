/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"DM Sans"', 'Arial', 'sans-serif'], signature: ['"Dancing Script"', 'cursive'] },
      colors: {
        // brand (links, primary actions): charcoal gray by default, themeable per screen via --brand-* (see index.css)
        brand: Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((k) => [k, `rgb(var(--brand-${k}) / <alpha-value>)`])),
        // neutral grays (text, borders)
        ink: { 50: '#f8f9fa', 100: '#f0f1f3', 200: '#e0e3e7', 300: '#c3c8cf', 400: '#8f96a0', 500: '#6b727c', 600: '#555c66', 700: '#434952', 800: '#30353c', 900: '#1b1e22' },
      },
      boxShadow: { card: '0 1px 3px #0f172a1a', pop: '0 10px 30px #0f172a2e' },
    },
  },
  plugins: [],
};
