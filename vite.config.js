// Vite: giao diện Vue 3 + Tailwind v4 (MDS 2.0). Dev proxy /api và /deck-assets sang API (cổng 3000).
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: 'frontend',
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./frontend/src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000', '/deck-assets': 'http://localhost:3000' },
  },
  build: { outDir: '../dist', emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 900 },
});
