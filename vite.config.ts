import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

// GitHub Pages project site is served from /warpedLB/
const BASE = '/warpedLB/';

// Build stamp shown in About + the update toast so "did the update land?" is
// answerable on a phone over flaky festival Wi-Fi.
function buildHash(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  base: BASE,
  define: {
    __BUILD_HASH__: JSON.stringify(buildHash()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null, // we register manually in src/pwa.ts
      includeAssets: [
        'icons/apple-touch-icon-180.png',
        'icons/favicon.svg',
        'map/festival-map.webp',
      ],
      manifest: {
        id: BASE,
        name: 'Warped LB Companion (Unofficial)',
        short_name: 'Warped LB',
        description:
          'Unofficial offline planner for Vans Warped Tour Long Beach 2026. Pick bands, spot clashes, share plans by code. Everything stays on your phone.',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0b2f6b',
        theme_color: '#0b2f6b',
        categories: ['music', 'lifestyle', 'travel'],
        icons: [
          { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Every cache name is namespaced to this app. GitHub Pages serves both
        // this app and its private sibling from the same origin, and origin —
        // not path — is the Cache Storage boundary, so a shared name would let
        // the two installs overwrite each other on one phone.
        cacheId: 'warpedlb-public',
        // Precache the entire built app shell + all static assets (js/css/html/img/fonts).
        globPatterns: ['**/*.{js,css,html,webp,png,svg,woff,woff2,ico,json,webmanifest}'],
        // iOS fetches launch images itself at Add-to-Home-Screen time; they're
        // never requested by the app, so keep them out of the offline precache.
        globIgnores: ['**/art/splash/**'],
        // The festival map is large; make sure it is precached.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/, /\/[^/?]+\.[^/]+$/],
        clientsClaim: true,
        skipWaiting: false,
        runtimeCaching: [
          {
            // Any GET under our own base path that we didn't precache: cache-first.
            // Scoped to BASE rather than the whole origin so this app never
            // caches the sibling app's assets (same origin, different path).
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith(BASE),
            handler: 'CacheFirst',
            options: {
              cacheName: 'warpedlb-public-runtime',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false, // SW only in production build (avoids dev caching headaches)
      },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
