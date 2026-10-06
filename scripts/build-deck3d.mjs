// Đóng gói shared/deck/deck3d.js (three.js, tree-shaking) thành 1 tệp IIFE: dist/deck-runtime/deck3d.js.
// Chạy sau `vite build` (npm run build) — renderService đọc tệp này để nhúng vào bài trình bày có hiệu ứng 3D.
import { build } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
await build({
  configFile: false,
  root,
  logLevel: 'warn',
  envDir: 'scripts', // không đọc .env của dự án
  build: {
    outDir: 'dist/deck-runtime',
    emptyOutDir: true,
    minify: true,
    sourcemap: false,
    lib: { entry: 'shared/deck/deck3d-entry.js', formats: ['iife'], name: 'Deck3DBundle', fileName: () => 'deck3d.js' },
  },
});
console.log('deck3d → dist/deck-runtime/deck3d.js');
