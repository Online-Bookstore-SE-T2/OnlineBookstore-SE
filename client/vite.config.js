import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The browser talks only to the API tier (SRS 2.1); in development Vite forwards /api to it.
    proxy: { '/api': 'http://localhost:5000' },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/main.jsx', 'src/test/**', 'src/**/*.test.{js,jsx}'],
    },
  },
});
