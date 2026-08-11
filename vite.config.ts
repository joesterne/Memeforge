import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        includeAssets: ['mask-icon.svg', 'apple-touch-icon.png'],
        workbox: {
          globPatterns: ['**/*.{html,css,svg,png,webmanifest}'],
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.destination === 'script' || request.destination === 'worker',
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'memeforge-code-v1',
                expiration: { maxEntries: 30, maxAgeSeconds: 7 * 24 * 60 * 60 }
              }
            }
          ]
        },
        manifest: {
          name: 'Meme Maker App',
          short_name: 'Meme Maker',
          description: 'Create Epic Memes Together',
          theme_color: '#09090b',
          background_color: '#09090b',
          display: 'standalone',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        }
      })
    ],
    build: {
      target: 'esnext',
      minify: 'esbuild',
      cssMinify: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('/@firebase/firestore/') || id.includes('/firebase/firestore')) return 'vendor-firestore';
            if (id.includes('/@firebase/auth/') || id.includes('/firebase/auth')) return 'vendor-firebase-auth';
            if (id.includes('/@firebase/storage/') || id.includes('/firebase/storage')) return 'vendor-firebase-storage';
            if (id.includes('/@firebase/') || id.includes('/firebase/')) return 'vendor-firebase-core';
            if (/node_modules\/(react|react-dom|react-router|scheduler)\//.test(id)) return 'vendor-react';
            if (id.includes('/lucide-react/')) return 'vendor-icons';
            if (/node_modules\/(konva|react-konva|use-image)\//.test(id)) return 'vendor-canvas';
            return undefined;
          }
        }
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
});
