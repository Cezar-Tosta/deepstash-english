import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  // Caminhos relativos: o build funciona em qualquer host estático ou subpasta.
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Deepstash English Study System',
        short_name: 'DS English',
        description: 'Método 5 → 1 → 3 → 1 para estudar inglês com os cards do Deepstash.',
        lang: 'pt-BR',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f6f4ef',
        theme_color: '#2f5f6b',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  test: {
    environment: 'node',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
});
