import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@shared': path.resolve(__dirname, 'src/shared') },
  },
  server: {
    // AI Studio: HMR pode ser desligado via variável de ambiente.
    hmr: process.env.DISABLE_HMR !== 'true',
  },
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      // PDF, QR e CSV só entram nos pedaços das telas que os usam
      treeshake: {
        moduleSideEffects: (id: string) => !/node_modules\/(jspdf|jspdf-autotable|papaparse|qrcode|html2canvas|dompurify|canvg|fflate|pako)\//.test(id),
      },
    },
  },
}));
