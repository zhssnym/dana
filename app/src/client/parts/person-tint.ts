/*
A person's colour, decided once for the whole product.

The tint is deterministic, so one person is the same colour on every surface
and no surface owns another's copy. It introduces no new colour: these are
the identity row's hues and Shuffle's, the palettes a folder's mark draws from.

**Why this is a function of the person and not a column.** Nothing in section 4
gives a person a colour, and nothing should: a tint is recognition rather than
data, so it must be derivable by any surface holding the person: from their user
id, and from the name only on a surface that holds nothing else. A stored colour would need a write path, a default,
and a rule for two people who picked the same one.

**It lives in `parts/` for `identity-colors.ts`'s recorded reason.** No ramp
step is spelled outside `components/ui/` and no literal colour appears
anywhere under `components/` or `lib/`, so a palette
that must name swatches belongs beside the other one that does. Each value is
already held to 3:1 against both themes' page.
*/
import { IDENTITY_COLOR_FALLBACK, IDENTITY_COLORS, SHUFFLE_COLORS } from './identity-colors.js'

/**
 * The identity row's colours less its grey (a grey face reads as "unknown"),
 * then Shuffle's sixteen: 23 hues.
 *
 * Eight hues gave two people one face 1 time in 8, and a team of four a clash
 * more often than not (r6 audit S2). The wider spread makes a clash rare, and
 * `rosterTints` removes it inside a page, where the face is the first marker
 * of who is talking.
 */
const PERSON_TINTS = [
  ...IDENTITY_COLORS.filter(([name]) => name !== 'Grey').map(([, hex]) => hex),
  ...SHUFFLE_COLORS,
]

function tintSlot(key: string): number {
  let hash = 0
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) % 100000
  }
  return hash % PERSON_TINTS.length
}

/**
 * A person's colour, from the key their face is a function of: their user id
 * wherever the surface holds one, their display name only where it does not.
 * The id is the key because a name is not one person (two can share it, one
 * can change it), and a face that changed with a rename is two faces.
 */
export function personTint(key: string): string {
  return PERSON_TINTS[tintSlot(key)] ?? IDENTITY_COLOR_FALLBACK
}

/**
 * The tints for one page's roster, so no two of its members share a hue (r7).
 * Everyone keeps their own `personTint` unless someone earlier in id order
 * already wears that hue's family (blue and sky read as one colour at 24px);
 * then they take the next hue whose family is free, and past eight people any
 * hue nobody wears. The same roster always gives the same answer, and only a
 * clash moves anyone.
 */
export function rosterTints(ids: Iterable<string>): ReadonlyMap<string, string> {
  const takenSlots = new Set<number>()
  const takenFamilies = new Set<number>()
  const out = new Map<string, string>()
  const free = (slot: number, byFamily: boolean): boolean =>
    !takenSlots.has(slot) && (!byFamily || !takenFamilies.has(familyOf(slot)))
  for (const id of [...new Set(ids)].sort()) {
    const own = tintSlot(id)
    let slot = own
    for (const byFamily of [true, false]) {
      let step = 0
      while (step < PERSON_TINTS.length && !free((own + step) % PERSON_TINTS.length, byFamily)) step += 1
      if (step < PERSON_TINTS.length) {
        slot = (own + step) % PERSON_TINTS.length
        break
      }
    }
    takenSlots.add(slot)
    takenFamilies.add(familyOf(slot))
    out.set(id, PERSON_TINTS[slot] ?? IDENTITY_COLOR_FALLBACK)
  }
  return out
}

/* The eight families the 23 hues fall into, by eye. */
const HUE_FAMILIES: readonly (readonly string[])[] = [
  ['#e03e3e', '#c7254e', '#e46a50', '#c2551f'], // reds
  ['#e06a0c', '#c98100', '#a0643c'], // oranges
  ['#b08800', '#8a8f1c', '#6aa10f'], // yellows
  ['#2f9e44', '#22a06f', '#3d8b3d'], // greens
  ['#12a594', '#0f9fb8'], // teals
  ['#2f7fe0', '#1f9bd8', '#607d9b'], // blues
  ['#8b5cf6', '#5b5bd6', '#9a7ce6'], // purples
  ['#e0459a', '#c43fd6'], // pinks
]
function familyOf(slot: number): number {
  const hex = PERSON_TINTS[slot]?.toLowerCase() ?? ''
  const family = HUE_FAMILIES.findIndex((members) => members.includes(hex))
  return family === -1 ? HUE_FAMILIES.length + slot : family
}

/**
 * The values a person's default face is painted with, together, so no surface
 * mixes its own.
 *
 * The figure is the swatch at full strength and the ground is the same hue
 * washed back into the page's paper, so the disc stays quiet in a list while
 * still telling one person from another. Hair is the swatch pulled toward the
 * strongest ramp step, which is ink in light and paper-white in dark, so it
 * separates from the head in both colourways. Features are drawn in the
 * paper itself, which reads against the swatch whichever way the page flips.
 *
 * Computed here rather than in the component because they name ramp steps,
 * and ramp steps stay out of `components/`.
 */
export interface PersonFacePaint {
  readonly ink: string
  readonly ground: string
  readonly hair: string
  readonly paper: string
}

export function personFacePaint(key: string, tint?: string): PersonFacePaint {
  const ink = tint ?? personTint(key)
  return {
    ink,
    ground: `color-mix(in oklab, ${ink} 22%, var(--color-graphite-0))`,
    hair: `color-mix(in oklab, ${ink} 55%, var(--color-graphite-950))`,
    paper: 'var(--color-graphite-0)',
  }
}

/**
 * A person's name in their tint, for a surface that draws the name without
 * the face (a thread's chat feed). The swatch is held only to 3:1, too faint
 * for 12-14px text, so it is mixed into the page's own ink, which is dark in
 * light and light in dark: the hue stays, the text reads (4.5:1 or better).
 */
export function personNameInk(tint: string): string {
  return `color-mix(in oklab, ${tint} 60%, var(--foreground))`
}

/**
 * A second, independent spread over the name, for the face's shape (hair,
 * expression, glasses), so two people sharing a colour still differ in form.
 * FNV-1a, because the tint's hash is too small to split into more choices.
 */
export function personShapeSeed(key: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}
