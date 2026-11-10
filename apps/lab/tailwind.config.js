import themePreset from '@menger/theme/tailwind-preset';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [themePreset],
  content: ['./index.html', './src/**/*.{ts,tsx}', '../../packages/theme/src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
