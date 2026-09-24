/*
The colours a page's mark can wear, as the hex 4.3's colour column stores.

Hex rather than tokens, and here rather than in `components/`, for recorded
reasons. The wire stores `#RRGGBB` (4.3's CHECK, `shared/folders.ts`'s
`hexColor`: any hex) and the identity is shared, one value read by every
member in every theme, so the write must be a stable literal and never a
`var()` whose meaning flips with the viewer's colourway. Literal colours are
forbidden inside `components/**`, so the palette lives here, beside
`presenters.ts`'s `DEFAULT_FOLDER_COLOR`.

**One value has to read in both themes.** The stored hex cannot flip with
the colourway, so every colour here is a mid-tone whose glyph holds at least
3:1 (the non-text contrast bar) against both the light page (#ffffff) and the
dark one (#191919). That is why yellow is a mustard and grey a middle grey: a
true yellow vanishes on white and a graphite on black.

**The row is eight famous colours, one line of the picker.** The ninth cell
is Shuffle, which draws from `SHUFFLE_COLORS`: sixteen hand-picked hues that
sit between the row's, each held to the same two-theme bar, so a press lands
on something distinctive rather than arbitrary RGB.

Colours a folder already stores that are in neither list (the old ten-swatch
palette, anything written over the API) still draw exactly as stored; the
picker shows them in the Shuffle cell as the current colour.
*/
export const IDENTITY_COLORS: readonly [name: string, hex: string][] = [
  ['Grey', '#8a8a8a'],
  ['Red', '#e03e3e'],
  ['Orange', '#e06a0c'],
  ['Yellow', '#b08800'],
  ['Green', '#2f9e44'],
  ['Blue', '#2f7fe0'],
  ['Purple', '#8b5cf6'],
  ['Pink', '#e0459a'],
]

/** Shuffle's pool: distinctive hues between the row's, never the row's own. */
export const SHUFFLE_COLORS: readonly string[] = [
  '#12a594', // teal
  '#5b5bd6', // indigo
  '#e46a50', // coral
  '#8a8f1c', // olive
  '#c43fd6', // magenta
  '#c98100', // amber
  '#1f9bd8', // sky
  '#22a06f', // mint
  '#c7254e', // crimson
  '#a0643c', // brown
  '#9a7ce6', // lavender
  '#c2551f', // rust
  '#3d8b3d', // forest
  '#607d9b', // slate
  '#6aa10f', // lime
  '#0f9fb8', // cyan
]

/** A Shuffle press: any pool colour but the one currently worn. */
export function shuffleColor(current: string | null, random = Math.random): string {
  const worn = current?.toLowerCase()
  const pool = SHUFFLE_COLORS.filter((hex) => hex !== worn)
  return pool[Math.floor(random() * pool.length)] ?? '#12a594'
}

/** What an unset identity colour draws as: the graphite the tokens mean. */
export const IDENTITY_COLOR_FALLBACK = 'var(--color-graphite-900)'
