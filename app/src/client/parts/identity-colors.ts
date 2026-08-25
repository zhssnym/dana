/*
The identity palette 4.3's colour column accepts from the picker: the ten
folder swatches plus graphite, as the hex their tokens hold in the light
colourway.

Hex rather than tokens, and here rather than in `components/`, both for
recorded reasons. The wire stores `#RRGGBB` (4.3's CHECK) and the identity
is shared, one value read by every member in every theme, so the write must
be a stable literal and never a `var()` whose meaning flips with the
viewer's colourway; 11.4 already records that a folder colour is data on
the wire, not a design token. And the S8 foundation test forbids literal
colours inside `components/**`, whose own precedent for a colour constant
that must be a value is `parts/presenters.ts`'s `DEFAULT_FOLDER_COLOR`, so
the palette lives beside it. Each row names the token it transcribes; a
drift between the two is an edit made in the wrong file.
*/
export const IDENTITY_COLORS: readonly [name: string, hex: string][] = [
  ['Graphite', '#1b1c20'], // the light colourway's graphite-900
  ['Clay', '#e55939'], // folder-clay
  ['Ochre', '#bd7a10'], // folder-ochre
  ['Olive', '#8b8b18'], // folder-olive
  ['Fern', '#289d3a'], // folder-fern
  ['Teal', '#189c8a'], // folder-teal
  ['Sky', '#1a92d1'], // folder-sky
  ['Cobalt', '#7b77f6'], // folder-cobalt
  ['Violet', '#9168ee'], // folder-violet
  ['Plum', '#d73bc0'], // folder-plum
  ['Rose', '#e5446d'], // folder-rose
]

/** What an unset identity colour draws as: the graphite the tokens mean. */
export const IDENTITY_COLOR_FALLBACK = '#1b1c20'
