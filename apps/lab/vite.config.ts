import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/lab/',
  plugins: [react()],
  // Pinned so it never collides with the Play app's dev server (port 5173)
  // when both are running locally side by side.
  server: {
    port: 5175,
  },
  build: {
    target: 'esnext',
  },
  esbuild: {
    target: 'esnext',
  },
  optimizeDeps: {
    exclude: ['cubing', 'cubing/kpuzzle', 'cubing/puzzles', 'cubing/search', '@menger/engine', '@menger/solver-core'],
    esbuildOptions: {
      target: 'esnext',
    },
  },
});
