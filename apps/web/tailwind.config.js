/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#1e3a5f', light: '#2c5282', fixed: '#ebf4ff' },
        accent: { DEFAULT: '#b8860b', light: '#d4a843', fixed: '#fdf8ec' },
        surface: { DEFAULT: '#faf9f5', dim: '#f0eee6', high: '#ffffff' },
        bg: '#f5f4ed',
        border: { DEFAULT: '#e8e6dc', subtle: '#f0eee6' },
        text: { DEFAULT: '#1a1a19', secondary: '#4d4c48', tertiary: '#6b6962', muted: '#87867f', faint: '#b0aea5' },
        ring: '#d1cfc5',
        rush: { DEFAULT: '#c53030', fixed: '#fef2f2' },
        stable: { DEFAULT: '#2c5282', fixed: '#ebf4ff' },
        safe: { DEFAULT: '#276749', fixed: '#f0fff4' },
        elite: { DEFAULT: '#b8860b', fixed: '#fdf8ec' },
      },
      fontFamily: {
        serif: ['var(--font-serif)', 'Georgia', 'Noto Serif SC', 'SimSun', 'serif'],
        sans: ['var(--font-sans)', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
      },
      borderRadius: {
        sm: '6px',
        DEFAULT: '8px',
        lg: '10px',
        xl: '12px',
        full: '999px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(26,26,25,0.04)',
        'card-hover': '0 20px 40px rgba(26,26,25,0.06)',
        'glow-primary': '0 8px 24px rgba(30,58,95,0.18)',
        'glow-primary-lg': '0 12px 32px rgba(30,58,95,0.25)',
        'glow-accent': '0 8px 24px rgba(184,134,11,0.2)',
        nav: '0 1px 0 #e8e6dc',
        ring: '0 0 0 1px #e8e6dc',
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false,
  },
};
