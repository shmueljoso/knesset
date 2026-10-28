import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  base: './',
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // הרישום נעשה ידנית ב-main.tsx, רק בדפדפן (לא בתוך אפליקציית האנדרואיד)
      injectRegister: null,
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] },
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'המשכן – סימולטור פוליטי',
        short_name: 'המשכן',
        description: 'סימולטור קריירה פוליטית בכנסת',
        lang: 'he',
        dir: 'rtl',
        theme_color: '#0f1b2d',
        background_color: '#0f1b2d',
        display: 'standalone',
        orientation: 'any',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
