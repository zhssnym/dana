/*
 * Mark colours as stored hex. The value is shared across members and themes, so it cannot be a `var()`. Each is
 * a mid-tone at 3:1 or better against both #ffffff and #191919. Literal colours are banned in `components/`.
 * Stored colours in neither list still draw as stored.
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

/** Shuffle's pool: distinct hues between the row's, never the row's own. */
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
