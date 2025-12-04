/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyan: {
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
        },
        blue: {
          500: '#3b82f6',
        },
        purple: {
          100: '#e9d5ff',
          200: '#d8b4fe',
          400: '#a78bfa',
          500: '#8b5cf6',
        },
        pink: {
          500: '#ec4899',
        },
        zinc: {
          500: '#71717a',
          700: '#3f3f46',
          900: '#18181b',
        },
        green: {
          100: '#d1fae5',
          200: '#a7f3d0',
          400: '#34d399',
        },
        yellow: {
          100: '#fef3c7',
          200: '#fde68a',
        },
        red: {
          300: '#fca5a5',
          500: '#ef4444',
        },
      },
    },
  },
  plugins: [],
}
