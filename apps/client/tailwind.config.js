/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    fontFamily: {
      mono: ['"JetBrains Mono"', 'monospace'],
    },
    extend: {
      colors: {
        'terminal-green': '#00ff41',
        'terminal-amber': '#ffb000',
        'terminal-red': '#ff3333',
        'surface': '#0a0a0a',
        'surface-raised': '#111111',
        'surface-overlay': '#1a1a1a',
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
        'pulse-dot': 'pulse-dot 1.4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'burst': 'burst 0.6s ease-out',
        'blink': 'blink 1s step-end infinite',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { transform: 'scale(0.95)', opacity: '1' },
          '50%': { transform: 'scale(1)', opacity: '0.7' },
          '100%': { transform: 'scale(0.95)', opacity: '1' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'burst': {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(1.5)', opacity: '0' },
        },
        'blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
    },
  },
  plugins: [],
}
