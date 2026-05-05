/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'brand-blue': '#0066FF',
        'brand-dark': '#0E141C',
        'bright-pink': '#FF7DD3',
        'gray-1': '#525252',
        'gray-2': '#999999',
        'gray-3': '#F0F0F0',
      },
      fontFamily: {
        sans: ['Manrope', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      fontSize: {
        'h1': ['32px', '110%'],
        'h2': ['24px', '110%'],
        'h3': ['20px', '110%'],
        'h4': ['16px', '110%'],
        'body': ['14px', '140%'],
        'cta': ['16px', '120%'],
      },
      borderRadius: {
        'none': '0',
        'sm': '0.125rem',
        DEFAULT: '0.25rem',
        'md': '0.375rem',
        'lg': '0.5rem',
        'xl': '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
        'full': '9999px',
      }
    },
  },
  plugins: [],
}
