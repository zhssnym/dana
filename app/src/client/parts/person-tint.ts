/*
A person's colour, decided once for the whole product.

The tint is deterministic, so one person is the same colour on every surface
and no surface owns another's copy. It introduces no new colour: these are
the identity row's eight, the palette a folder's mark already draws from.

**Why this is a function of the person and not a column.** Nothing in section 4
gives a person a colour, and nothing should: a tint is recognition rather than
data, so it must be derivable by any surface holding the person: from their user
id, and from the name only on a surface that holds nothing else. A stored colour would need a write path, a default,
and a rule for two people who picked the same one.

**It lives in `parts/` for `identity-colors.ts`'s recorded reason.** No ramp
step is spelled outside `components/ui/` and no literal colour appears
anywhere under `components/` or `lib/`, so a palette
that must name swatches belongs beside the other one that does. The values are
the identity row's hex, each already held to 3:1 against both themes' page.

The hash is the prototype's own, transcribed rather than improved, because the
only property either version has to have is that it is the same everywhere and
spreads a roster over the eight.
*/
import { IDENTITY_COLOR_FALLBACK, IDENTITY_COLORS } from './identity-colors.js'

/**
 * The identity row's eight colours (`identity-colors.ts`), the same eight a
 * folder's mark offers, so a person and a folder draw from one palette.
 *
 * Until 2026-09-24 this was the old ten folder swatches, whose muted greens and
 * blues read as one teal across a roster. The eight are distinct at a glance
 * and each holds 3:1 against both themes' page, which is the bar a face needs.
 */
const PERSON_TINTS = IDENTITY_COLORS.map(([, hex]) => hex)

/**
 * A person's colour, from the key their face is a function of: their user id
 * wherever the surface holds one, their display name only where it does not.
 * The id is the key because a name is not one person (two can share it, one
 * can change it), and a face that changed with a rename is two faces.
 */
export function personTint(key: string): string {
  let hash = 0
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) % 100000
  }
  return PERSON_TINTS[hash % PERSON_TINTS.length] ?? PERSON_TINTS[0] ?? IDENTITY_COLOR_FALLBACK
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

export function personFacePaint(key: string): PersonFacePaint {
  const ink = personTint(key)
  return {
    ink,
    ground: `color-mix(in oklab, ${ink} 22%, var(--color-graphite-0))`,
    hair: `color-mix(in oklab, ${ink} 55%, var(--color-graphite-950))`,
    paper: 'var(--color-graphite-0)',
  }
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
