import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Project-page path on GitHub Pages (https://<user>.github.io/planit/).
// Overridable so a Docker/Pi build can still serve from the domain root.
const base = process.env.VITE_BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
});
