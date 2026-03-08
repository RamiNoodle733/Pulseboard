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
      animation: {
        'pulse-dot': 'pulse-dot 1.4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'burst': 'burst 0.8s ease-out',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'burst': {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(1.5)', opacity: '0' },
        },
      },
    },
  },
  plugins: [],
}
