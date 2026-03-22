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
        mono: ['"JetBrains Mono"', '"SF Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        'surface': '#0a0a0a',
        'surface-raised': '#111111',
        'surface-overlay': '#161616',
        'surface-modal': '#0d0d0d',
        'border-subtle': 'rgba(255, 255, 255, 0.06)',
        'border-medium': 'rgba(255, 255, 255, 0.1)',
      },
      boxShadow: {
        'glow-sm': '0 0 10px rgba(245, 158, 11, 0.1)',
        'glow-md': '0 0 20px rgba(245, 158, 11, 0.15), 0 0 60px rgba(245, 158, 11, 0.05)',
        'glow-lg': '0 0 40px rgba(245, 158, 11, 0.2), 0 0 100px rgba(245, 158, 11, 0.1)',
        'panel': '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
      },
    },
  },
  plugins: [],
}
