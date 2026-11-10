// Shared Tailwind preset: one neutral grey scale, one accent, light + dark.
//
// Existing `slate-*` / `cyan-*` / `white` utilities keep working, but resolve
// to CSS variables, so every screen follows the user's theme without edits.
//   slate  -> neutral greys (Apple-style), inverted in light mode
//   cyan   -> the user's accent (written at runtime by @menger/theme)
//   amber, rose, emerald, sky -> semantic colours, re-tuned for light mode
import plugin from 'tailwindcss/plugin';
import colors from 'tailwindcss/colors';

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

const slateDark = {
  50: '#f5f5f7', 100: '#f5f5f7', 200: '#e5e5ea', 300: '#c7c7cc', 400: '#a1a1a6', 500: '#8e8e93',
  600: '#48484a', 700: '#38383a', 800: '#2c2c2e', 900: '#1c1c1e', 950: '#000000',
};
const slateLight = {
  50: '#000000', 100: '#1d1d1f', 200: '#3a3a3c', 300: '#515154', 400: '#6e6e73', 500: '#86868b',
  600: '#c7c7cc', 700: '#d2d2d7', 800: '#e8e8ed', 900: '#ffffff', 950: '#f5f5f7',
};

const semantic = ['amber', 'rose', 'emerald', 'sky'];

const channels = (hex) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
};

const scale = (name) =>
  Object.fromEntries(STEPS.map((step) => [step, `rgb(var(--${name}-${step}) / <alpha-value>)`]));

const variables = (mode) => {
  const vars = {};
  const slate = mode === 'dark' ? slateDark : slateLight;
  for (const step of STEPS) {
    vars[`--slate-${step}`] = channels(slate[step]);
    // Light mode reads each semantic scale back to front, so a "300" text
    // colour stays legible on a white surface.
    for (const name of semantic) {
      const source = mode === 'dark' ? step : 1000 - step;
      vars[`--${name}-${step}`] = channels(colors[name][source]);
    }
  }
  vars['--white'] = channels(slate[100]);
  return vars;
};

export default {
  theme: {
    extend: {
      colors: {
        white: 'rgb(var(--white) / <alpha-value>)',
        slate: scale('slate'),
        cyan: scale('accent'),
        ...Object.fromEntries(semantic.map((name) => [name, scale(name)])),
      },
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"SF Pro Display"',
          'Inter', 'system-ui', '"Segoe UI"', 'sans-serif',
        ],
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      const dark = variables('dark');
      const light = variables('light');
      // Accent defaults (a neutral blue) so pages never render unthemed before
      // the runtime writes the chosen accent.
      for (const step of STEPS) dark[`--accent-${step}`] = channels(colors.blue[step]);
      addBase({
        ':root': { ...dark, colorScheme: 'dark' },
        ":root[data-theme='dark']": { colorScheme: 'dark' },
        ":root[data-theme='light']": { ...light, colorScheme: 'light' },
        '@media (prefers-color-scheme: light)': {
          ':root:not([data-theme])': { ...light, colorScheme: 'light' },
        },
        'html, body, #root': { margin: '0', minHeight: '100%' },
        body: {
          backgroundColor: 'rgb(var(--slate-950))',
          color: 'rgb(var(--slate-100))',
          '-webkit-font-smoothing': 'antialiased',
          '-moz-osx-font-smoothing': 'grayscale',
          'text-rendering': 'optimizeLegibility',
        },
        '::selection': { backgroundColor: 'rgb(var(--accent-500) / 0.35)' },
      });
    }),
  ],
};
