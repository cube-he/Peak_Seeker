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
        // Primary
        'primary': {
          DEFAULT: '#003fb1',
          container: '#1a56db',
          fixed: '#dbe1ff',
          'fixed-dim': '#b5c4ff',
        },
        'on-primary': '#ffffff',
        'on-primary-container': '#d4dcff',
        'on-primary-fixed': '#00174d',
        'on-primary-fixed-variant': '#003dab',

        // Secondary (AI Engine)
        'secondary': {
          DEFAULT: '#006973',
          container: '#85efff',
          fixed: '#92f1ff',
          'fixed-dim': '#6ad6e5',
        },
        'on-secondary': '#ffffff',
        'on-secondary-container': '#006d78',
        'on-secondary-fixed': '#001f23',
        'on-secondary-fixed-variant': '#004f57',

        // Tertiary (Elite/Gold)
        'tertiary': {
          DEFAULT: '#723b00',
          container: '#954f00',
          fixed: '#ffdcc3',
          'fixed-dim': '#ffb77d',
        },
        'on-tertiary': '#ffffff',
        'on-tertiary-container': '#ffd5b6',
        'on-tertiary-fixed': '#2f1500',
        'on-tertiary-fixed-variant': '#6e3900',

        // Error/Risk
        'error': {
          DEFAULT: '#ba1a1a',
          container: '#ffdad6',
        },
        'on-error': '#ffffff',
        'on-error-container': '#93000a',

        // Surface System
        'surface': {
          DEFAULT: '#faf8ff',
          dim: '#d9d9e4',
          bright: '#faf8ff',
          tint: '#1353d8',
          variant: '#e2e1ed',
          'container-lowest': '#ffffff',
          'container-low': '#f3f3fe',
          container: '#ededf8',
          'container-high': '#e7e7f3',
          'container-highest': '#e2e1ed',
        },
        'on-surface': '#191b23',
        'on-surface-variant': '#434654',

        // Inverse
        'inverse-surface': '#2e3039',
        'inverse-on-surface': '#f0f0fb',
        'inverse-primary': '#b5c4ff',

        // Outline
        'outline': {
          DEFAULT: '#737686',
          variant: '#c3c5d7',
        },

        // Background
        'background': '#faf8ff',
        'on-background': '#191b23',
      },
      fontFamily: {
        headline: ['var(--font-headline)', 'Inter', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
        body: ['var(--font-body)', 'Inter', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
        label: ['var(--font-body)', 'Inter', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
        full: '9999px',
      },
      boxShadow: {
        'ambient': '0 20px 40px rgba(25, 27, 35, 0.06)',
        'ambient-sm': '0 4px 12px rgba(25, 27, 35, 0.04)',
        'glow-primary': '0 8px 24px rgba(0, 63, 177, 0.2)',
        'glow-primary-lg': '0 12px 32px rgba(0, 63, 177, 0.3)',
        'card': '0 1px 3px rgba(25, 27, 35, 0.04)',
        'card-hover': '0 20px 40px rgba(25, 27, 35, 0.08)',
        'nav': '0 1px 3px rgba(25, 27, 35, 0.03)',
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false,
  },
};
