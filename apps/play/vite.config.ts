import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), 'index.html'),
        keyboard: resolve(process.cwd(), 'keyboard.html'),
      },
    },
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
