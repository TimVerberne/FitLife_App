import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const base = process.env.VITE_BASE_PATH || '/';
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    // Conservative target so older/mobile browser JS engines can parse the
    // bundle instead of failing silently on newer syntax.
    target: 'es2018',
  },
  plugins: [
    react(),
    VitePWA({
      // Switched from the default generateSW (a fully auto-generated worker)
      // to injectManifest so src/sw.ts can add its own push/notificationclick
      // handlers for the workout-nudge feature, alongside the same
      // precaching + runtime-caching rules generateSW used to configure via
      // the `workbox` option below — those now live directly in src/sw.ts.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      // We register the service worker ourselves (src/lib/swUpdate.ts) instead
      // of using the plugin's auto-injected registration script, so that a
      // newly-activated service worker doesn't trigger an unconditional
      // window.location.reload() — which, mid-workout, would silently discard
      // the in-progress session (it only exists in memory until finished).
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'FitFlow',
        short_name: 'FitFlow',
        description: 'Log workouts, build routines, and track progress with your training crew.',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,svg,png}'],
      },
    }),
  ],
})
