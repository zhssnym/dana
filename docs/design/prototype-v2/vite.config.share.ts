/*
The share build: `lab.html` alone, as one JavaScript file.

Separate from `vite.config.ts` because it needs the opposite of what a normal
build wants. A normal build splits shared code into chunks so a browser can
cache them across pages; this build has one page, is flattened into a single
file afterwards by `scripts/build-share.mjs`, and every chunk boundary it
creates is a file that cannot be inlined and so a page that opens blank.

Hence inlineDynamicImports, and hence unhashed asset names: the flattening
script has to find these files, and a hash it has to pattern-match for is a
hash that will one day not match.
*/

import path from "node:path"
import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const rootDirectory = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(rootDirectory, "./src"),
    },
  },
  build: {
    outDir:
      process.env.SHARE_ENTRY === "shell" ? "dist-share-shell" : "dist-share",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(rootDirectory, process.env.SHARE_ENTRY === "shell" ? "index.html" : "lab.html"),
      output: {
        inlineDynamicImports: true,
        entryFileNames: "assets/lab.js",
        chunkFileNames: "assets/lab-[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
})
