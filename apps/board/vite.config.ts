import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Connect, type ViteDevServer } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const fontSrc = path.resolve(here, '../../node_modules/@excalidraw/excalidraw/dist/prod/fonts');

function excalidrawFonts() {
  return {
    name: 'excalidraw-fonts',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/board-app/fonts', ((req, res, next) => {
        const rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '');
        const file = path.resolve(fontSrc, rel);
        if (!file.startsWith(fontSrc) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
          next();
          return;
        }
        res.setHeader('Content-Type', file.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream');
        fs.createReadStream(file).pipe(res);
      }) as Connect.NextHandleFunction);
    },
  };
}

export default defineConfig({
  base: '/board-app/',
  plugins: [react(), excalidrawFonts()],
  define: {
    'process.env.IS_PREACT': JSON.stringify(false),
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/app': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    outDir: '../web/public/board-app',
    emptyOutDir: true,
  },
});
