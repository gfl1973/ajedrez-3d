import { defineConfig } from 'vite';

// base relativa: el build funciona desde cualquier subcarpeta (GitHub Pages, servidor estático…)
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    rollupOptions: { output: { manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined) } },
  },
  worker: { format: 'es' },
  server: { host: true },
});
