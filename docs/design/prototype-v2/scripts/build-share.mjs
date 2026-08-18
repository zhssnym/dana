/*
Flatten the built row lab into one self-contained HTML file.

Why this exists: the lab is shared with people who are not running a dev
server, and the places it gets shared to refuse every external request a page
makes — no CDN, no sibling .js or .css, no font file fetched from a relative
path. A normal Vite build is four files that reference each other, so it shows
those people a blank page.

So: read `dist/lab.html`, pull the script and the stylesheet in as inline
text, and turn the one font the page actually needs into a data URI. What
comes out is a single file that opens from anywhere, including a double-click
from a downloads folder.

Two details worth knowing rather than rediscovering.

- Only the Latin subset of Inter is inlined. @fontsource ships eight subsets
  and the other seven are Cyrillic, Greek and Vietnamese, which this page does
  not contain a character of; inlining them all would add about 200KB of
  base64 to a file whose whole point is to open quickly on somebody else's
  connection. If the sample tasks ever stop being English, this is the line
  that has to change.
- The output carries no <html>, <head> or <body>. That is not an oversight: it
  is what the publishing target wraps around it, and a second <body> tag here
  is a page that renders twice.

Run it as: npm run build:share
*/

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const dist = path.join(root, "dist-share")
const outFile = path.join(
  dist,
  process.env.SHARE_ENTRY === "shell" ? "dana-prototype.html" : "dana-row-concepts.html",
)

function read(file) {
  return fs.readFileSync(file, "utf8")
}

const entry = process.env.SHARE_ENTRY === "shell" ? "index.html" : "lab.html"
const html = read(path.join(dist, entry))

/* Vite emits <script type="module" crossorigin src="/assets/x.js"> and
   <link rel="stylesheet" crossorigin href="/assets/y.css">. Take the paths
   from the markup rather than guessing at the hashed filenames. */
const scriptSrc = html.match(/<script[^>]+src="([^"]+)"/)?.[1]
const styleHref = html.match(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/)?.[1]

if (!scriptSrc || !styleHref) {
  throw new Error(
    "Could not find the built script or stylesheet in dist/lab.html. " +
      "Run `vite build --config vite.config.share.ts` first.",
  )
}

const assetPath = (url) => path.join(dist, url.replace(/^\//, ""))

let css = read(assetPath(styleHref))
const js = read(assetPath(scriptSrc))

/* Inline the Latin Inter face and drop every other @font-face rule, so the
   page keeps its typeface without asking the network for anything. */
const latin = fs
  .readdirSync(path.join(dist, "assets"))
  .find((f) => /inter-latin-wght-normal.*\.woff2$/.test(f))

if (!latin) {
  throw new Error("Could not find the Latin Inter woff2 in dist/assets.")
}

const latinData = fs
  .readFileSync(path.join(dist, "assets", latin))
  .toString("base64")

let inlined = 0
css = css.replace(/@font-face\s*{[^}]*}/g, (rule) => {
  if (!rule.includes(latin)) return "" // a subset this page never renders
  inlined += 1
  return rule.replace(
    /url\([^)]+\)/,
    `url(data:font/woff2;base64,${latinData})`,
  )
})

if (inlined !== 1) {
  throw new Error(`Expected to inline exactly one @font-face, got ${inlined}.`)
}

/* Any asset URL still pointing at a sibling file would silently 404 in the
   shared page, so fail loudly here instead. */
const leftover = css.match(/url\(\/assets\/[^)]+\)/g)
if (leftover) {
  throw new Error(`Stylesheet still references files: ${leftover.join(", ")}`)
}

const out = `<title>${process.env.SHARE_ENTRY === "shell" ? "Dana prototype" : "Dana row concepts"}</title>
<style>
${css}
</style>
<div id="root"></div>
<script type="module">
${js}
</script>
`

fs.writeFileSync(outFile, out, "utf8")

const kb = (n) => `${Math.round(n / 1024)}KB`
console.log(`Wrote ${path.relative(root, outFile)} — ${kb(out.length)}`)
console.log(`  stylesheet ${kb(css.length)} (Inter Latin inlined)`)
console.log(`  script     ${kb(js.length)}`)
