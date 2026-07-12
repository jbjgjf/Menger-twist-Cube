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
    rollupOptions: {
      output: {
        // cubing/search starts a module worker whose generated entry imports
        // shared cubing code. Keep that code out of the React application
        // entry; otherwise the worker also evaluates createRoot(document...),
        // which crashes before cubing can expose its search API.
        manualChunks(id) {
          if (id.includes('/node_modules/cubing/')) return 'cubing';
          return undefined;
        },
      },
    },
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
