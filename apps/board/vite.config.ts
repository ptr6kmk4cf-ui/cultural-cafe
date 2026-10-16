import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/board-app/',
  plugins: [react()],
  define: {
    'process.env.IS_PREACT': JSON.stringify(false),
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3000',
      '/app': 'http://localhost:3000',
    },
  },
  build: {
    outDir: '../web/public/board-app',
    emptyOutDir: true,
  },
});
