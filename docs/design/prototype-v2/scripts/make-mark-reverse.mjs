import fs from "node:fs"

/* The reversed mark is the original with its two fills swapped and nothing
   else touched, generated rather than hand-authored so the geometry cannot
   drift from the file it came from. */
const srcPath = "public/dana-mark.svg"
const outPath = "public/dana-mark-reverse.svg"

const src = fs.readFileSync(srcPath, "utf8")

const PLATE = ".fil0 {fill:#0A0A0A}"
const GLYPH = ".fil1 {fill:#FFFFFF}"
for (const rule of [PLATE, GLYPH]) {
  if (src.split(rule).length - 1 !== 1) throw new Error("expected exactly one " + rule)
}

let out = src
  .replace(PLATE, ".fil0 {fill:#FFFFFF}")
  .replace(GLYPH, ".fil1 {fill:#0A0A0A}")
  .replace(
    "<!-- Creator: CorelDRAW -->",
    "<!-- Creator: CorelDRAW -->\n" +
      "<!-- Reversed colourway, for dark surfaces. Generated from dana-mark.svg\n" +
      "     by swapping the two fills; the geometry is byte-identical. Regenerate\n" +
      "     rather than edit. See docs/design/brand-mark.md (DES-127). -->",
  )

/* Everything except the two colour declarations and the added comment must be
   untouched. */
const strip = (s) =>
  s
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/#0A0A0A|#FFFFFF/g, "#")
    .replace(/\s+/g, " ")
    .trim()
if (strip(src) !== strip(out)) throw new Error("the two files differ by more than their fills")

fs.writeFileSync(outPath, out)
console.log("wrote " + outPath)
