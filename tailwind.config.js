/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"DM Sans"', 'Arial', 'sans-serif'] },
      colors: {
        // brand red (links, primary actions)
        brand: { 50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5', 400: '#f87171', 500: '#dc2626', 600: '#b91c1c', 700: '#991b1b', 800: '#7f1d1d', 900: '#651414' },
        // warm neutral grays (text, borders)
        ink: { 50: '#f8f6f6', 100: '#efeaea', 200: '#ded6d6', 300: '#beb3b3', 400: '#8f8484', 500: '#6f6464', 600: '#584d4d', 700: '#473c3c', 800: '#3a2e2e', 900: '#1c1414' },
      },
      boxShadow: { card: '0 1px 3px #2d0a0c1a', pop: '0 10px 30px #2d0a0c30' },
    },
  },
  plugins: [],
};
