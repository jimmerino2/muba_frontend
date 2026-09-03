/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#070A11',
          900: '#0A0E17',
          850: '#0E131F',
          800: '#121826',
          750: '#171E2E',
          700: '#1D2537',
          600: '#2A344A',
          500: '#3C4860',
        },
        mist: {
          500: '#6B7891',
          400: '#8B98B0',
          300: '#AEB9CD',
          200: '#D2DAE8',
          100: '#EDF1F8',
        },
        // Gonka / verification signal — teal. Used ONLY for truth-score surfaces.
        gonka: {
          300: '#7DEDD4',
          400: '#4FE3C1',
          500: '#22C9A6',
          600: '#10A98A',
          950: '#062B26',
        },
        // Sui / on-chain — indigo-violet. Used ONLY for blockchain surfaces.
        sui: {
          300: '#C2C9FF',
          400: '#9AA6FF',
          500: '#7C8AFF',
          600: '#5B68E8',
          950: '#141838',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        lift: '0 1px 2px rgba(0,0,0,.4), 0 8px 24px -12px rgba(0,0,0,.6)',
        glow: '0 0 0 1px rgba(34,201,166,.25), 0 0 32px -8px rgba(34,201,166,.35)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'score-in': { '0%': { opacity: '0', transform: 'scale(.94)' }, '100%': { opacity: '1', transform: 'none' } },
      },
      animation: {
        'fade-up': 'fade-up .35s cubic-bezier(.16,1,.3,1) both',
        shimmer: 'shimmer 1.6s infinite',
        'score-in': 'score-in .5s cubic-bezier(.16,1,.3,1) both',
      },
    },
  },
  plugins: [],
}
