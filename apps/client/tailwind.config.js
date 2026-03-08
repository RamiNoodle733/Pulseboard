/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        'surface': '#0a0a0a',
        'surface-raised': '#111111',
        'surface-overlay': '#1a1a1a',
      },
    },
  },
  plugins: [],
}
