/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      colors: {
        // ink/mist form the structural scale (surfaces, borders, text). Their
        // values are CSS custom properties in style.css so the whole app
        // repaints between dark and light without touching a single class —
        // see the `--ink-*` / `--mist-*` declarations there. ink-950 is the
        // one step left as a plain literal: it is always paired with a bright
        // accent bg (button text) or used as a scrim, neither of which should
        // flip with the theme.
        ink: {
          950: '#070A11',
          900: 'rgb(var(--ink-900) / <alpha-value>)',
          850: 'rgb(var(--ink-850) / <alpha-value>)',
          800: 'rgb(var(--ink-800) / <alpha-value>)',
          750: 'rgb(var(--ink-750) / <alpha-value>)',
          700: 'rgb(var(--ink-700) / <alpha-value>)',
          600: 'rgb(var(--ink-600) / <alpha-value>)',
          500: 'rgb(var(--ink-500) / <alpha-value>)',
        },
        mist: {
          500: 'rgb(var(--mist-500) / <alpha-value>)',
          400: 'rgb(var(--mist-400) / <alpha-value>)',
          300: 'rgb(var(--mist-300) / <alpha-value>)',
          200: 'rgb(var(--mist-200) / <alpha-value>)',
          100: 'rgb(var(--mist-100) / <alpha-value>)',
        },
        // RICE brand — navy blue, from the logo. General UI chrome: primary
        // buttons, links, focus rings, selection. 500/600 stay literal (the
        // vivid button/accent tier, meant to read the same in both themes);
        // 300/400/950 are text/tint tiers tuned per theme for contrast.
        brand: {
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: '#3E7CB8',
          600: '#2C5F91',
          950: 'rgb(var(--brand-950) / <alpha-value>)',
        },
        // Gonka / verification signal — teal. Used ONLY for truth-score surfaces.
        // 500/600 stay literal (they're the vivid button/accent tier, meant to
        // read the same in both themes); 300/400/950 are text/tint tiers tuned
        // per theme for contrast.
        gonka: {
          300: 'rgb(var(--gonka-300) / <alpha-value>)',
          400: 'rgb(var(--gonka-400) / <alpha-value>)',
          500: '#22C9A6',
          600: '#10A98A',
          950: 'rgb(var(--gonka-950) / <alpha-value>)',
        },
        // Sui / on-chain — indigo-violet. Used ONLY for blockchain surfaces.
        sui: {
          300: 'rgb(var(--sui-300) / <alpha-value>)',
          400: 'rgb(var(--sui-400) / <alpha-value>)',
          500: '#7C8AFF',
          600: '#5B68E8',
          950: 'rgb(var(--sui-950) / <alpha-value>)',
        },
        // Status vocabulary (claim/payment tones, truth-score bands). Only the
        // text-emphasis shades actually used in the app are re-pointed at CSS
        // vars; every other shade keeps Tailwind's default so low-opacity tint
        // backgrounds/borders are untouched.
        rose: { 200: 'rgb(var(--rose-200) / <alpha-value>)', 300: 'rgb(var(--rose-300) / <alpha-value>)' },
        amber: { 300: 'rgb(var(--amber-300) / <alpha-value>)' },
        emerald: { 300: 'rgb(var(--emerald-300) / <alpha-value>)' },
        sky: { 300: 'rgb(var(--sky-300) / <alpha-value>)' },
        violet: { 300: 'rgb(var(--violet-300) / <alpha-value>)' },
        cyan: { 300: 'rgb(var(--cyan-300) / <alpha-value>)' },
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
        glow: '0 0 0 1px rgba(62,124,184,.25), 0 0 32px -8px rgba(62,124,184,.35)',
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
