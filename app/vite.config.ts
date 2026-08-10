import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

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
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist/client',
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
