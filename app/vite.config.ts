import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Tailwind 4 is configured in CSS, not in JavaScript (spec 11.4, and 11.15
  // records v3 configuration idioms as defects): this plugin is the whole of
  // its build-side wiring, and there is no tailwind.config.js to add. What it
  // compiles is the single token file of 11.4,
  // src/client/styles/tokens.css, whose @theme variables are the only place
  // raw color, type, spacing, and radius values may appear. That file has one
  // owner, the Component and Design System role, and arrives with its
  // session; the plugin lands here first because nothing it writes renders
  // without this line.
  plugins: [
    react(),
    tailwindcss(),
    // The 10.6 PWA layer, 11.4's named plugin, requested verbatim by the
    // Frontend Architect in src/server/routes/README.md and executed here
    // because this file is Platform's. Six values below are load-bearing and
    // each was measured rather than chosen; the rest are the plugin's
    // defaults spelled out, so a later reader need not know which is which.
    VitePWA({
      // 10.6's update rule is "no forced reload", so the person is prompted
      // and the client owns the prompt (src/client/pwa/).
      registerType: 'prompt',
      // The client registers /sw.js itself in
      // src/client/pwa/registerServiceWorker.ts. Left at its default the
      // plugin injects a second registration into the built HTML, and only
      // one of the two can raise the update prompt.
      injectRegister: null,
      manifest: {
        name: 'Dana',
        short_name: 'Dana',
        display: 'standalone',
        start_url: '/app',
        scope: '/',
        theme_color: '#1f2933',
        background_color: '#ffffff',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        // Without this no worker controls the page that registered it until a
        // second navigation, so navigator.serviceWorker.controller is null
        // for the whole of a first visit. That is the precondition AC-091,
        // AC-100 and AC-160 each assert before anything else, so its absence
        // fails every PWA criterion on one line that names nothing.
        clientsClaim: true,
        // 10.6's no-forced-reload rule, and the plugin's default under
        // registerType: 'prompt'. Spelled out because it sits beside
        // clientsClaim and the pair is one decision: the first worker claims
        // immediately, every later one waits for the person. Claiming does
        // not activate a waiting worker, so the two do not fight.
        skipWaiting: false,
        // Workbox defaults this to 'index.html', which makes a request for /
        // match the precached /index.html through the precache route rather
        // than through the navigation fallback, bypassing the allowlist below
        // and opening the application shell offline at the origin. That is
        // AC-160's second half, and it fails while everything else still
        // passes, so the red points nowhere near the cause.
        directoryIndex: null,
        navigateFallback: 'index.html',
        // 9.1's closing sentence: every /app path falls back to the cached
        // shell per 10.6, and / does not. A fallback registered at the origin
        // catches / too, and an offline visitor who has been here once then
        // lands on a signed-out application instead of the public page 9.2
        // wrote for them.
        navigateFallbackAllowlist: [/^\/app(\/|$)/],
        // 10.6 makes API requests network-only and never cached.
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  // The two manifest icons live inside the client's owned paths, at
  // src/client/public/. Vite's default, app/public/, is a directory no
  // persona owns. They are placeholders and are design's to replace (11.13).
  publicDir: 'src/client/public',
  build: {
    outDir: 'dist/client',
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
