/*
A person's colour, decided once for the whole product.

The designer's `person-face.tsx` states the rule and the reason: "the tint is
deterministic and comes from `task-model`, so one person is the same colour on
every surface and no surface owns another's copy. It introduces no new colour:
these are the ten folder swatches the tokens have carried since v1 (W1, one
palette serves the whole product)."

**Why this is a function of the name and not a column.** Nothing in section 4
gives a person a colour, and nothing should: a tint is recognition rather than
data, so it must be derivable by any surface holding a name, including the ones
that hold only a name, which the task row's assignee chip and the People
screen's roster both do. A stored colour would need a write path, a default,
and a rule for two people who picked the same one.

**It lives in `parts/` for `identity-colors.ts`'s recorded reason.** The S8
foundation test forbids a ramp step being spelled outside `components/ui/` and
forbids a literal colour anywhere under `components/` or `lib/`, so a palette
that must name swatches belongs beside the other one that does. The values are
token references and never hex: unlike a folder's colour, which is data on the
wire and must be a stable literal (4.3's CHECK), a person's tint is chosen by
this client at render time and should follow the viewer's colourway.

The hash is the prototype's own, transcribed rather than improved, because the
only property either version has to have is that it is the same everywhere and
spreads a roster over the ten.
*/

/**
 * The ten folder swatches, in the prototype's order.
 *
 * Graphite is deliberately not among them: it is what an *unset* identity
 * draws as (`identity-colors.ts`), and a person whose tint happened to land on
 * it would read as a person with no colour rather than as one with that one.
 */
const PERSON_TINTS = [
  '--color-folder-cobalt',
  '--color-folder-fern',
  '--color-folder-plum',
  '--color-folder-teal',
  '--color-folder-clay',
  '--color-folder-violet',
  '--color-folder-sky',
  '--color-folder-ochre',
  '--color-folder-rose',
  '--color-folder-olive',
] as const

export function personTint(name: string): string {
  let hash = 0
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 100000
  }
  return `var(${PERSON_TINTS[hash % PERSON_TINTS.length] ?? PERSON_TINTS[0]})`
}

/**
 * The two values a disc is painted with, together, so no surface mixes its own.
 *
 * The designer's rule, transcribed: "the swatch at reading strength for the
 * letters and the same hue washed back for the ground, so the disc stays quiet
 * in a list while still telling one person from another."
 *
 * The mix is computed here rather than in the component for the reason this
 * file exists: the ground names the page's own paper, which is a ramp step,
 * and the S8 foundation test keeps ramp steps out of `components/`.
 */
export function personFacePaint(name: string): { ink: string; ground: string } {
  const ink = personTint(name)
  return {
    ink,
    ground: `color-mix(in oklab, ${ink} 16%, var(--color-graphite-0))`,
  }
}
