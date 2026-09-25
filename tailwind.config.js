/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"DM Sans"', 'Arial', 'sans-serif'], signature: ['"Dancing Script"', 'cursive'] },
      colors: {
        // brand (links, primary actions): LAVA red by default, themeable per screen via --brand-* (see index.css)
        brand: Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((k) => [k, `rgb(var(--brand-${k}) / <alpha-value>)`])),
        // warm neutral grays (text, borders)
        ink: { 50: '#f8f6f6', 100: '#efeaea', 200: '#ded6d6', 300: '#beb3b3', 400: '#8f8484', 500: '#6f6464', 600: '#584d4d', 700: '#473c3c', 800: '#3a2e2e', 900: '#1c1414' },
      },
      boxShadow: { card: '0 1px 3px #2d0a0c1a', pop: '0 10px 30px #2d0a0c30' },
    },
  },
  plugins: [],
};
