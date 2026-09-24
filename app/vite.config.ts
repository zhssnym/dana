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
    // The 10.6 PWA layer, 11.4's named plugin. Each load-bearing value below
    // carries its reason beside it.
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
        /*
        The design's proposal, from section 08 of
        docs/design/visual-foundation.html, replacing a value that was the
        placeholder token file's and outlived it: theme_color read #1f2933,
        which was the old --color-text and is a colour the design no longer
        contains. That document is deleted (`a7886df`, 2026-09-01) and is in
        git history before that commit.

        Both rest on DES-029, approved during the design sign-off. They are
        settled values rather than an open proposal.

        Both equal --bg in styles/tokens.css (light). A manifest is built and
        cannot read a stylesheet, so a change to --bg moves these too.
        */
        theme_color: '#ffffff',
        background_color: '#ffffff',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        /*
        The application chunk is over workbox's 2 MiB default, and the
        default's failure mode is the wrong one for 10.6.

        That section requires a precached application shell, and the
        criteria read it: AC-091 opens /app with the network disabled and
        expects the shell, and AC-160 and AC-100 stand on the same
        precondition. Left at the default, the build either fails or ships a
        worker that precaches everything except the one file the shell is,
        which is an offline shell that white-screens.

        So the cap is raised to keep the shell precached. It is not a fix
        for the size: the build warns about a chunk over 500 kB, and the
        answer is code splitting, which changes what loads when and should be
        done where it can be measured.
        */
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
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
