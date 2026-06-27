import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
  },
  esbuild: {
    target: 'esnext',
  },
  optimizeDeps: {
    // cubing ships WASM/top-level-await internals that don't survive
    // esbuild pre-bundling. The @menger/* workspace packages are excluded
    // too so Vite treats their TS source as part of this app rather than
    // trying to pre-bundle them as opaque dependencies.
    exclude: ['cubing', 'cubing/kpuzzle', 'cubing/puzzles', 'cubing/search', '@menger/engine', '@menger/solver-core'],
    esbuildOptions: {
      target: 'esnext',
    },
  },
});
