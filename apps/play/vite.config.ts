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
    exclude: ['cubing', 'cubing/kpuzzle', 'cubing/puzzles', 'cubing/search'],
    esbuildOptions: {
      target: 'esnext',
    },
  },
});
